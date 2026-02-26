import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { hasTenantPermission } from './constants/default-tenant-roles';

/**
 * PermissionsService - Centralized Permission Checking
 *
 * This service consolidates all permission checking logic in one place.
 * Previously scattered across integration.service.ts and various guards.
 *
 * Handles:
 * - Tenant-level permissions (owner, admin, member)
 * - Application role-based access
 * - Permission inheritance and wildcards
 */
@Injectable()
export class PermissionsService {
  private readonly logger = new Logger(PermissionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Check if a user has a specific permission in a tenant
   * This is THE canonical method for permission checks.
   */
  async hasPermission(
    userId: string,
    tenantId: string,
    permission: string,
  ): Promise<boolean> {
    const result = await this.checkPermission(userId, tenantId, permission);
    return result.allowed;
  }

  /**
   * Check a permission with detailed result
   */
  async checkPermission(
    userId: string,
    tenantId: string,
    permission: string,
  ): Promise<{ allowed: boolean; reason?: string }> {
    // 1. Get membership with tenant roles
    const membership = await this.prisma.membership.findFirst({
      where: {
        userId,
        tenantId,
        status: 'ACTIVE',
      },
      include: {
        membershipTenantRoles: {
          include: {
            tenantRole: true,
          },
        },
        membershipRoles: {
          include: {
            role: true,
          },
        },
      },
    });

    if (!membership) {
      return { allowed: false, reason: 'User is not a member of this tenant' };
    }

    // 2. Check tenant roles (owner has all permissions via wildcard)
    const tenantPermissions = membership.membershipTenantRoles.flatMap(
      (mtr) => mtr.tenantRole.permissions,
    );

    if (hasTenantPermission(tenantPermissions, permission)) {
      // Check if owner (for logging/auditing)
      const isOwner = membership.membershipTenantRoles.some(
        (mtr) => mtr.tenantRole.slug === 'owner',
      );
      return {
        allowed: true,
        reason: isOwner ? 'User is tenant owner' : 'Permission granted via tenant role',
      };
    }

    // 3. Check if user has any application roles (basic access)
    const hasAppRoles = membership.membershipRoles.length > 0;

    // For app-level permissions, having any role means access
    // (specific app permissions are checked at the app level)
    if (permission.startsWith('app:') && hasAppRoles) {
      return { allowed: true, reason: 'User has application role' };
    }

    return {
      allowed: false,
      reason: 'Permission not granted',
    };
  }

  /**
   * Check multiple permissions at once
   */
  async checkPermissions(
    userId: string,
    tenantId: string,
    permissions: string[],
  ): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};

    // Optimize: fetch membership once
    const membership = await this.prisma.membership.findFirst({
      where: {
        userId,
        tenantId,
        status: 'ACTIVE',
      },
      include: {
        membershipTenantRoles: {
          include: {
            tenantRole: true,
          },
        },
        membershipRoles: {
          include: {
            role: true,
          },
        },
      },
    });

    if (!membership) {
      // No membership = no permissions
      for (const permission of permissions) {
        results[permission] = false;
      }
      return results;
    }

    // Get all tenant permissions
    const tenantPermissions = membership.membershipTenantRoles.flatMap(
      (mtr) => mtr.tenantRole.permissions,
    );

    const hasAppRoles = membership.membershipRoles.length > 0;

    for (const permission of permissions) {
      if (hasTenantPermission(tenantPermissions, permission)) {
        results[permission] = true;
      } else if (permission.startsWith('app:') && hasAppRoles) {
        results[permission] = true;
      } else {
        results[permission] = false;
      }
    }

    return results;
  }

  /**
   * Get all permissions for a user in a tenant
   * Returns both tenant-level and app-level permissions
   */
  async getUserPermissions(
    userId: string,
    tenantId: string,
  ): Promise<{
    tenantPermissions: string[];
    appRoles: Array<{
      applicationId: string;
      roleId: string;
      roleName: string;
      roleSlug: string;
    }>;
    isOwner: boolean;
    isAdmin: boolean;
  }> {
    const membership = await this.prisma.membership.findFirst({
      where: {
        userId,
        tenantId,
        status: 'ACTIVE',
      },
      include: {
        membershipTenantRoles: {
          include: {
            tenantRole: true,
          },
        },
        membershipRoles: {
          include: {
            role: {
              include: {
                application: { select: { id: true } },
              },
            },
          },
        },
      },
    });

    if (!membership) {
      return {
        tenantPermissions: [],
        appRoles: [],
        isOwner: false,
        isAdmin: false,
      };
    }

    // Collect tenant permissions
    const permissionSet = new Set<string>();
    let isOwner = false;
    let isAdmin = false;

    for (const mtr of membership.membershipTenantRoles) {
      if (mtr.tenantRole.slug === 'owner') isOwner = true;
      if (mtr.tenantRole.slug === 'admin') isAdmin = true;
      for (const permission of mtr.tenantRole.permissions) {
        permissionSet.add(permission);
      }
    }

    // Collect app roles
    const appRoles = membership.membershipRoles.map((mr) => ({
      applicationId: mr.role.applicationId,
      roleId: mr.role.id,
      roleName: mr.role.name,
      roleSlug: mr.role.slug,
    }));

    return {
      tenantPermissions: Array.from(permissionSet),
      appRoles,
      isOwner,
      isAdmin,
    };
  }

  /**
   * Check if user is an owner of the tenant
   */
  async isOwner(userId: string, tenantId: string): Promise<boolean> {
    const membership = await this.prisma.membership.findFirst({
      where: {
        userId,
        tenantId,
        status: 'ACTIVE',
        membershipTenantRoles: {
          some: {
            tenantRole: { slug: 'owner' },
          },
        },
      },
    });

    return !!membership;
  }

  /**
   * Check if user is an admin (or owner) of the tenant
   */
  async isAdminOrOwner(userId: string, tenantId: string): Promise<boolean> {
    const membership = await this.prisma.membership.findFirst({
      where: {
        userId,
        tenantId,
        status: 'ACTIVE',
        membershipTenantRoles: {
          some: {
            tenantRole: { slug: { in: ['owner', 'admin'] } },
          },
        },
      },
    });

    return !!membership;
  }

  /**
   * Require a permission (throws if not allowed)
   * Convenience method for guards
   */
  async requirePermission(
    userId: string,
    tenantId: string,
    permission: string,
  ): Promise<void> {
    const result = await this.checkPermission(userId, tenantId, permission);
    if (!result.allowed) {
      throw new Error(`Permission denied: ${result.reason}`);
    }
  }
}
