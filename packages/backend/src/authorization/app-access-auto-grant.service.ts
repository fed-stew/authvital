import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AccessType, AccessStatus } from '@prisma/client';
import { SystemWebhookService } from '../webhooks/system-webhook.service';

/**
 * AppAccessAutoGrantService - Automatic Access Granting 🤖
 *
 * Handles auto-granting access to applications based on:
 * - FREE app licensing mode
 * - TENANT_WIDE licensing mode
 * - Owner role
 * - New app subscriptions
 */
@Injectable()
export class AppAccessAutoGrantService {
  private readonly logger = new Logger(AppAccessAutoGrantService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly systemWebhookService: SystemWebhookService,
  ) {}

  /**
   * Auto-grant access to all FREE apps for a new member
   */
  async autoGrantFreeApps(tenantId: string, userId: string, grantedById?: string): Promise<number> {
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

    this.logger.log(`Auto-granted FREE access to ${result.count} apps for user ${userId}`);

    this.dispatchEventsInBackground(
      freeSubscriptions.map((sub) => sub.applicationId),
      tenantId,
      userId,
      AccessType.AUTO_FREE,
      grantedById,
    );

    return result.count;
  }

  /**
   * Auto-grant access to all TENANT_WIDE apps for a new member
   */
  async autoGrantTenantWideApps(tenantId: string, userId: string, grantedById?: string): Promise<number> {
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

    this.logger.log(`Auto-granted TENANT_WIDE access to ${result.count} apps for user ${userId}`);

    this.dispatchEventsInBackground(
      tenantWideSubscriptions.map((sub) => sub.applicationId),
      tenantId,
      userId,
      AccessType.AUTO_TENANT,
      grantedById,
    );

    return result.count;
  }

  /**
   * Auto-grant access to all apps for a tenant owner
   */
  async autoGrantOwnerAccess(tenantId: string, ownerId: string): Promise<number> {
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

    this.logger.log(`Auto-granted OWNER access to ${result.count} apps for owner ${ownerId}`);

    this.dispatchEventsInBackground(
      subscriptions.map((sub) => sub.applicationId),
      tenantId,
      ownerId,
      AccessType.AUTO_OWNER,
    );

    return result.count;
  }

  /**
   * Grant access to all current members when a new app subscription is created
   */
  async grantAccessToAllMembers(tenantId: string, applicationId: string, accessType: AccessType): Promise<number> {
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

    this.logger.log(`Granted ${accessType} access to ${result.count} members for app ${applicationId}`);

    this.dispatchEventsInBackground(
      memberships.map(() => applicationId),
      tenantId,
      memberships.map((m) => m.userId),
      accessType,
    );

    return result.count;
  }

  /**
   * Fire webhook events in background (fire and forget)
   */
  private dispatchEventsInBackground(
    applicationIds: string[],
    tenantId: string,
    userIds: string | string[],
    accessType: AccessType,
    grantedById?: string,
  ): void {
    const users = Array.isArray(userIds) ? userIds : applicationIds.map(() => userIds);

    Promise.all(
      applicationIds.map((applicationId, idx) =>
        this.dispatchAccessGrantedEvent({
          tenantId,
          userId: users[idx] || (userIds as string),
          applicationId,
          accessType,
          grantedById,
        }).catch((err) => {
          this.logger.warn(`Failed to dispatch app_access.granted event: ${err.message}`);
        }),
      ),
    ).catch(() => {});
  }

  /**
   * Dispatch tenant.app_access.granted event
   */
  private async dispatchAccessGrantedEvent(params: {
    tenantId: string;
    userId: string;
    applicationId: string;
    accessType: AccessType;
    grantedById?: string;
  }): Promise<void> {
    const { tenantId, userId, applicationId, accessType, grantedById } = params;

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
    });
  }
}
