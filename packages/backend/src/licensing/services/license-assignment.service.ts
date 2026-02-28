import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessType } from '@prisma/client';
import { AppAccessService } from '../../authorization';
import { LicensePoolService } from './license-pool.service';
import { SyncEventService, SYNC_EVENT_TYPES } from '../../sync';
import {
  GrantLicenseInput,
  RevokeLicenseInput,
  ChangeLicenseTypeInput,
  LicenseAssignmentInternal,
  NoSeatsAvailableError,
  UserAlreadyHasLicenseError,
  LicenseTypeFeatures,
  MemberWithLicensesInternal,
} from '../types';

/**
 * LicenseAssignmentService - The Gatekeeper 🔐
 *
 * Manages the explicit assignment of licenses to users.
 * Bulk operations are in LicenseAssignmentBulkService.
 */
@Injectable()
export class LicenseAssignmentService {
  private readonly logger = new Logger(LicenseAssignmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly licensePoolService: LicensePoolService,
    private readonly appAccessService: AppAccessService,
    private readonly syncEventService: SyncEventService,
  ) {}

  async grantLicense(input: GrantLicenseInput): Promise<LicenseAssignmentInternal> {
    const { tenantId, userId, applicationId, licenseTypeId, assignedById } = input;

    const existingLicense = await this.prisma.licenseAssignment.findUnique({
      where: { tenantId_userId_applicationId: { tenantId, userId, applicationId } },
      include: { subscription: { include: { licenseType: true } } },
    });

    if (existingLicense) {
      throw new UserAlreadyHasLicenseError(
        tenantId, userId, applicationId, existingLicense.subscription.licenseType.slug,
      );
    }

    const subscription = await this.prisma.appSubscription.findUnique({
      where: { tenantId_applicationId_licenseTypeId: { tenantId, applicationId, licenseTypeId } },
      include: { licenseType: true },
    });

    if (!subscription) {
      throw new NotFoundException('No subscription found for this app/license type.');
    }

    const availableSeats = subscription.quantityPurchased - subscription.quantityAssigned;
    if (availableSeats <= 0) {
      throw new NoSeatsAvailableError(
        tenantId, applicationId, licenseTypeId,
        subscription.quantityPurchased, subscription.quantityAssigned,
      );
    }

    const assignment = await this.prisma.$transaction(async (tx) => {
      const currentAssigned = subscription.quantityAssigned;

      const updateResult = await tx.appSubscription.updateMany({
        where: {
          id: subscription.id,
          quantityAssigned: currentAssigned,
          quantityPurchased: { gt: currentAssigned },
        },
        data: { quantityAssigned: { increment: 1 } },
      });

      if (updateResult.count === 0) {
        throw new NoSeatsAvailableError(
          tenantId, applicationId, licenseTypeId,
          subscription.quantityPurchased, subscription.quantityAssigned,
        );
      }

      return tx.licenseAssignment.create({
        data: {
          userId, tenantId, applicationId,
          subscriptionId: subscription.id,
          licenseTypeId: subscription.licenseTypeId,
          licenseTypeName: subscription.licenseType.name,
          assignedById,
        },
        include: { subscription: { include: { licenseType: true } } },
      });
    });

    await this.appAccessService.grantAccess({
      tenantId, userId, applicationId,
      accessType: AccessType.GRANTED,
      grantedById: assignedById,
      licenseAssignmentId: assignment.id,
    });

    await this.createAuditLog('GRANTED', assignment, subscription, assignedById);

    return this.toAssignmentInfo(assignment);
  }

  async revokeLicense(input: RevokeLicenseInput): Promise<void> {
    const { tenantId, userId, applicationId } = input;

    const assignment = await this.prisma.licenseAssignment.findUnique({
      where: { tenantId_userId_applicationId: { tenantId, userId, applicationId } },
    });

    if (!assignment) {
      throw new NotFoundException('User does not have a license for this application');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.licenseAssignment.delete({ where: { id: assignment.id } });
      await tx.appSubscription.updateMany({
        where: { id: assignment.subscriptionId, quantityAssigned: { gt: 0 } },
        data: { quantityAssigned: { decrement: 1 } },
      });
    });

    await this.appAccessService.revokeAccess({ tenantId, userId, applicationId });

    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    this.syncEventService
      .emit(SYNC_EVENT_TYPES.APP_ACCESS_REVOKED, tenantId, applicationId, {
        sub: userId,
        email: user?.email,
        given_name: user?.givenName,
        family_name: user?.familyName,
        license_type_id: assignment.licenseTypeId,
        license_type_name: assignment.licenseTypeName,
      })
      .catch((err) => this.logger.warn(`Failed to emit app_access.revoked: ${err.message}`));

    await this.createRevokeAuditLog(tenantId, userId, applicationId, assignment);
  }

  async changeLicenseType(input: ChangeLicenseTypeInput): Promise<LicenseAssignmentInternal> {
    const { tenantId, userId, applicationId, newLicenseTypeId, assignedById } = input;

    const currentAssignment = await this.prisma.licenseAssignment.findUnique({
      where: { tenantId_userId_applicationId: { tenantId, userId, applicationId } },
      include: { subscription: { include: { licenseType: true } } },
    });

    if (!currentAssignment) {
      throw new NotFoundException('User does not have a license to change');
    }

    if (currentAssignment.subscription.licenseTypeId === newLicenseTypeId) {
      throw new BadRequestException('User is already on this license type');
    }

    const newSubscription = await this.prisma.appSubscription.findUnique({
      where: { tenantId_applicationId_licenseTypeId: { tenantId, applicationId, licenseTypeId: newLicenseTypeId } },
      include: { licenseType: true },
    });

    if (!newSubscription) {
      throw new NotFoundException('Tenant doesn\'t have a subscription for the new license type.');
    }

    if (newSubscription.quantityAssigned >= newSubscription.quantityPurchased) {
      throw new NoSeatsAvailableError(
        tenantId, applicationId, newLicenseTypeId,
        newSubscription.quantityPurchased, newSubscription.quantityAssigned,
      );
    }

    const newAssignment = await this.prisma.$transaction(async (tx) => {
      await tx.appSubscription.updateMany({
        where: { id: currentAssignment.subscriptionId, quantityAssigned: { gt: 0 } },
        data: { quantityAssigned: { decrement: 1 } },
      });

      const currentNewAssigned = newSubscription.quantityAssigned;
      const updateResult = await tx.appSubscription.updateMany({
        where: {
          id: newSubscription.id,
          quantityAssigned: currentNewAssigned,
          quantityPurchased: { gt: currentNewAssigned },
        },
        data: { quantityAssigned: { increment: 1 } },
      });

      if (updateResult.count === 0) {
        throw new NoSeatsAvailableError(
          tenantId, applicationId, newLicenseTypeId,
          newSubscription.quantityPurchased, newSubscription.quantityAssigned,
        );
      }

      return tx.licenseAssignment.update({
        where: { id: currentAssignment.id },
        data: {
          subscriptionId: newSubscription.id,
          licenseTypeId: newSubscription.licenseTypeId,
          licenseTypeName: newSubscription.licenseType.name,
          assignedById,
          assignedAt: new Date(),
        },
        include: { subscription: { include: { licenseType: true } } },
      });
    });

    await this.createChangeAuditLog(newAssignment, newSubscription, currentAssignment, assignedById);

    return this.toAssignmentInfo(newAssignment);
  }

  // ===========================================================================
  // QUERY OPERATIONS
  // ===========================================================================

  async getUserLicenses(tenantId: string, userId: string): Promise<LicenseAssignmentInternal[]> {
    const assignments = await this.prisma.licenseAssignment.findMany({
      where: { tenantId, userId },
      include: {
        subscription: {
          include: {
            licenseType: true,
            application: { select: { id: true, name: true, slug: true } },
          },
        },
      },
    });
    return assignments.map(this.toAssignmentInfo);
  }

  async getSubscriptionAssignments(subscriptionId: string): Promise<LicenseAssignmentInternal[]> {
    const assignments = await this.prisma.licenseAssignment.findMany({
      where: { subscriptionId },
      include: { subscription: { include: { licenseType: true } } },
      orderBy: { assignedAt: 'desc' },
    });
    return assignments.map(this.toAssignmentInfo);
  }

  async getAppLicenseHolders(tenantId: string, applicationId: string): Promise<LicenseAssignmentInternal[]> {
    const assignments = await this.prisma.licenseAssignment.findMany({
      where: { tenantId, applicationId },
      include: { subscription: { include: { licenseType: true } } },
      orderBy: { assignedAt: 'desc' },
    });
    return assignments.map(this.toAssignmentInfo);
  }

  async getTenantMembersWithLicenses(tenantId: string): Promise<MemberWithLicensesInternal[]> {
    const memberships = await this.prisma.membership.findMany({
      where: { tenantId },
      include: {
        user: { select: { id: true, email: true, givenName: true, familyName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const assignments = await this.prisma.licenseAssignment.findMany({
      where: { tenantId },
      include: { subscription: { include: { licenseType: true, application: true } } },
      orderBy: { assignedAt: 'desc' },
    });

    const assignmentsByUser = new Map<string, typeof assignments>();
    for (const assignment of assignments) {
      if (!assignmentsByUser.has(assignment.userId)) {
        assignmentsByUser.set(assignment.userId, []);
      }
      assignmentsByUser.get(assignment.userId)!.push(assignment);
    }

    return memberships.map((membership) => {
      const userAssignments = assignmentsByUser.get(membership.userId) || [];
      return {
        user: membership.user,
        membership: { id: membership.id, status: membership.status as 'ACTIVE' | 'INVITED' | 'SUSPENDED' },
        licenses: userAssignments.map((a) => ({
          id: a.id,
          applicationId: a.applicationId,
          applicationName: a.subscription.application.name,
          licenseTypeId: a.licenseTypeId,
          licenseTypeName: a.subscription.licenseType.name,
          licenseTypeSlug: a.subscription.licenseType.slug,
          assignedAt: a.assignedAt,
        })),
      };
    });
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  private toAssignmentInfo(assignment: {
    id: string;
    userId: string;
    applicationId: string;
    assignedAt: Date;
    assignedById: string | null;
    subscription: { licenseTypeId: string; licenseType: { name: string; slug: string; features: unknown } };
  }): LicenseAssignmentInternal {
    return {
      id: assignment.id,
      userId: assignment.userId,
      applicationId: assignment.applicationId,
      licenseTypeId: assignment.subscription.licenseTypeId,
      licenseTypeName: assignment.subscription.licenseType.name,
      licenseTypeSlug: assignment.subscription.licenseType.slug,
      features: (assignment.subscription.licenseType.features as LicenseTypeFeatures) || {},
      assignedAt: assignment.assignedAt,
      assignedById: assignment.assignedById ?? undefined,
    };
  }

  private async createAuditLog(action: 'GRANTED' | 'REVOKED' | 'CHANGED', assignment: any, subscription: any, assignedById?: string) {
    try {
      const [user, application, assignedBy] = await Promise.all([
        this.prisma.user.findUnique({ where: { id: assignment.userId } }),
        this.prisma.application.findUnique({ where: { id: assignment.applicationId } }),
        assignedById ? this.prisma.user.findUnique({ where: { id: assignedById } }) : null,
      ]);

      await this.prisma.licenseAuditLog.create({
        data: {
          tenantId: assignment.tenantId,
          userId: assignment.userId,
          userEmail: user?.email || '',
          userName: user?.givenName && user?.familyName ? `${user.givenName} ${user.familyName}` : undefined,
          applicationId: assignment.applicationId,
          applicationName: application?.name || '',
          licenseTypeId: subscription.licenseTypeId,
          licenseTypeName: subscription.licenseType.name,
          action,
          performedBy: assignedById || '',
          performedByEmail: assignedBy?.email || '',
          performedByName: assignedBy?.givenName && assignedBy?.familyName
            ? `${assignedBy.givenName} ${assignedBy.familyName}` : undefined,
        },
      });
    } catch (err) {
      console.error('Failed to create audit log:', err);
    }
  }

  private async createRevokeAuditLog(tenantId: string, userId: string, applicationId: string, assignment: any) {
    try {
      const [user, application] = await Promise.all([
        this.prisma.user.findUnique({ where: { id: userId } }),
        this.prisma.application.findUnique({ where: { id: applicationId } }),
      ]);

      await this.prisma.licenseAuditLog.create({
        data: {
          tenantId, userId, applicationId,
          userEmail: user?.email || '',
          userName: user?.givenName && user?.familyName ? `${user.givenName} ${user.familyName}` : undefined,
          applicationName: application?.name || '',
          licenseTypeId: assignment.licenseTypeId,
          licenseTypeName: assignment.licenseTypeName,
          action: 'REVOKED',
          performedBy: '',
          performedByEmail: '',
        },
      });
    } catch (err) {
      console.error('Failed to create revoke audit log:', err);
    }
  }

  private async createChangeAuditLog(newAssignment: any, newSubscription: any, currentAssignment: any, assignedById?: string) {
    try {
      const [user, application, assignedBy] = await Promise.all([
        this.prisma.user.findUnique({ where: { id: newAssignment.userId } }),
        this.prisma.application.findUnique({ where: { id: newAssignment.applicationId } }),
        assignedById ? this.prisma.user.findUnique({ where: { id: assignedById } }) : null,
      ]);

      await this.prisma.licenseAuditLog.create({
        data: {
          tenantId: newAssignment.tenantId,
          userId: newAssignment.userId,
          userEmail: user?.email || '',
          userName: user?.givenName && user?.familyName ? `${user.givenName} ${user.familyName}` : undefined,
          applicationId: newAssignment.applicationId,
          applicationName: application?.name || '',
          licenseTypeId: newSubscription.licenseTypeId,
          licenseTypeName: newSubscription.licenseType.name,
          previousLicenseTypeName: currentAssignment.licenseTypeName,
          action: 'CHANGED',
          performedBy: assignedById || '',
          performedByEmail: assignedBy?.email || '',
          performedByName: assignedBy?.givenName && assignedBy?.familyName
            ? `${assignedBy.givenName} ${assignedBy.familyName}` : undefined,
        },
      });
    } catch (err) {
      console.error('Failed to create change audit log:', err);
    }
  }
}
