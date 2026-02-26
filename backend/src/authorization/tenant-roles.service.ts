import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  DEFAULT_TENANT_ROLES,
  hasTenantPermission,
  SYSTEM_TENANT_ROLE_SLUGS,
} from './constants/default-tenant-roles';
import type { TenantRole } from '@prisma/client';

/**
 * TenantRolesService - Tenant Role Management
 *
 * Manages tenant-level roles (owner, admin, member) that control
 * what actions users can perform within a tenant.
 *
 * Tenant roles are separate from application roles:
 * - Tenant roles: manage the tenant itself (members, billing, settings)
 * - Application roles: permissions within specific apps
 */
@Injectable()
export class TenantRolesService {
  private readonly logger = new Logger(TenantRolesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Ensure all system tenant roles exist in the database
   * Called during application bootstrap
   */
  async ensureSystemRolesExist(): Promise<void> {
    this.logger.log('Ensuring system tenant roles exist...');

    for (const roleData of DEFAULT_TENANT_ROLES) {
      await this.prisma.tenantRole.upsert({
        where: { slug: roleData.slug },
        update: {
          name: roleData.name,
          description: roleData.description,
          permissions: roleData.permissions,
          isSystem: true,
        },
        create: {
          name: roleData.name,
          slug: roleData.slug,
          description: roleData.description,
          permissions: roleData.permissions,
          isSystem: true,
        },
      });
      this.logger.debug(
        `System tenant role '${roleData.name}' (${roleData.slug}) ensured`,
      );
    }

    this.logger.log('System tenant roles ensured successfully');
  }

  /**
   * Get all tenant roles
   */
  async getTenantRoles(): Promise<TenantRole[]> {
    return this.prisma.tenantRole.findMany({
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
  }

  /**
   * Get a tenant role by slug
   */
  async getTenantRoleBySlug(slug: string): Promise<TenantRole> {
    const role = await this.prisma.tenantRole.findUnique({
      where: { slug },
    });

    if (!role) {
      throw new NotFoundException(`Tenant role with slug '${slug}' not found`);
    }

    return role;
  }

  /**
   * Assign a tenant role to a membership
   */
  async assignTenantRole(
    membershipId: string,
    tenantRoleSlug: string,
  ): Promise<void> {
    const membership = await this.prisma.membership.findUnique({
      where: { id: membershipId },
    });

    if (!membership) {
      throw new NotFoundException(
        `Membership with ID '${membershipId}' not found`,
      );
    }

    const tenantRole = await this.getTenantRoleBySlug(tenantRoleSlug);

    await this.prisma.membershipTenantRole.upsert({
      where: {
        membershipId_tenantRoleId: {
          membershipId,
          tenantRoleId: tenantRole.id,
        },
      },
      update: {},
      create: {
        membershipId,
        tenantRoleId: tenantRole.id,
      },
    });

    this.logger.debug(
      `Assigned tenant role '${tenantRoleSlug}' to membership '${membershipId}'`,
    );
  }

  /**
   * Remove a tenant role from a membership
   * Prevents removing the last owner role
   */
  async removeTenantRole(
    membershipId: string,
    tenantRoleSlug: string,
  ): Promise<void> {
    const membership = await this.prisma.membership.findUnique({
      where: { id: membershipId },
    });

    if (!membership) {
      throw new NotFoundException(
        `Membership with ID '${membershipId}' not found`,
      );
    }

    if (!membership.tenantId) {
      throw new BadRequestException('Membership has no associated tenant');
    }

    const tenantRole = await this.getTenantRoleBySlug(tenantRoleSlug);

    // Wrap check + delete in transaction to prevent race condition
    await this.prisma.$transaction(async (tx) => {
      if (tenantRoleSlug === SYSTEM_TENANT_ROLE_SLUGS.OWNER) {
        const ownerCount = await tx.membershipTenantRole.count({
          where: {
            tenantRoleId: tenantRole.id,
            membership: {
              tenantId: membership.tenantId,
              id: { not: membershipId },
              status: { not: 'SUSPENDED' },
            },
          },
        });

        if (ownerCount === 0) {
          throw new BadRequestException(
            'Cannot remove the last owner from the tenant. Transfer ownership first.',
          );
        }
      }

      await tx.membershipTenantRole.deleteMany({
        where: {
          membershipId,
          tenantRoleId: tenantRole.id,
        },
      });
    });

    this.logger.debug(
      `Removed tenant role '${tenantRoleSlug}' from membership '${membershipId}'`,
    );
  }

  /**
   * Get all tenant roles for a membership
   */
  async getMembershipTenantRoles(membershipId: string): Promise<TenantRole[]> {
    const membershipTenantRoles =
      await this.prisma.membershipTenantRole.findMany({
        where: { membershipId },
        include: {
          tenantRole: true,
        },
        orderBy: { tenantRole: { name: 'asc' } },
      });

    return membershipTenantRoles.map((mtr) => mtr.tenantRole);
  }

  /**
   * Check if a membership has a specific tenant role
   */
  async membershipHasTenantRole(
    membershipId: string,
    tenantRoleSlug: string,
  ): Promise<boolean> {
    const membershipTenantRole =
      await this.prisma.membershipTenantRole.findFirst({
        where: {
          membershipId,
          tenantRole: { slug: tenantRoleSlug },
        },
      });

    return !!membershipTenantRole;
  }

  /**
   * Get all tenant permissions for a membership (resolved from roles)
   */
  async getMembershipTenantPermissions(membershipId: string): Promise<string[]> {
    const roles = await this.getMembershipTenantRoles(membershipId);

    const permissionSet = new Set<string>();
    for (const role of roles) {
      for (const permission of role.permissions) {
        permissionSet.add(permission);
      }
    }

    return Array.from(permissionSet);
  }

  /**
   * Check if a membership has a specific tenant permission
   * Uses wildcard matching (e.g., 'tenant:*' matches all tenant permissions)
   */
  async membershipHasTenantPermission(
    membershipId: string,
    permission: string,
  ): Promise<boolean> {
    const permissions = await this.getMembershipTenantPermissions(membershipId);
    return hasTenantPermission(permissions, permission);
  }
}
