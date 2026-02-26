import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, MembershipStatus, SubscriptionStatus } from '@prisma/client';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { SystemWebhookService } from '../webhooks/system-webhook.service';

/**
 * TenantsService - Core tenant operations
 *
 * Consolidated from:
 * - TenancyService (createTenant, getTenant, getUserTenants)
 * - TenantManagementService (getTenantOverview)
 *
 * This service handles tenant lifecycle:
 * - Create/Read/Update/Delete tenants
 * - Get tenant stats and overview
 * - Get user's tenant memberships
 */
@Injectable()
export class TenantsService {
  private readonly logger = new Logger(TenantsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly systemWebhookService: SystemWebhookService,
  ) {}

  /**
   * Create a new tenant
   * The creator becomes the first member with owner role
   */
  async createTenant(dto: CreateTenantDto, creatorUserId: string) {
    // Check slug uniqueness
    const existingTenant = await this.prisma.tenant.findUnique({
      where: { slug: dto.slug },
    });

    if (existingTenant) {
      throw new ConflictException('Tenant slug already exists');
    }

    // Get the owner tenant role
    const ownerRole = await this.prisma.tenantRole.findUnique({
      where: { slug: 'owner' },
    });

    // Create tenant and add creator as first member with owner role
    const tenant = await this.prisma.tenant.create({
      data: {
        name: dto.name,
        slug: dto.slug,
        settings: (dto.settings || {}) as Prisma.InputJsonValue,
        memberships: {
          create: {
            userId: creatorUserId,
            status: MembershipStatus.ACTIVE,
            joinedAt: new Date(),
            ...(ownerRole && {
              membershipTenantRoles: {
                create: { tenantRoleId: ownerRole.id },
              },
            }),
          },
        },
      },
      include: {
        memberships: {
          include: {
            user: {
              select: { id: true, email: true },
            },
            membershipTenantRoles: {
              include: { tenantRole: true },
            },
          },
        },
      },
    });

    this.logger.log(`Tenant "${tenant.name}" created by user ${creatorUserId}`);

    // Fire webhook event (fire and forget)
    const creator = tenant.memberships[0]?.user;
    this.systemWebhookService.dispatch('tenant.created', {
      tenant_id: tenant.id,
      tenant_name: tenant.name,
      tenant_slug: tenant.slug,
      owner_id: creatorUserId,
      owner_email: creator?.email,
    }).catch((err) => {
      this.logger.warn(`Failed to dispatch tenant.created event: ${err.message}`);
    });

    return tenant;
  }

  /**
   * Get tenant details with member count and subscription info
   */
  async getTenant(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        memberships: {
          where: {
            status: { in: [MembershipStatus.ACTIVE, MembershipStatus.INVITED] },
          },
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
            membershipRoles: {
              include: {
                role: {
                  select: { id: true, name: true, slug: true },
                },
              },
            },
          },
        },
        appSubscriptions: {
          where: {
            status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] },
          },
          include: {
            licenseType: true,
          },
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const subscriptionSummary = tenant.appSubscriptions.map((sub) => ({
      applicationId: sub.applicationId,
      licenseType: sub.licenseType.slug,
      licenseTypeName: sub.licenseType.name,
      seatsOwned: sub.quantityPurchased,
      seatsAssigned: sub.quantityAssigned,
    }));

    return {
      ...tenant,
      stats: {
        memberCount: tenant.memberships.length,
        subscriptionCount: tenant.appSubscriptions.length,
        totalSeatsOwned: tenant.appSubscriptions.reduce(
          (sum, sub) => sum + sub.quantityPurchased,
          0,
        ),
      },
      subscriptions: subscriptionSummary,
    };
  }

  /**
   * Get tenant overview stats (for dashboard)
   */
  async getTenantOverview(tenantId: string) {
    const [tenant, memberCount, pendingInvites, appSubscriptions] =
      await Promise.all([
        this.prisma.tenant.findUnique({
          where: { id: tenantId },
          select: { id: true, name: true, slug: true },
        }),
        this.prisma.membership.count({
          where: { tenantId, status: { not: 'INVITED' } },
        }),
        this.prisma.invitation.count({
          where: { tenantId, consumedAt: null, expiresAt: { gt: new Date() } },
        }),
        this.prisma.appSubscription.count({
          where: { tenantId, status: 'ACTIVE' },
        }),
      ]);

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    return {
      tenantId: tenant.id,
      tenantName: tenant.name,
      tenantSlug: tenant.slug,
      memberCount,
      pendingInvites,
      appCount: appSubscriptions,
    };
  }

  /**
   * Get all tenants for a user
   */
  async getUserTenants(userId: string) {
    const memberships = await this.prisma.membership.findMany({
      where: {
        userId,
        status: MembershipStatus.ACTIVE,
      },
      include: {
        tenant: {
          include: {
            appSubscriptions: {
              where: {
                status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] },
              },
              include: {
                licenseType: {
                  select: { name: true, slug: true },
                },
                application: {
                  select: { id: true, name: true },
                },
              },
            },
            _count: {
              select: { memberships: true },
            },
          },
        },
        membershipRoles: {
          include: {
            role: {
              include: {
                application: {
                  select: { name: true },
                },
              },
            },
          },
        },
        membershipTenantRoles: {
          include: { tenantRole: true },
        },
      },
    });

    return memberships.map((m) => ({
      membershipId: m.id,
      tenant: {
        id: m.tenant.id,
        name: m.tenant.name,
        slug: m.tenant.slug,
      },
      tenantRoles: m.membershipTenantRoles.map((mtr) => ({
        id: mtr.tenantRole.id,
        name: mtr.tenantRole.name,
        slug: mtr.tenantRole.slug,
      })),
      roles: m.membershipRoles.map((mr) => ({
        id: mr.role.id,
        name: mr.role.name,
        application: mr.role.application.name,
      })),
      subscriptions: m.tenant.appSubscriptions.map((sub) => ({
        applicationId: sub.application.id,
        applicationName: sub.application.name,
        licenseType: sub.licenseType.slug,
        licenseTypeName: sub.licenseType.name,
        seatsOwned: sub.quantityPurchased,
        seatsAssigned: sub.quantityAssigned,
      })),
      memberCount: m.tenant._count.memberships,
    }));
  }

  /**
   * Update a tenant
   */
  async updateTenant(tenantId: string, dto: UpdateTenantDto) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    // If slug is being changed, check uniqueness
    if (dto.slug && dto.slug !== tenant.slug) {
      const existingWithSlug = await this.prisma.tenant.findUnique({
        where: { slug: dto.slug },
      });
      if (existingWithSlug) {
        throw new ConflictException('Tenant slug already exists');
      }
    }

    // Track changed fields
    const changedFields: string[] = [];
    if (dto.name && dto.name !== tenant.name) changedFields.push('name');
    if (dto.slug && dto.slug !== tenant.slug) changedFields.push('slug');
    if (dto.settings) changedFields.push('settings');

    const updated = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.slug && { slug: dto.slug }),
        ...(dto.settings && { settings: dto.settings as Prisma.InputJsonValue }),
      },
    });

    this.logger.log(`Tenant "${updated.name}" updated`);

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
   * Delete a tenant
   * WARNING: This cascades and removes all memberships, subscriptions, etc.
   */
  async deleteTenant(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { _count: { select: { memberships: true } } },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    // Safety check: prevent deletion if tenant has active subscriptions
    const activeSubscriptions = await this.prisma.appSubscription.count({
      where: { tenantId, status: 'ACTIVE' },
    });

    if (activeSubscriptions > 0) {
      throw new BadRequestException(
        'Cannot delete tenant with active subscriptions. Cancel all subscriptions first.',
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

    this.logger.log(`Tenant "${tenant.name}" deleted`);
    return { success: true, message: 'Tenant deleted successfully' };
  }

  /**
   * Get tenant applications (subscriptions)
   */
  async getTenantApplications(tenantId: string) {
    const subscriptions = await this.prisma.appSubscription.findMany({
      where: { tenantId, status: 'ACTIVE' },
      include: {
        application: {
          select: {
            id: true,
            name: true,
            slug: true,
            licensingMode: true,
          },
        },
        licenseType: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // For FREE apps, count all members as having access
    const memberCount = await this.prisma.membership.count({
      where: { tenantId, status: 'ACTIVE' },
    });

    return subscriptions.map((sub) => ({
      id: sub.id,
      applicationId: sub.application.id,
      applicationName: sub.application.name,
      applicationSlug: sub.application.slug,
      licenseTypeName: sub.licenseType.name,
      licensingMode: sub.application.licensingMode,
      quantityPurchased: sub.quantityPurchased,
      quantityAssigned:
        sub.application.licensingMode === 'FREE'
          ? memberCount
          : sub.quantityAssigned,
      status: sub.status,
    }));
  }
}
