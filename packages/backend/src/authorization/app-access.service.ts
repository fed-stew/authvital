import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AccessType, AccessStatus, Prisma } from '@prisma/client';
import { SystemWebhookService } from '../webhooks/system-webhook.service';
import { AppAccessAutoGrantService } from './app-access-auto-grant.service';
import {
  GrantAccessInput,
  RevokeAccessInput,
  BulkGrantAccessInput,
  AppAccessInfoInternal,
  AppAccessWithUserInternal,
  AccessCheckResult,
} from './types';

/**
 * AppAccessService - The Entitlement Engine 🎫
 *
 * Manages explicit access grants to applications.
 * Auto-grant operations are delegated to AppAccessAutoGrantService.
 */
@Injectable()
export class AppAccessService {
  private readonly logger = new Logger(AppAccessService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly systemWebhookService: SystemWebhookService,
    private readonly autoGrantService: AppAccessAutoGrantService,
  ) {}

  // ===========================================================================
  // GRANT ACCESS
  // ===========================================================================

  async grantAccess(input: GrantAccessInput): Promise<AppAccessInfoInternal> {
    const {
      tenantId, userId, applicationId,
      accessType = AccessType.GRANTED,
      grantedById, licenseAssignmentId,
    } = input;

    this.logger.log(`Granting ${accessType} access: user=${userId}, app=${applicationId}`);

    const existing = await this.prisma.appAccess.findUnique({
      where: { userId_tenantId_applicationId: { userId, tenantId, applicationId } },
    });

    if (existing) {
      if (existing.status === AccessStatus.REVOKED || existing.status === AccessStatus.SUSPENDED) {
        const reactivated = await this.prisma.appAccess.update({
          where: { id: existing.id },
          data: {
            status: AccessStatus.ACTIVE,
            accessType,
            grantedAt: new Date(),
            grantedById,
            revokedAt: null,
            revokedById: null,
            licenseAssignmentId,
          },
        });
        this.logger.log(`Reactivated access: ${reactivated.id}`);
        this.dispatchAccessGrantedEvent({ tenantId, userId, applicationId, accessType, grantedById, licenseAssignmentId });
        return reactivated;
      }
      if (licenseAssignmentId && existing.licenseAssignmentId !== licenseAssignmentId) {
        return this.prisma.appAccess.update({
          where: { id: existing.id },
          data: { licenseAssignmentId },
        });
      }
      return existing;
    }

    const accessRecord = await this.prisma.appAccess.create({
      data: { userId, tenantId, applicationId, accessType, status: AccessStatus.ACTIVE, grantedById, licenseAssignmentId },
    });

    this.logger.log(`Created access: ${accessRecord.id}`);
    this.dispatchAccessGrantedEvent({ tenantId, userId, applicationId, accessType, grantedById, licenseAssignmentId });

    return accessRecord;
  }

  async bulkGrantAccess(input: BulkGrantAccessInput): Promise<number> {
    const { tenantId, applicationId, userIds, accessType, grantedById } = input;
    if (userIds.length === 0) return 0;

    this.logger.log(`Bulk granting ${accessType} access to ${userIds.length} users`);

    const result = await this.prisma.appAccess.createMany({
      data: userIds.map((userId) => ({
        userId, tenantId, applicationId, accessType, status: AccessStatus.ACTIVE, grantedById,
      })),
      skipDuplicates: true,
    });

    this.logger.log(`Bulk created ${result.count} access records`);

    Promise.all(
      userIds.map((userId) =>
        this.dispatchAccessGrantedEvent({ tenantId, userId, applicationId, accessType, grantedById })
          .catch((err) => this.logger.warn(`Failed to dispatch event: ${err.message}`)),
      ),
    ).catch(() => {});

    return result.count;
  }

  // ===========================================================================
  // REVOKE ACCESS
  // ===========================================================================

  async revokeAccess(input: RevokeAccessInput): Promise<AppAccessInfoInternal> {
    const { tenantId, userId, applicationId, revokedById } = input;

    this.logger.log(`Revoking access: user=${userId}, app=${applicationId}`);

    const existing = await this.prisma.appAccess.findUnique({
      where: { userId_tenantId_applicationId: { userId, tenantId, applicationId } },
    });

    if (!existing) throw new NotFoundException('Access record not found');
    if (existing.status === AccessStatus.REVOKED) return existing;

    const revoked = await this.prisma.appAccess.update({
      where: { id: existing.id },
      data: { status: AccessStatus.REVOKED, revokedAt: new Date(), revokedById },
    });

    this.logger.log(`Revoked access: ${revoked.id}`);
    this.dispatchAccessRevokedEvent({ tenantId, userId, applicationId, revokedById });

    return revoked;
  }

  async bulkRevokeAccess(tenantId: string, applicationId: string, userIds: string[], revokedById?: string): Promise<number> {
    if (userIds.length === 0) return 0;

    const result = await this.prisma.appAccess.updateMany({
      where: { tenantId, applicationId, userId: { in: userIds }, status: AccessStatus.ACTIVE },
      data: { status: AccessStatus.REVOKED, revokedAt: new Date(), revokedById },
    });

    this.logger.log(`Bulk revoked ${result.count} access records`);

    Promise.all(
      userIds.map((userId) =>
        this.dispatchAccessRevokedEvent({ tenantId, userId, applicationId, revokedById })
          .catch((err) => this.logger.warn(`Failed to dispatch event: ${err.message}`)),
      ),
    ).catch(() => {});

    return result.count;
  }

  // ===========================================================================
  // CHECK ACCESS
  // ===========================================================================

  async hasAccess(tenantId: string, userId: string, applicationId: string): Promise<boolean> {
    const access = await this.prisma.appAccess.findUnique({
      where: { userId_tenantId_applicationId: { userId, tenantId, applicationId } },
      select: { status: true },
    });
    return access?.status === AccessStatus.ACTIVE;
  }

  async checkAccess(tenantId: string, userId: string, applicationId: string): Promise<AccessCheckResult> {
    const access = await this.prisma.appAccess.findUnique({
      where: { userId_tenantId_applicationId: { userId, tenantId, applicationId } },
    });

    if (!access) return { hasAccess: false, reason: 'No access granted. Contact your administrator.' };
    if (access.status === AccessStatus.REVOKED) return { hasAccess: false, accessType: access.accessType, status: access.status, reason: 'Access has been revoked.' };
    if (access.status === AccessStatus.SUSPENDED) return { hasAccess: false, accessType: access.accessType, status: access.status, reason: 'Access is suspended.' };

    return { hasAccess: true, accessType: access.accessType, status: access.status };
  }

  async checkAccessBulk(tenantId: string, userId: string, applicationIds: string[]): Promise<Record<string, AccessCheckResult>> {
    const accesses = await this.prisma.appAccess.findMany({
      where: { tenantId, userId, applicationId: { in: applicationIds } },
    });

    const accessMap = new Map(accesses.map((a) => [a.applicationId, a]));
    const result: Record<string, AccessCheckResult> = {};

    for (const appId of applicationIds) {
      const access = accessMap.get(appId);
      if (!access) {
        result[appId] = { hasAccess: false, reason: 'No access granted' };
      } else if (access.status !== AccessStatus.ACTIVE) {
        result[appId] = { hasAccess: false, accessType: access.accessType, status: access.status, reason: `Access is ${access.status.toLowerCase()}` };
      } else {
        result[appId] = { hasAccess: true, accessType: access.accessType, status: access.status };
      }
    }

    return result;
  }

  // ===========================================================================
  // LIST ACCESS
  // ===========================================================================

  async listAppAccess(tenantId: string, applicationId: string, includeRevoked = false): Promise<AppAccessWithUserInternal[]> {
    const where: Prisma.AppAccessWhereInput = { tenantId, applicationId };
    if (!includeRevoked) where.status = AccessStatus.ACTIVE;

    return this.prisma.appAccess.findMany({
      where,
      include: { user: { select: { id: true, email: true, givenName: true, familyName: true } } },
      orderBy: { grantedAt: 'desc' },
    });
  }

  async listUserAccess(tenantId: string, userId: string, includeRevoked = false): Promise<AppAccessInfoInternal[]> {
    const where: Prisma.AppAccessWhereInput = { tenantId, userId };
    if (!includeRevoked) where.status = AccessStatus.ACTIVE;

    return this.prisma.appAccess.findMany({ where, orderBy: { grantedAt: 'desc' } });
  }

  async countAppAccess(tenantId: string, applicationId: string): Promise<number> {
    return this.prisma.appAccess.count({ where: { tenantId, applicationId, status: AccessStatus.ACTIVE } });
  }

  // ===========================================================================
  // AUTO-GRANT HELPERS (Delegated)
  // ===========================================================================

  async autoGrantFreeApps(tenantId: string, userId: string, grantedById?: string): Promise<number> {
    return this.autoGrantService.autoGrantFreeApps(tenantId, userId, grantedById);
  }

  async autoGrantTenantWideApps(tenantId: string, userId: string, grantedById?: string): Promise<number> {
    return this.autoGrantService.autoGrantTenantWideApps(tenantId, userId, grantedById);
  }

  async autoGrantOwnerAccess(tenantId: string, ownerId: string): Promise<number> {
    return this.autoGrantService.autoGrantOwnerAccess(tenantId, ownerId);
  }

  async grantAccessToAllMembers(tenantId: string, applicationId: string, accessType: AccessType): Promise<number> {
    return this.autoGrantService.grantAccessToAllMembers(tenantId, applicationId, accessType);
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  private async dispatchAccessGrantedEvent(params: {
    tenantId: string; userId: string; applicationId: string; accessType: AccessType; grantedById?: string; licenseAssignmentId?: string;
  }): Promise<void> {
    const { tenantId, userId, applicationId, accessType, grantedById, licenseAssignmentId } = params;

    const [app, tenant, user] = await Promise.all([
      this.prisma.application.findUnique({ where: { id: applicationId }, select: { name: true, slug: true } }),
      this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { slug: true } }),
      this.prisma.user.findUnique({ where: { id: userId }, select: { email: true } }),
    ]);

    this.systemWebhookService.dispatch('tenant.app.granted', {
      tenant_id: tenantId,
      tenant_slug: tenant?.slug,
      user_id: userId,
      user_email: user?.email,
      application_id: applicationId,
      application_name: app?.name,
      application_slug: app?.slug,
      access_type: accessType,
      granted_by_id: grantedById,
      license_assignment_id: licenseAssignmentId,
    });
  }

  private async dispatchAccessRevokedEvent(params: {
    tenantId: string; userId: string; applicationId: string; revokedById?: string;
  }): Promise<void> {
    const { tenantId, userId, applicationId, revokedById } = params;

    const [app, tenant, user] = await Promise.all([
      this.prisma.application.findUnique({ where: { id: applicationId }, select: { slug: true } }),
      this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { slug: true } }),
      this.prisma.user.findUnique({ where: { id: userId }, select: { email: true } }),
    ]);

    this.systemWebhookService.dispatch('tenant.app.revoked', {
      tenant_id: tenantId,
      tenant_slug: tenant?.slug,
      user_id: userId,
      user_email: user?.email,
      application_id: applicationId,
      application_slug: app?.slug,
      revoked_by_id: revokedById,
    });
  }
}
