import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AccessType, AccessStatus, Prisma } from '@prisma/client';
import { SystemWebhookService } from '../webhooks/system-webhook.service';

/** Role info for a default role that was just auto-assigned. */
export interface AssignedDefaultRole {
  id: string;
  name: string;
  slug: string;
}

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

    const applicationIds = freeSubscriptions.map((sub) => sub.applicationId);

    const result = await this.prisma.appAccess.createMany({
      data: applicationIds.map((applicationId) => ({
        userId,
        tenantId,
        applicationId,
        accessType: AccessType.AUTO_FREE,
        status: AccessStatus.ACTIVE,
        grantedById,
      })),
      skipDuplicates: true,
    });

    this.logger.log(`Auto-granted FREE access to ${result.count} apps for user ${userId}`);

    const assignedRoles = await this.assignDefaultRolesIfNone(this.prisma, tenantId, [userId], applicationIds);

    this.dispatchEventsInBackground(applicationIds, tenantId, userId, AccessType.AUTO_FREE, grantedById, assignedRoles);

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

    const applicationIds = tenantWideSubscriptions.map((sub) => sub.applicationId);

    const result = await this.prisma.appAccess.createMany({
      data: applicationIds.map((applicationId) => ({
        userId,
        tenantId,
        applicationId,
        accessType: AccessType.AUTO_TENANT,
        status: AccessStatus.ACTIVE,
        grantedById,
      })),
      skipDuplicates: true,
    });

    this.logger.log(`Auto-granted TENANT_WIDE access to ${result.count} apps for user ${userId}`);

    const assignedRoles = await this.assignDefaultRolesIfNone(this.prisma, tenantId, [userId], applicationIds);

    this.dispatchEventsInBackground(applicationIds, tenantId, userId, AccessType.AUTO_TENANT, grantedById, assignedRoles);

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

    const applicationIds = subscriptions.map((sub) => sub.applicationId);

    const result = await this.prisma.appAccess.createMany({
      data: applicationIds.map((applicationId) => ({
        userId: ownerId,
        tenantId,
        applicationId,
        accessType: AccessType.AUTO_OWNER,
        status: AccessStatus.ACTIVE,
      })),
      skipDuplicates: true,
    });

    this.logger.log(`Auto-granted OWNER access to ${result.count} apps for owner ${ownerId}`);

    const assignedRoles = await this.assignDefaultRolesIfNone(this.prisma, tenantId, [ownerId], applicationIds);

    this.dispatchEventsInBackground(applicationIds, tenantId, ownerId, AccessType.AUTO_OWNER, undefined, assignedRoles);

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

    const userIds = memberships.map((m) => m.userId);

    const result = await this.prisma.appAccess.createMany({
      data: userIds.map((userId) => ({
        userId,
        tenantId,
        applicationId,
        accessType,
        status: AccessStatus.ACTIVE,
      })),
      skipDuplicates: true,
    });

    this.logger.log(`Granted ${accessType} access to ${result.count} members for app ${applicationId}`);

    const assignedRoles = await this.assignDefaultRolesIfNone(this.prisma, tenantId, userIds, [applicationId]);

    this.dispatchEventsInBackground(
      userIds.map(() => applicationId),
      tenantId,
      userIds,
      accessType,
      undefined,
      assignedRoles,
    );

    return result.count;
  }

  /**
   * Assign each application's default role (Role.isDefault) to the given
   * users' memberships in this tenant - but ONLY where the membership has no
   * role for that application yet. Explicit/pre-existing roles always win;
   * apps without a default role are silently skipped (access without a role
   * is valid - matches previous behavior).
   *
   * Takes a Prisma client so callers running inside a transaction can join
   * it (pass the tx). Idempotent by construction.
   *
   * Returns the newly-assigned roles keyed by `${userId}:${applicationId}`
   * so callers can enrich their granted events.
   */
  async assignDefaultRolesIfNone(
    db: Prisma.TransactionClient,
    tenantId: string,
    userIds: string[],
    applicationIds: string[],
  ): Promise<Map<string, AssignedDefaultRole>> {
    const assigned = new Map<string, AssignedDefaultRole>();
    if (userIds.length === 0 || applicationIds.length === 0) return assigned;

    const defaultRoles = await db.role.findMany({
      where: { applicationId: { in: applicationIds }, isDefault: true },
      select: { id: true, name: true, slug: true, applicationId: true },
    });
    if (defaultRoles.length === 0) return assigned;

    // One default role per app (schema doesn't enforce uniqueness; first wins).
    const defaultByApp = new Map<string, (typeof defaultRoles)[number]>();
    for (const role of defaultRoles) {
      if (!defaultByApp.has(role.applicationId)) defaultByApp.set(role.applicationId, role);
    }

    const memberships = await db.membership.findMany({
      where: { tenantId, userId: { in: userIds } },
      select: { id: true, userId: true },
    });
    if (memberships.length === 0) return assigned;

    const existingRoles = await db.membershipRole.findMany({
      where: {
        membershipId: { in: memberships.map((m) => m.id) },
        role: { applicationId: { in: [...defaultByApp.keys()] } },
      },
      select: { membershipId: true, role: { select: { applicationId: true } } },
    });
    const hasAppRole = new Set(existingRoles.map((r) => `${r.membershipId}:${r.role.applicationId}`));

    const creates: { membershipId: string; roleId: string }[] = [];
    for (const membership of memberships) {
      for (const [applicationId, role] of defaultByApp) {
        if (hasAppRole.has(`${membership.id}:${applicationId}`)) continue;
        creates.push({ membershipId: membership.id, roleId: role.id });
        assigned.set(`${membership.userId}:${applicationId}`, { id: role.id, name: role.name, slug: role.slug });
      }
    }
    if (creates.length === 0) return assigned;

    await db.membershipRole.createMany({ data: creates, skipDuplicates: true });
    this.logger.log(`Assigned ${creates.length} default app role(s) in tenant ${tenantId}`);

    return assigned;
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
    assignedRoles?: Map<string, AssignedDefaultRole>,
  ): void {
    const users = Array.isArray(userIds) ? userIds : applicationIds.map(() => userIds);

    Promise.all(
      applicationIds.map((applicationId, idx) => {
        const userId = users[idx] || (userIds as string);
        return this.dispatchAccessGrantedEvent({
          tenantId,
          userId,
          applicationId,
          accessType,
          grantedById,
          role: assignedRoles?.get(`${userId}:${applicationId}`),
        }).catch((err) => {
          this.logger.warn(`Failed to dispatch app_access.granted event: ${err.message}`);
        });
      }),
    ).catch(() => { /* Intentionally swallow errors - event dispatch failure shouldn't break the flow */ });
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
    role?: AssignedDefaultRole;
  }): Promise<void> {
    const { tenantId, userId, applicationId, accessType, grantedById, role } = params;

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
      user_email: user?.email ?? undefined,
      application_id: applicationId,
      application_name: app?.name,
      application_slug: app?.slug,
      access_type: accessType,
      granted_by_id: grantedById,
      role_id: role?.id,
      role_name: role?.name,
      role_slug: role?.slug,
    });
  }
}
