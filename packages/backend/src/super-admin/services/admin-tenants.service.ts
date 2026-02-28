import {
  Injectable,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SystemWebhookService } from '../../webhooks/system-webhook.service';
import { LicensePoolService } from '../../licensing/services/license-pool.service';
import { AdminTenantMembersService } from './admin-tenant-members.service';
import { AccessMode } from '@prisma/client';

/**
 * Handles tenant management operations for super admins.
 * Member management is delegated to AdminTenantMembersService.
 */
@Injectable()
export class AdminTenantsService {
  private readonly logger = new Logger(AdminTenantsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly systemWebhookService: SystemWebhookService,
    private readonly licensePoolService: LicensePoolService,
    private readonly memberService: AdminTenantMembersService,
  ) {}

  // ===========================================================================
  // TENANT CRUD
  // ===========================================================================

  async getTenants(opts: { search?: string; limit?: number; offset?: number }) {
    const { search, limit = 50, offset = 0 } = opts;

    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { slug: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [tenants, total] = await Promise.all([
      this.prisma.tenant.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { memberships: true, appSubscriptions: true } } },
      }),
      this.prisma.tenant.count({ where }),
    ]);

    return {
      tenants: tenants.map((t) => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        createdAt: t.createdAt,
        memberCount: t._count.memberships,
        subscriptionCount: t._count.appSubscriptions,
      })),
      total,
      limit,
      offset,
    };
  }

  async getTenantStats() {
    const [total, withMembers, withSubscriptions] = await Promise.all([
      this.prisma.tenant.count(),
      this.prisma.tenant.count({ where: { memberships: { some: {} } } }),
      this.prisma.tenant.count({ where: { appSubscriptions: { some: {} } } }),
    ]);
    return { total, withMembers, withSubscriptions };
  }

  async getTenant(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        memberships: {
          include: {
            user: { select: { id: true, email: true, givenName: true, familyName: true, displayName: true } },
            membershipTenantRoles: { include: { tenantRole: true } },
            membershipRoles: { include: { role: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
        domains: { select: { id: true, domainName: true, isVerified: true } },
        appSubscriptions: {
          include: {
            application: { select: { id: true, name: true, slug: true } },
            licenseType: { select: { id: true, name: true, slug: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }

  async createTenant(data: { name: string; slug: string; ownerEmail?: string }) {
    const existing = await this.prisma.tenant.findUnique({ where: { slug: data.slug } });
    if (existing) throw new ConflictException(`Tenant with slug '${data.slug}' already exists`);

    let owner = null;
    if (data.ownerEmail) {
      owner = await this.prisma.user.findUnique({ where: { email: data.ownerEmail.toLowerCase() } });
      if (!owner) throw new NotFoundException(`User with email '${data.ownerEmail}' not found`);
    }

    const tenant = await this.prisma.tenant.create({ data: { name: data.name, slug: data.slug, settings: {} } });

    if (owner) {
      const membership = await this.prisma.membership.create({
        data: { userId: owner.id, tenantId: tenant.id, status: 'ACTIVE', joinedAt: new Date() },
      });

      const ownerRole = await this.prisma.tenantRole.findUnique({ where: { slug: 'owner' } });
      if (ownerRole) {
        await this.prisma.membershipTenantRole.create({
          data: { membershipId: membership.id, tenantRoleId: ownerRole.id },
        });
      }

      await this.autoProvisionFreeApps(tenant.id, owner.id);
    }

    this.systemWebhookService.dispatch('tenant.created', {
      tenant_id: tenant.id,
      tenant_name: tenant.name,
      tenant_slug: tenant.slug,
      owner_email: data.ownerEmail,
    }).catch((err) => this.logger.warn(`Failed to dispatch tenant.created event: ${err.message}`));

    return tenant;
  }

  private async autoProvisionFreeApps(tenantId: string, ownerId: string): Promise<void> {
    const freeApps = await this.prisma.application.findMany({
      where: {
        isActive: true,
        licensingMode: 'FREE',
        defaultLicenseTypeId: { not: null },
        accessMode: { in: [AccessMode.AUTOMATIC, AccessMode.MANUAL_AUTO_GRANT] },
      },
      select: { id: true, name: true, defaultLicenseTypeId: true },
    });

    for (const app of freeApps) {
      try {
        await this.licensePoolService.provisionSubscription({
          tenantId,
          applicationId: app.id,
          licenseTypeId: app.defaultLicenseTypeId!,
          quantityPurchased: 1000,
        });
        this.logger.log(`Auto-provisioned FREE app "${app.name}" for tenant ${tenantId}`);
      } catch (err) {
        this.logger.error(`Failed to auto-provision FREE app "${app.name}": ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  async updateTenant(tenantId: string, data: { name?: string; slug?: string; initiateLoginUri?: string | null }) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant not found');

    if (data.slug && data.slug !== tenant.slug) {
      const existing = await this.prisma.tenant.findFirst({
        where: { slug: data.slug, NOT: { id: tenantId } },
      });
      if (existing) throw new ConflictException(`Tenant with slug '${data.slug}' already exists`);
    }

    const changedFields: string[] = [];
    if (data.name && data.name !== tenant.name) changedFields.push('name');
    if (data.slug && data.slug !== tenant.slug) changedFields.push('slug');
    if (data.initiateLoginUri !== undefined) changedFields.push('initiateLoginUri');

    const updated = await this.prisma.tenant.update({ where: { id: tenantId }, data });

    if (changedFields.length > 0) {
      this.systemWebhookService.dispatch('tenant.updated', {
        tenant_id: updated.id,
        tenant_name: updated.name,
        tenant_slug: updated.slug,
        changed_fields: changedFields,
      }).catch((err) => this.logger.warn(`Failed to dispatch tenant.updated event: ${err.message}`));
    }

    return updated;
  }

  async deleteTenant(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { _count: { select: { memberships: true } } },
    });

    if (!tenant) throw new NotFoundException('Tenant not found');
    if (tenant._count.memberships > 0) {
      throw new ForbiddenException(`Cannot delete tenant with ${tenant._count.memberships} member(s). Remove all members first.`);
    }

    this.systemWebhookService.dispatch('tenant.deleted', {
      tenant_id: tenant.id,
      tenant_slug: tenant.slug,
    }).catch((err) => this.logger.warn(`Failed to dispatch tenant.deleted event: ${err.message}`));

    await this.prisma.tenant.delete({ where: { id: tenantId } });
    return { success: true, message: 'Tenant deleted' };
  }

  // ===========================================================================
  // MEMBER MANAGEMENT (Delegated)
  // ===========================================================================

  async getTenantMembers(tenantId: string) {
    return this.memberService.getTenantMembers(tenantId);
  }

  async removeTenantMember(tenantId: string, membershipId: string) {
    return this.memberService.removeTenantMember(tenantId, membershipId);
  }

  async updateMemberRoles(membershipId: string, roleIds: string[]) {
    return this.memberService.updateMemberRoles(membershipId, roleIds);
  }

  async getAvailableUsersForTenant(tenantId: string) {
    return this.memberService.getAvailableUsersForTenant(tenantId);
  }

  async inviteUserToTenant(tenantId: string, email: string) {
    return this.memberService.inviteUserToTenant(tenantId, email);
  }

  async updateMembershipStatus(membershipId: string, status: 'ACTIVE' | 'SUSPENDED' | 'INVITED') {
    return this.memberService.updateMembershipStatus(membershipId, status);
  }
}
