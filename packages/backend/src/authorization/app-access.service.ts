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
    const accessType = input.accessType ?? AccessType.GRANTED;
    this.logger.log(`Granting ${accessType} access: user=${input.userId}, app=${input.applicationId}`);

    const { record, shouldDispatch } = await this.grantAccessTx(this.prisma, input);

    if (shouldDispatch) {
      this.dispatchAccessGrantedEvent({
        tenantId: input.tenantId,
        userId: input.userId,
        applicationId: input.applicationId,
        accessType,
        grantedById: input.grantedById,
        licenseAssignmentId: input.licenseAssignmentId,
      }).catch((err) => this.logger.warn(`Failed to dispatch tenant.app.granted: ${err.message}`));
    }

    return record;
  }

  /**
   * Grant access inside a CALLER-MANAGED transaction. DB write ONLY.
   * The caller MUST dispatch the granted event AFTER the txn commits (using the
   * returned `shouldDispatch`) so we never emit phantom events on a rollback.
   */
  async grantAccessTx(
    tx: Prisma.TransactionClient,
    input: GrantAccessInput,
  ): Promise<{ record: AppAccessInfoInternal; shouldDispatch: boolean }> {
    const outcome = await this.writeAccessGrant(tx, input);

    // Opt-in default role assignment. Joins the caller's tx so a rollback
    // never leaves an orphaned MembershipRole. Idempotent: existing roles
    // (explicit or otherwise) always win; no default role configured = no-op.
    if (input.assignDefaultRole) {
      await this.autoGrantService.assignDefaultRolesIfNone(
        tx,
        input.tenantId,
        [input.userId],
        [input.applicationId],
      );
    }

    return outcome;
  }

  private async writeAccessGrant(
    tx: Prisma.TransactionClient,
    input: GrantAccessInput,
  ): Promise<{ record: AppAccessInfoInternal; shouldDispatch: boolean }> {
    const {
      tenantId, userId, applicationId,
      accessType = AccessType.GRANTED,
      grantedById, licenseAssignmentId,
    } = input;

    const existing = await tx.appAccess.findUnique({
      where: { userId_tenantId_applicationId: { userId, tenantId, applicationId } },
    });

    if (existing) {
      if (existing.status === AccessStatus.REVOKED || existing.status === AccessStatus.SUSPENDED) {
        const reactivated = await tx.appAccess.update({
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
        return { record: reactivated, shouldDispatch: true };
      }
      if (licenseAssignmentId && existing.licenseAssignmentId !== licenseAssignmentId) {
        const relinked = await tx.appAccess.update({
          where: { id: existing.id },
          data: { licenseAssignmentId },
        });
        return { record: relinked, shouldDispatch: false };
      }
      return { record: existing, shouldDispatch: false };
    }

    const created = await tx.appAccess.create({
      data: { userId, tenantId, applicationId, accessType, status: AccessStatus.ACTIVE, grantedById, licenseAssignmentId },
    });

    return { record: created, shouldDispatch: true };
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
    ).catch(() => { /* Intentionally swallow errors - event dispatch failure shouldn't break the flow */ });

    return result.count;
  }

  // ===========================================================================
  // REVOKE ACCESS
  // ===========================================================================

  async revokeAccess(input: RevokeAccessInput): Promise<AppAccessInfoInternal> {
    this.logger.log(`Revoking access: user=${input.userId}, app=${input.applicationId}`);

    const { record, shouldDispatch } = await this.revokeAccessTx(this.prisma, input);
    if (!record) throw new NotFoundException('Access record not found');

    if (shouldDispatch) {
      this.dispatchAccessRevokedEvent({
        tenantId: input.tenantId,
        userId: input.userId,
        applicationId: input.applicationId,
        revokedById: input.revokedById,
      }).catch((err) => this.logger.warn(`Failed to dispatch tenant.app.revoked: ${err.message}`));
    }

    return record;
  }

  /**
   * Revoke access inside a CALLER-MANAGED transaction. DB write ONLY. Returns
   * `record: null` when there was nothing to revoke (caller decides whether
   * that's an error). Caller MUST dispatch the revoked event post-commit.
   */
  async revokeAccessTx(
    tx: Prisma.TransactionClient,
    input: RevokeAccessInput,
  ): Promise<{ record: AppAccessInfoInternal | null; shouldDispatch: boolean }> {
    const { tenantId, userId, applicationId, revokedById } = input;

    const existing = await tx.appAccess.findUnique({
      where: { userId_tenantId_applicationId: { userId, tenantId, applicationId } },
    });

    if (!existing) return { record: null, shouldDispatch: false };
    if (existing.status === AccessStatus.REVOKED) return { record: existing, shouldDispatch: false };

    const revoked = await tx.appAccess.update({
      where: { id: existing.id },
      data: { status: AccessStatus.REVOKED, revokedAt: new Date(), revokedById },
    });

    return { record: revoked, shouldDispatch: true };
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
    ).catch(() => { /* Intentionally swallow errors - event dispatch failure shouldn't break the flow */ });

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
  // ACCESS MATRIX (members x apps in one shot)
  // ===========================================================================

  /**
   * Build the members x apps access grid for a tenant in a SINGLE call, so the
   * frontend matrix page can render without N per-app requests.
   *
   * The app set is the tenant's *relevant* apps: any app it has a subscription
   * for OR any app that already has an access grant in this tenant. For each
   * (member, app) cell we surface: hasAccess, the app-scoped role (if any) and
   * the license type (if a seat is assigned).
   *
   * Tenant-scoped throughout: every query is filtered by tenantId (supplied by
   * the caller from the authenticated context).
   */
  async getAccessMatrix(tenantId: string) {
    // 1. Members (active + invited).
    const memberships = await this.prisma.membership.findMany({
      where: { tenantId, status: { in: ['ACTIVE', 'INVITED'] } },
      include: {
        user: { select: { id: true, email: true, givenName: true, familyName: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    // 2. Determine the relevant app set (subscriptions + existing access).
    const [subs, accessRows, roleRows, licenseRows] = await Promise.all([
      this.prisma.appSubscription.findMany({
        where: { tenantId },
        select: { applicationId: true },
      }),
      this.prisma.appAccess.findMany({
        where: { tenantId },
        select: { userId: true, applicationId: true, status: true },
      }),
      this.prisma.membershipRole.findMany({
        where: { membership: { tenantId } },
        select: {
          membershipId: true,
          role: { select: { name: true, applicationId: true } },
        },
      }),
      this.prisma.licenseAssignment.findMany({
        where: { tenantId },
        select: { userId: true, applicationId: true, licenseTypeName: true },
      }),
    ]);

    const appIds = new Set<string>();
    subs.forEach((s) => appIds.add(s.applicationId));
    accessRows.forEach((a) => appIds.add(a.applicationId));

    const apps = await this.prisma.application.findMany({
      where: { id: { in: [...appIds] } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });

    // 3. Index the supporting data for O(1) cell lookups.
    const accessByUserApp = new Map<string, boolean>();
    accessRows.forEach((a) =>
      accessByUserApp.set(`${a.userId}:${a.applicationId}`, a.status === AccessStatus.ACTIVE),
    );

    const roleByMembershipApp = new Map<string, string>();
    roleRows.forEach((r) =>
      roleByMembershipApp.set(`${r.membershipId}:${r.role.applicationId}`, r.role.name),
    );

    const licenseByUserApp = new Map<string, string>();
    licenseRows.forEach((l) =>
      licenseByUserApp.set(`${l.userId}:${l.applicationId}`, l.licenseTypeName),
    );

    // 4. Assemble the grid.
    const members = memberships.map((m) => ({
      userId: m.user.id,
      email: m.user.email,
      name:
        [m.user.givenName, m.user.familyName].filter(Boolean).join(' ') || m.user.email,
      apps: apps.map((app) => ({
        appId: app.id,
        appName: app.name,
        hasAccess: accessByUserApp.get(`${m.user.id}:${app.id}`) ?? false,
        role: roleByMembershipApp.get(`${m.id}:${app.id}`) ?? null,
        licenseType: licenseByUserApp.get(`${m.user.id}:${app.id}`) ?? null,
      })),
    }));

    return {
      tenantId,
      apps: apps.map((a) => ({ appId: a.id, appName: a.name })),
      members,
    };
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

  async dispatchAccessGrantedEvent(params: {
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
      user_email: user?.email ?? undefined,
      application_id: applicationId,
      application_name: app?.name,
      application_slug: app?.slug,
      access_type: accessType,
      granted_by_id: grantedById,
      license_assignment_id: licenseAssignmentId,
    });
  }

  async dispatchAccessRevokedEvent(params: {
    tenantId: string; userId: string; applicationId: string; revokedById?: string;
  }): Promise<void> {
    const { tenantId, userId, applicationId, revokedById } = params;

    const [app, tenant, user] = await Promise.all([
      // name added for the canonical payload (application_name)
      this.prisma.application.findUnique({ where: { id: applicationId }, select: { name: true, slug: true } }),
      this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { slug: true } }),
      this.prisma.user.findUnique({ where: { id: userId }, select: { email: true } }),
    ]);

    this.systemWebhookService.dispatch('tenant.app.revoked', {
      tenant_id: tenantId,
      tenant_slug: tenant?.slug,
      user_id: userId,
      user_email: user?.email ?? undefined,
      application_id: applicationId,
      application_name: app?.name,
      application_slug: app?.slug,
      revoked_by_id: revokedById,
    });
  }
}
