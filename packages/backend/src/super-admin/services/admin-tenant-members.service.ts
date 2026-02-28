import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SystemWebhookService } from '../../webhooks/system-webhook.service';

/**
 * Handles tenant member management for super admins.
 */
@Injectable()
export class AdminTenantMembersService {
  private readonly logger = new Logger(AdminTenantMembersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly systemWebhookService: SystemWebhookService,
  ) {}

  /**
   * Get tenant members
   */
  async getTenantMembers(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        memberships: {
          include: {
            user: {
              select: { id: true, email: true, givenName: true, familyName: true, displayName: true },
            },
            membershipTenantRoles: { include: { tenantRole: true } },
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

    const membershipWithRoles = await this.prisma.membership.findUnique({
      where: { id: membershipId },
      include: { membershipTenantRoles: { include: { tenantRole: true } } },
    });

    const hasOwnerRole = membershipWithRoles?.membershipTenantRoles.some(
      (mtr) => mtr.tenantRole.slug === 'owner',
    );

    if (hasOwnerRole) {
      throw new ForbiddenException('Cannot remove the tenant owner');
    }

    await this.prisma.membership.delete({ where: { id: membershipId } });
    return { success: true, message: 'Member removed' };
  }

  /**
   * Update member roles
   */
  async updateMemberRoles(membershipId: string, roleIds: string[]) {
    const membership = await this.prisma.membership.findUnique({ where: { id: membershipId } });
    if (!membership) {
      throw new NotFoundException('Membership not found');
    }

    await this.prisma.membershipRole.deleteMany({ where: { membershipId } });

    if (roleIds.length > 0) {
      await this.prisma.membershipRole.createMany({
        data: roleIds.map((roleId) => ({ membershipId, roleId })),
      });
    }

    return { success: true, message: 'Roles updated' };
  }

  /**
   * Get users not in a tenant
   */
  async getAvailableUsersForTenant(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const users = await this.prisma.user.findMany({
      where: {
        isMachine: false,
        memberships: { none: { tenantId } },
      },
      select: {
        id: true,
        email: true,
        givenName: true,
        familyName: true,
        displayName: true,
      },
      take: 100,
      orderBy: { createdAt: 'desc' },
    });

    return users;
  }

  /**
   * Invite a user to a tenant
   */
  async inviteUserToTenant(tenantId: string, email: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const existingMembership = await this.prisma.membership.findUnique({
      where: { userId_tenantId: { userId: user.id, tenantId } },
    });

    if (existingMembership) {
      throw new ForbiddenException('User is already a member');
    }

    const membership = await this.prisma.membership.create({
      data: {
        userId: user.id,
        tenantId,
        status: 'ACTIVE',
        joinedAt: new Date(),
      },
    });

    // Note: Using tenant.updated event for member additions
    this.systemWebhookService.dispatch('tenant.updated', {
      tenant_id: tenantId,
      tenant_slug: tenant.slug,
      changed_fields: ['members'],
    }).catch((err) => {
      this.logger.warn(`Failed to dispatch tenant.updated event: ${err.message}`);
    });

    return { success: true, membership };
  }

  /**
   * Update membership status
   */
  async updateMembershipStatus(membershipId: string, status: 'ACTIVE' | 'SUSPENDED' | 'INVITED') {
    const membership = await this.prisma.membership.findUnique({ where: { id: membershipId } });
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

    return updated;
  }
}
