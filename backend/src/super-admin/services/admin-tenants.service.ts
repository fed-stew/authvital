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
import { AccessMode } from '@prisma/client';

/**
 * Handles tenant management operations for super admins.
 * Focused on: Tenant CRUD and member management.
 *
 * Related operations are in separate services:
 * - AdminServiceAccountsService: Service account management
 * - DomainService: Domain verification
 * - TenantRoleService: Tenant role management
 */
@Injectable()
export class AdminTenantsService {
  private readonly logger = new Logger(AdminTenantsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly systemWebhookService: SystemWebhookService,
    private readonly licensePoolService: LicensePoolService,
  ) {}

  // ===========================================================================
  // TENANT CRUD
  // ===========================================================================

  /**
   * Get all tenants with optional search and pagination
   */
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
        include: {
          _count: {
            select: {
              memberships: true,
              appSubscriptions: true,
            },
          },
        },
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

  /**
   * Get tenant stats for dashboard
   */
  async getTenantStats() {
    const [total, withMembers, withSubscriptions] = await Promise.all([
      this.prisma.tenant.count(),
      this.prisma.tenant.count({
        where: { memberships: { some: {} } },
      }),
      this.prisma.tenant.count({
        where: { appSubscriptions: { some: {} } },
      }),
    ]);

    return { total, withMembers, withSubscriptions };
  }

  /**
   * Get detailed tenant info with all memberships and their roles
   */
  async getTenant(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        memberships: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                givenName: true,
                familyName: true,
                displayName: true,
                pictureUrl: true,
                createdAt: true,
              },
            },
            membershipRoles: {
              include: {
                role: {
                  include: {
                    application: {
                      select: { id: true, name: true, slug: true },
                    },
                  },
                },
              },
            },
            membershipTenantRoles: {
              include: {
                tenantRole: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        appSubscriptions: {
          where: { status: { in: ['ACTIVE', 'TRIALING'] } },
          include: {
            licenseType: {
              select: {
                id: true,
                name: true,
                slug: true,
                features: true,
              },
            },
            application: {
              select: { id: true, name: true, slug: true },
            },
          },
        },
        domains: {
          orderBy: { createdAt: 'desc' },
        },
        _count: {
          select: { memberships: true },
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    // Group roles by application for each member
    const membersWithGroupedRoles = tenant.memberships.map((membership) => {
      const rolesByApp: Record<
        string,
        { appId: string; appName: string; roles: { id: string; name: string; slug: string }[] }
      > = {};

      membership.membershipRoles.forEach((mr) => {
        const appId = mr.role.application.id;
        if (!rolesByApp[appId]) {
          rolesByApp[appId] = {
            appId,
            appName: mr.role.application.name,
            roles: [],
          };
        }
        rolesByApp[appId].roles.push({
          id: mr.role.id,
          name: mr.role.name,
          slug: mr.role.slug,
        });
      });

      return {
        id: membership.id,
        status: membership.status,
        joinedAt: membership.joinedAt,
        createdAt: membership.createdAt,
        user: membership.user,
        rolesByApplication: Object.values(rolesByApp),
        totalRoles: membership.membershipRoles.length,
        tenantRoles: membership.membershipTenantRoles.map((mtr) => ({
          id: mtr.tenantRole.id,
          name: mtr.tenantRole.name,
          slug: mtr.tenantRole.slug,
          description: mtr.tenantRole.description,
          isSystem: mtr.tenantRole.isSystem,
        })),
      };
    });

    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      settings: tenant.settings,
      createdAt: tenant.createdAt,
      memberCount: tenant._count.memberships,
      members: membersWithGroupedRoles,
      subscriptions: tenant.appSubscriptions.map((sub) => ({
        id: sub.id,
        status: sub.status,
        applicationId: sub.applicationId,
        applicationName: sub.application.name,
        licenseTypeId: sub.licenseTypeId,
        licenseTypeName: sub.licenseType.name,
        licenseTypeSlug: sub.licenseType.slug,
        quantityPurchased: sub.quantityPurchased,
        quantityAssigned: sub.quantityAssigned,
        quantityAvailable: sub.quantityPurchased - sub.quantityAssigned,
        currentPeriodEnd: sub.currentPeriodEnd,
        autoRenew: sub.autoRenew,
        features: sub.licenseType.features,
      })),
      domains: tenant.domains,
    };
  }

  /**
   * Create a new tenant in the instance
   */
  async createTenant(data: { name: string; slug: string; ownerEmail?: string }) {
    // Check slug uniqueness (globally unique)
    const existingTenant = await this.prisma.tenant.findUnique({
      where: { slug: data.slug },
    });

    if (existingTenant) {
      throw new ConflictException(`Tenant with slug '${data.slug}' already exists`);
    }

    // If owner email provided, find user
    let ownerId: string | null = null;
    if (data.ownerEmail) {
      const owner = await this.prisma.user.findUnique({
        where: { email: data.ownerEmail.toLowerCase() },
      });

      if (!owner) {
        throw new NotFoundException(`User with email '${data.ownerEmail}' not found`);
      }
      ownerId = owner.id;
    }

    // Create tenant
    const tenant = await this.prisma.tenant.create({
      data: {
        name: data.name,
        slug: data.slug,
        settings: {},
      },
    });

    // If owner specified, create membership with owner role
    if (ownerId) {
      const membership = await this.prisma.membership.create({
        data: {
          userId: ownerId,
          tenantId: tenant.id,
          status: 'ACTIVE',
          joinedAt: new Date(),
        },
      });

      // Assign owner tenant role
      const ownerRole = await this.prisma.tenantRole.findUnique({
        where: { slug: 'owner' },
      });
      if (ownerRole) {
        await this.prisma.membershipTenantRole.create({
          data: {
            membershipId: membership.id,
            tenantRoleId: ownerRole.id,
          },
        });
      }
    }

    // Auto-provision apps based on accessMode
    await this.autoProvisionAppsForTenant(tenant.id);

    // Fire webhook event (fire and forget)
    this.systemWebhookService.dispatch('tenant.created', {
      tenant_id: tenant.id,
      tenant_name: tenant.name,
      tenant_slug: tenant.slug,
      owner_id: ownerId,
      owner_email: data.ownerEmail?.toLowerCase(),
    }).catch((err) => {
      this.logger.warn(`Failed to dispatch tenant.created event: ${err.message}`);
    });

    return {
      ...tenant,
      memberCount: ownerId ? 1 : 0,
    };
  }

  /**
   * Auto-provision app subscriptions for a new tenant based on accessMode
   * Delegates to LicensePoolService to ensure events are fired
   */
  private async autoProvisionAppsForTenant(tenantId: string): Promise<void> {
    try {
      // Find all active apps that should be auto-provisioned
      const appsToProvision = await this.prisma.application.findMany({
        where: {
          isActive: true,
          // Only apps with AUTOMATIC or MANUAL_AUTO_GRANT access mode
          accessMode: { in: [AccessMode.AUTOMATIC, AccessMode.MANUAL_AUTO_GRANT] },
          // Must have a default license type to provision
          defaultLicenseTypeId: { not: null },
        },
        select: {
          id: true,
          name: true,
          licensingMode: true,
          defaultLicenseTypeId: true,
          defaultSeatCount: true,
        },
      });

      this.logger.log(
        `Auto-provisioning ${appsToProvision.length} apps for tenant ${tenantId}`,
      );

      for (const app of appsToProvision) {
        try {
          // Determine quantity based on licensing mode
          const quantity =
            app.licensingMode === 'PER_SEAT' ? (app.defaultSeatCount || 10) : 1;

          // Far future for auto-provisioned subscriptions (100 years)
          const farFuture = new Date();
          farFuture.setFullYear(farFuture.getFullYear() + 100);

          // DELEGATE to core service (which fires events)
          await this.licensePoolService.provisionSubscription({
            tenantId,
            applicationId: app.id,
            licenseTypeId: app.defaultLicenseTypeId!,
            quantityPurchased: quantity,
            currentPeriodEnd: farFuture,
          });

          this.logger.log(
            `Auto-provisioned app "${app.name}" for tenant ${tenantId}`,
          );
        } catch (err) {
          // Skip if subscription already exists or other error
          const errorMessage = err instanceof Error ? err.message : String(err);
          this.logger.warn(
            `Failed to auto-provision app "${app.name}": ${errorMessage}`,
          );
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Failed to auto-provision apps for tenant ${tenantId}: ${errorMessage}`,
      );
      // Don't throw - tenant creation should succeed even if provisioning fails
    }
  }

  /**
   * Update tenant details
   */
  async updateTenant(
    tenantId: string,
    data: {
      name?: string;
      slug?: string;
      initiateLoginUri?: string | null;
    },
  ) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    // Check slug uniqueness if changing (globally unique)
    if (data.slug && data.slug !== tenant.slug) {
      const existing = await this.prisma.tenant.findFirst({
        where: {
          slug: data.slug,
          NOT: { id: tenantId },
        },
      });

      if (existing) {
        throw new ConflictException(`Tenant with slug '${data.slug}' already exists`);
      }
    }

    // Track changed fields
    const changedFields: string[] = [];
    if (data.name && data.name !== tenant.name) changedFields.push('name');
    if (data.slug && data.slug !== tenant.slug) changedFields.push('slug');
    if (data.initiateLoginUri !== undefined) changedFields.push('initiateLoginUri');

    const updated = await this.prisma.tenant.update({
      where: { id: tenantId },
      data,
    });

    // Fire webhook event if fields changed (fire and forget)
    if (changedFields.length > 0) {
      this.systemWebhookService.dispatch('tenant.updated', {
        tenant_id: updated.id,
        tenant_name: updated.name,
        tenant_slug: updated.slug,
        changed_fields: changedFields,
      }).catch((err) => {
        this.logger.warn(`Failed to dispatch tenant.updated event: ${err.message}`);
      });
    }

    return updated;
  }

  /**
   * Delete a tenant (must have no members)
   */
  async deleteTenant(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        _count: { select: { memberships: true } },
      },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    if (tenant._count.memberships > 0) {
      throw new ForbiddenException(
        `Cannot delete tenant with ${tenant._count.memberships} member(s). Remove all members first.`,
      );
    }

    // Fire webhook event BEFORE deletion (fire and forget)
    this.systemWebhookService.dispatch('tenant.deleted', {
      tenant_id: tenant.id,
      tenant_slug: tenant.slug,
    }).catch((err) => {
      this.logger.warn(`Failed to dispatch tenant.deleted event: ${err.message}`);
    });

    await this.prisma.tenant.delete({
      where: { id: tenantId },
    });

    return { success: true, message: 'Tenant deleted' };
  }

  // ===========================================================================
  // MEMBER MANAGEMENT
  // ===========================================================================

  /**
   * Get tenant members (shortcut for quick listing)
   */
  async getTenantMembers(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        memberships: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                givenName: true,
                familyName: true,
                displayName: true,
              },
            },
            membershipTenantRoles: {
              include: { tenantRole: true },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    return tenant.memberships.map((m) => ({
      id: m.id,
      user: m.user,
      status: m.status,
      joinedAt: m.joinedAt,
      tenantRoles: m.membershipTenantRoles.map((mtr) => mtr.tenantRole),
    }));
  }

  /**
   * Remove a member from a tenant
   */
  async removeTenantMember(tenantId: string, membershipId: string) {
    const membership = await this.prisma.membership.findUnique({
      where: { id: membershipId },
      include: { tenant: true },
    });

    if (!membership || membership.tenantId !== tenantId) {
      throw new NotFoundException('Membership not found');
    }

    // Check if member has owner role
    const membershipWithRoles = await this.prisma.membership.findUnique({
      where: { id: membershipId },
      include: {
        membershipTenantRoles: {
          include: { tenantRole: true },
        },
      },
    });
    const hasOwnerRole = membershipWithRoles?.membershipTenantRoles.some(
      (mtr) => mtr.tenantRole.slug === 'owner',
    );
    if (hasOwnerRole) {
      throw new ForbiddenException('Cannot remove the tenant owner');
    }

    await this.prisma.membership.delete({
      where: { id: membershipId },
    });

    return { success: true, message: 'Member removed' };
  }

  /**
   * Update member roles (replace all roles for a membership)
   */
  async updateMemberRoles(membershipId: string, roleIds: string[]) {
    const membership = await this.prisma.membership.findUnique({
      where: { id: membershipId },
    });

    if (!membership) {
      throw new NotFoundException('Membership not found');
    }

    await this.prisma.membershipRole.deleteMany({
      where: { membershipId },
    });

    if (roleIds.length > 0) {
      await this.prisma.membershipRole.createMany({
        data: roleIds.map((roleId) => ({
          membershipId,
          roleId,
        })),
      });
    }

    return { success: true, message: 'Roles updated' };
  }

  /**
   * Get users that are NOT members of a specific tenant
   */
  async getAvailableUsersForTenant(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const users = await this.prisma.user.findMany({
      where: {
        memberships: {
          none: {
            tenantId: tenantId,
          },
        },
      },
      select: {
        id: true,
        email: true,
        givenName: true,
        familyName: true,
        displayName: true,
        createdAt: true,
      },
      orderBy: { email: 'asc' },
    });

    return users;
  }

  /**
   * Invite a user to a tenant by email
   */
  async inviteUserToTenant(tenantId: string, email: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user) {
      throw new NotFoundException(`User with email '${email}' not found`);
    }

    const existingMembership = await this.prisma.membership.findUnique({
      where: {
        userId_tenantId: {
          userId: user.id,
          tenantId: tenantId,
        },
      },
    });

    if (existingMembership) {
      throw new ConflictException('User is already a member of this tenant');
    }

    const membership = await this.prisma.membership.create({
      data: {
        userId: user.id,
        tenantId: tenantId,
        status: 'INVITED',
      },
      include: {
        user: {
          select: { id: true, email: true, givenName: true, familyName: true },
        },
      },
    });

    return {
      success: true,
      message: `Invitation sent to ${email}`,
      membership: {
        id: membership.id,
        status: membership.status,
        user: membership.user,
      },
    };
  }

  /**
   * Change membership status (ACTIVE, SUSPENDED, etc.)
   */
  async updateMembershipStatus(
    membershipId: string,
    status: 'ACTIVE' | 'SUSPENDED' | 'INVITED',
  ) {
    const membership = await this.prisma.membership.findUnique({
      where: { id: membershipId },
    });

    if (!membership) {
      throw new NotFoundException('Membership not found');
    }

    const updated = await this.prisma.membership.update({
      where: { id: membershipId },
      data: {
        status,
        joinedAt: status === 'ACTIVE' && !membership.joinedAt ? new Date() : membership.joinedAt,
      },
    });

    return { success: true, membership: updated };
  }
}
