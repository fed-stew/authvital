import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AccessType, AccessStatus, Prisma } from '@prisma/client';
import { SystemWebhookService } from '../webhooks/system-webhook.service';
import {
  GrantAccessInput,
  RevokeAccessInput,
  BulkGrantAccessInput,
  AppAccessInfo,
  AppAccessWithUser,
  AccessCheckResult,
} from './types';

/**
 * AppAccessService - The Entitlement Engine 🎫
 *
 * This service manages explicit access grants to applications.
 * Every user's access to every app is recorded here.
 *
 * Separate from:
 * - LicenseAssignment (seat consumption for PER_SEAT apps)
 * - MembershipRole (what permissions they have)
 */
@Injectable()
export class AppAccessService {
  private readonly logger = new Logger(AppAccessService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly systemWebhookService: SystemWebhookService,
  ) {}

  // ===========================================================================
  // GRANT ACCESS
  // ===========================================================================

  /**
   * Grant access to an application for a user
   * Creates an AppAccess record with ACTIVE status
   */
  async grantAccess(input: GrantAccessInput): Promise<AppAccessInfo> {
    const {
      tenantId,
      userId,
      applicationId,
      accessType = AccessType.GRANTED,
      grantedById,
      licenseAssignmentId,
    } = input;

    this.logger.log(
      `Granting ${accessType} access: user=${userId}, app=${applicationId}, tenant=${tenantId}`,
    );

    // Check if access already exists
    const existing = await this.prisma.appAccess.findUnique({
      where: {
        userId_tenantId_applicationId: { userId, tenantId, applicationId },
      },
    });

    let accessRecord: AppAccessInfo;
    let wasReactivated = false;

    if (existing) {
      // If revoked, reactivate it
      if (
        existing.status === AccessStatus.REVOKED ||
        existing.status === AccessStatus.SUSPENDED
      ) {
        accessRecord = await this.prisma.appAccess.update({
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
        wasReactivated = true;
        this.logger.log(`Reactivated access: ${accessRecord.id}`);
      } else {
        // Already active - update license assignment if needed
        if (
          licenseAssignmentId &&
          existing.licenseAssignmentId !== licenseAssignmentId
        ) {
          return this.prisma.appAccess.update({
            where: { id: existing.id },
            data: { licenseAssignmentId },
          });
        }
        return existing;
      }
    } else {
      // Create new access record
      accessRecord = await this.prisma.appAccess.create({
        data: {
          userId,
          tenantId,
          applicationId,
          accessType,
          status: AccessStatus.ACTIVE,
          grantedById,
          licenseAssignmentId,
        },
      });
      this.logger.log(`Created access: ${accessRecord.id}`);
    }

    // Fire webhook event (fire and forget)
    this.dispatchAccessGrantedEvent({
      tenantId,
      userId,
      applicationId,
      accessType,
      grantedById,
      licenseAssignmentId,
    }).catch((err) => {
      this.logger.warn(`Failed to dispatch app_access.granted event: ${err.message}`);
    });

    return accessRecord;
  }

  /**
   * Bulk grant access to multiple users at once
   */
  async bulkGrantAccess(input: BulkGrantAccessInput): Promise<number> {
    const { tenantId, applicationId, userIds, accessType, grantedById } = input;

    if (userIds.length === 0) return 0;

    this.logger.log(
      `Bulk granting ${accessType} access to ${userIds.length} users for app=${applicationId}`,
    );

    const result = await this.prisma.appAccess.createMany({
      data: userIds.map((userId) => ({
        userId,
        tenantId,
        applicationId,
        accessType,
        status: AccessStatus.ACTIVE,
        grantedById,
      })),
      skipDuplicates: true,
    });

    this.logger.log(`Bulk created ${result.count} access records`);

    // Fire webhook events for each user (fire and forget)
    // We dispatch events even if some were skipped due to duplicates
    Promise.all(
      userIds.map((userId) =>
        this.dispatchAccessGrantedEvent({
          tenantId,
          userId,
          applicationId,
          accessType,
          grantedById,
        }).catch((err) => {
          this.logger.warn(`Failed to dispatch app_access.granted event for user ${userId}: ${err.message}`);
        }),
      ),
    ).catch(() => {
      // Swallow aggregate errors
    });

    return result.count;
  }

  // ===========================================================================
  // REVOKE ACCESS
  // ===========================================================================

  /**
   * Revoke access to an application for a user
   */
  async revokeAccess(input: RevokeAccessInput): Promise<AppAccessInfo> {
    const { tenantId, userId, applicationId, revokedById } = input;

    this.logger.log(
      `Revoking access: user=${userId}, app=${applicationId}, tenant=${tenantId}`,
    );

    const existing = await this.prisma.appAccess.findUnique({
      where: {
        userId_tenantId_applicationId: { userId, tenantId, applicationId },
      },
    });

    if (!existing) {
      throw new NotFoundException('Access record not found');
    }

    if (existing.status === AccessStatus.REVOKED) {
      return existing;
    }

    const revoked = await this.prisma.appAccess.update({
      where: { id: existing.id },
      data: {
        status: AccessStatus.REVOKED,
        revokedAt: new Date(),
        revokedById,
      },
    });

    this.logger.log(`Revoked access: ${revoked.id}`);

    // Fire webhook event (fire and forget)
    this.dispatchAccessRevokedEvent({
      tenantId,
      userId,
      applicationId,
      revokedById,
    }).catch((err) => {
      this.logger.warn(`Failed to dispatch app_access.revoked event: ${err.message}`);
    });

    return revoked;
  }

  /**
   * Bulk revoke access for multiple users
   */
  async bulkRevokeAccess(
    tenantId: string,
    applicationId: string,
    userIds: string[],
    revokedById?: string,
  ): Promise<number> {
    if (userIds.length === 0) return 0;

    const result = await this.prisma.appAccess.updateMany({
      where: {
        tenantId,
        applicationId,
        userId: { in: userIds },
        status: AccessStatus.ACTIVE,
      },
      data: {
        status: AccessStatus.REVOKED,
        revokedAt: new Date(),
        revokedById,
      },
    });

    this.logger.log(`Bulk revoked ${result.count} access records`);

    // Fire webhook events for each user (fire and forget)
    Promise.all(
      userIds.map((userId) =>
        this.dispatchAccessRevokedEvent({
          tenantId,
          userId,
          applicationId,
          revokedById,
        }).catch((err) => {
          this.logger.warn(`Failed to dispatch app_access.revoked event for user ${userId}: ${err.message}`);
        }),
      ),
    ).catch(() => {
      // Swallow aggregate errors
    });

    return result.count;
  }

  // ===========================================================================
  // CHECK ACCESS
  // ===========================================================================

  /**
   * Check if a user has access to an application
   */
  async hasAccess(
    tenantId: string,
    userId: string,
    applicationId: string,
  ): Promise<boolean> {
    const access = await this.prisma.appAccess.findUnique({
      where: {
        userId_tenantId_applicationId: { userId, tenantId, applicationId },
      },
      select: { status: true },
    });

    return access?.status === AccessStatus.ACTIVE;
  }

  /**
   * Check access with full details
   */
  async checkAccess(
    tenantId: string,
    userId: string,
    applicationId: string,
  ): Promise<AccessCheckResult> {
    const access = await this.prisma.appAccess.findUnique({
      where: {
        userId_tenantId_applicationId: { userId, tenantId, applicationId },
      },
    });

    if (!access) {
      return {
        hasAccess: false,
        reason: 'No access granted. Contact your administrator.',
      };
    }

    if (access.status === AccessStatus.REVOKED) {
      return {
        hasAccess: false,
        accessType: access.accessType,
        status: access.status,
        reason: 'Access has been revoked.',
      };
    }

    if (access.status === AccessStatus.SUSPENDED) {
      return {
        hasAccess: false,
        accessType: access.accessType,
        status: access.status,
        reason: 'Access is suspended.',
      };
    }

    return {
      hasAccess: true,
      accessType: access.accessType,
      status: access.status,
    };
  }

  /**
   * Bulk check access for multiple apps
   */
  async checkAccessBulk(
    tenantId: string,
    userId: string,
    applicationIds: string[],
  ): Promise<Record<string, AccessCheckResult>> {
    const accesses = await this.prisma.appAccess.findMany({
      where: {
        tenantId,
        userId,
        applicationId: { in: applicationIds },
      },
    });

    const accessMap = new Map(accesses.map((a) => [a.applicationId, a]));

    const result: Record<string, AccessCheckResult> = {};
    for (const appId of applicationIds) {
      const access = accessMap.get(appId);
      if (!access) {
        result[appId] = { hasAccess: false, reason: 'No access granted' };
      } else if (access.status !== AccessStatus.ACTIVE) {
        result[appId] = {
          hasAccess: false,
          accessType: access.accessType,
          status: access.status,
          reason: `Access is ${access.status.toLowerCase()}`,
        };
      } else {
        result[appId] = {
          hasAccess: true,
          accessType: access.accessType,
          status: access.status,
        };
      }
    }

    return result;
  }

  // ===========================================================================
  // LIST ACCESS
  // ===========================================================================

  /**
   * List all users who have access to an application
   */
  async listAppAccess(
    tenantId: string,
    applicationId: string,
    includeRevoked = false,
  ): Promise<AppAccessWithUser[]> {
    const where: Prisma.AppAccessWhereInput = { tenantId, applicationId };
    if (!includeRevoked) {
      where.status = AccessStatus.ACTIVE;
    }

    return this.prisma.appAccess.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            givenName: true,
            familyName: true,
          },
        },
      },
      orderBy: { grantedAt: 'desc' },
    });
  }

  /**
   * List all apps a user has access to in a tenant
   */
  async listUserAccess(
    tenantId: string,
    userId: string,
    includeRevoked = false,
  ): Promise<AppAccessInfo[]> {
    const where: Prisma.AppAccessWhereInput = { tenantId, userId };
    if (!includeRevoked) {
      where.status = AccessStatus.ACTIVE;
    }

    return this.prisma.appAccess.findMany({
      where,
      orderBy: { grantedAt: 'desc' },
    });
  }

  /**
   * Count users with access to an application
   */
  async countAppAccess(tenantId: string, applicationId: string): Promise<number> {
    return this.prisma.appAccess.count({
      where: {
        tenantId,
        applicationId,
        status: AccessStatus.ACTIVE,
      },
    });
  }

  // ===========================================================================
  // AUTO-GRANT HELPERS
  // ===========================================================================

  /**
   * Auto-grant access to all FREE apps for a new member
   */
  async autoGrantFreeApps(
    tenantId: string,
    userId: string,
    grantedById?: string,
  ): Promise<number> {
    const freeSubscriptions = await this.prisma.appSubscription.findMany({
      where: {
        tenantId,
        status: { in: ['ACTIVE', 'TRIALING'] },
        application: { licensingMode: 'FREE' },
      },
      select: { applicationId: true },
    });

    if (freeSubscriptions.length === 0) return 0;

    const result = await this.prisma.appAccess.createMany({
      data: freeSubscriptions.map((sub) => ({
        userId,
        tenantId,
        applicationId: sub.applicationId,
        accessType: AccessType.AUTO_FREE,
        status: AccessStatus.ACTIVE,
        grantedById,
      })),
      skipDuplicates: true,
    });

    this.logger.log(
      `Auto-granted FREE access to ${result.count} apps for user ${userId}`,
    );

    // Fire webhook events for each app (fire and forget)
    Promise.all(
      freeSubscriptions.map((sub) =>
        this.dispatchAccessGrantedEvent({
          tenantId,
          userId,
          applicationId: sub.applicationId,
          accessType: AccessType.AUTO_FREE,
          grantedById,
        }).catch((err) => {
          this.logger.warn(`Failed to dispatch app_access.granted event: ${err.message}`);
        }),
      ),
    ).catch(() => {});

    return result.count;
  }

  /**
   * Auto-grant access to all TENANT_WIDE apps for a new member
   */
  async autoGrantTenantWideApps(
    tenantId: string,
    userId: string,
    grantedById?: string,
  ): Promise<number> {
    const tenantWideSubscriptions = await this.prisma.appSubscription.findMany({
      where: {
        tenantId,
        status: { in: ['ACTIVE', 'TRIALING'] },
        application: { licensingMode: 'TENANT_WIDE' },
      },
      select: { applicationId: true },
    });

    if (tenantWideSubscriptions.length === 0) return 0;

    const result = await this.prisma.appAccess.createMany({
      data: tenantWideSubscriptions.map((sub) => ({
        userId,
        tenantId,
        applicationId: sub.applicationId,
        accessType: AccessType.AUTO_TENANT,
        status: AccessStatus.ACTIVE,
        grantedById,
      })),
      skipDuplicates: true,
    });

    this.logger.log(
      `Auto-granted TENANT_WIDE access to ${result.count} apps for user ${userId}`,
    );

    // Fire webhook events for each app (fire and forget)
    Promise.all(
      tenantWideSubscriptions.map((sub) =>
        this.dispatchAccessGrantedEvent({
          tenantId,
          userId,
          applicationId: sub.applicationId,
          accessType: AccessType.AUTO_TENANT,
          grantedById,
        }).catch((err) => {
          this.logger.warn(`Failed to dispatch app_access.granted event: ${err.message}`);
        }),
      ),
    ).catch(() => {});

    return result.count;
  }

  /**
   * Auto-grant access to all apps for a tenant owner
   */
  async autoGrantOwnerAccess(
    tenantId: string,
    ownerId: string,
  ): Promise<number> {
    const subscriptions = await this.prisma.appSubscription.findMany({
      where: {
        tenantId,
        status: { in: ['ACTIVE', 'TRIALING'] },
      },
      select: { applicationId: true },
    });

    if (subscriptions.length === 0) return 0;

    const result = await this.prisma.appAccess.createMany({
      data: subscriptions.map((sub) => ({
        userId: ownerId,
        tenantId,
        applicationId: sub.applicationId,
        accessType: AccessType.AUTO_OWNER,
        status: AccessStatus.ACTIVE,
      })),
      skipDuplicates: true,
    });

    this.logger.log(
      `Auto-granted OWNER access to ${result.count} apps for owner ${ownerId}`,
    );

    // Fire webhook events for each app (fire and forget)
    Promise.all(
      subscriptions.map((sub) =>
        this.dispatchAccessGrantedEvent({
          tenantId,
          userId: ownerId,
          applicationId: sub.applicationId,
          accessType: AccessType.AUTO_OWNER,
        }).catch((err) => {
          this.logger.warn(`Failed to dispatch app_access.granted event: ${err.message}`);
        }),
      ),
    ).catch(() => {});

    return result.count;
  }

  /**
   * Grant access to all current members when a new app subscription is created
   */
  async grantAccessToAllMembers(
    tenantId: string,
    applicationId: string,
    accessType: AccessType,
  ): Promise<number> {
    const memberships = await this.prisma.membership.findMany({
      where: { tenantId, status: 'ACTIVE' },
      select: { userId: true },
    });

    if (memberships.length === 0) return 0;

    const result = await this.prisma.appAccess.createMany({
      data: memberships.map((m) => ({
        userId: m.userId,
        tenantId,
        applicationId,
        accessType,
        status: AccessStatus.ACTIVE,
      })),
      skipDuplicates: true,
    });

    this.logger.log(
      `Granted ${accessType} access to ${result.count} members for app ${applicationId}`,
    );

    // Fire webhook events for each member (fire and forget)
    Promise.all(
      memberships.map((m) =>
        this.dispatchAccessGrantedEvent({
          tenantId,
          userId: m.userId,
          applicationId,
          accessType,
        }).catch((err) => {
          this.logger.warn(`Failed to dispatch app_access.granted event: ${err.message}`);
        }),
      ),
    ).catch(() => {});

    return result.count;
  }

  // ===========================================================================
  // PRIVATE HELPERS - WEBHOOK DISPATCH
  // ===========================================================================

  /**
   * Dispatch tenant.app_access.granted event
   */
  private async dispatchAccessGrantedEvent(params: {
    tenantId: string;
    userId: string;
    applicationId: string;
    accessType: AccessType;
    grantedById?: string;
    licenseAssignmentId?: string;
  }): Promise<void> {
    const { tenantId, userId, applicationId, accessType, grantedById, licenseAssignmentId } = params;

    // Fetch details for the event payload
    const [app, tenant, user] = await Promise.all([
      this.prisma.application.findUnique({
        where: { id: applicationId },
        select: { name: true, slug: true },
      }),
      this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { slug: true },
      }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { email: true },
      }),
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

  /**
   * Dispatch tenant.app_access.revoked event
   */
  private async dispatchAccessRevokedEvent(params: {
    tenantId: string;
    userId: string;
    applicationId: string;
    revokedById?: string;
  }): Promise<void> {
    const { tenantId, userId, applicationId, revokedById } = params;

    // Fetch details for the event payload
    const [app, tenant, user] = await Promise.all([
      this.prisma.application.findUnique({
        where: { id: applicationId },
        select: { slug: true },
      }),
      this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { slug: true },
      }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { email: true },
      }),
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
