import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AppAccessService } from '../../authorization';
import { SyncEventService, SYNC_EVENT_TYPES } from '../../sync';
import { GrantLicenseInput, RevokeLicenseInput } from '../types';
import { LicenseAssignmentService } from './license-assignment.service';

/**
 * Handles bulk license assignment operations.
 * Separated from LicenseAssignmentService for maintainability.
 */
@Injectable()
export class LicenseAssignmentBulkService {
  private readonly logger = new Logger(LicenseAssignmentBulkService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly assignmentService: LicenseAssignmentService,
    private readonly appAccessService: AppAccessService,
    private readonly syncEventService: SyncEventService,
  ) {}

  /**
   * Revoke all licenses for a user when they're removed from a tenant
   */
  async revokeAllUserLicenses(tenantId: string, userId: string): Promise<number> {
    const assignments = await this.prisma.licenseAssignment.findMany({
      where: { tenantId, userId },
      select: { id: true, subscriptionId: true },
    });

    if (assignments.length === 0) return 0;

    await this.prisma.$transaction(async (tx) => {
      await tx.licenseAssignment.deleteMany({ where: { tenantId, userId } });

      for (const assignment of assignments) {
        await tx.appSubscription.updateMany({
          where: { id: assignment.subscriptionId, quantityAssigned: { gt: 0 } },
          data: { quantityAssigned: { decrement: 1 } },
        });
      }
    });

    // Revoke all AppAccess records
    const userAccesses = await this.prisma.appAccess.findMany({
      where: { tenantId, userId },
      select: { applicationId: true },
    });

    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    for (const access of userAccesses) {
      await this.appAccessService.revokeAccess({
        tenantId,
        userId,
        applicationId: access.applicationId,
      });

      this.syncEventService
        .emit(SYNC_EVENT_TYPES.APP_ACCESS_REVOKED, tenantId, access.applicationId, {
          sub: userId,
          email: user?.email,
          given_name: user?.givenName,
          family_name: user?.familyName,
        })
        .catch((err) =>
          this.logger.warn(`Failed to emit app_access.revoked for app ${access.applicationId}: ${err.message}`),
        );
    }

    return assignments.length;
  }

  /**
   * Grant licenses to multiple users in bulk
   */
  async grantLicensesBulk(
    assignments: GrantLicenseInput[],
  ): Promise<Array<{ userId: string; applicationId: string; success: boolean; error?: string }>> {
    const results = await Promise.allSettled(
      assignments.map(async (assignment) => {
        try {
          await this.assignmentService.grantLicense(assignment);
          return { userId: assignment.userId, applicationId: assignment.applicationId, success: true };
        } catch (error) {
          return {
            userId: assignment.userId,
            applicationId: assignment.applicationId,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      }),
    );

    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      }
      return {
        userId: assignments[index].userId,
        applicationId: assignments[index].applicationId,
        success: false,
        error: 'Unknown error',
      };
    });
  }

  /**
   * Revoke licenses from multiple users in bulk
   */
  async revokeLicensesBulk(
    revocations: RevokeLicenseInput[],
  ): Promise<{ revokedCount: number; failures: Array<{ userId: string; applicationId: string; error: string }> }> {
    const failures: Array<{ userId: string; applicationId: string; error: string }> = [];
    let revokedCount = 0;

    for (const revocation of revocations) {
      try {
        await this.assignmentService.revokeLicense(revocation);
        revokedCount++;
      } catch (error) {
        failures.push({
          userId: revocation.userId,
          applicationId: revocation.applicationId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return { revokedCount, failures };
  }
}
