import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

/**
 * Handles permission checking for M2M integration.
 *
 * Note: Roles-based authorization - having a role grants access.
 * Permission strings are for extensibility but currently just check if user has any role.
 */
@Injectable()
export class IntegrationPermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Check if a user has a specific permission in a tenant
   */
  async checkPermission(
    userId: string,
    tenantId: string,
    _permission: string,
  ): Promise<{ allowed: boolean; reason?: string }> {
    const membership = await this.prisma.membership.findFirst({
      where: {
        userId,
        tenantId,
        status: "ACTIVE",
      },
      include: {
        membershipRoles: {
          include: {
            role: true,
          },
        },
      },
    });

    if (!membership) {
      return { allowed: false, reason: "User is not a member of this tenant" };
    }

    // Check if user has owner TenantRole - owners have all permissions
    const membershipWithTenantRoles = await this.prisma.membership.findFirst({
      where: { id: membership.id },
      include: {
        membershipTenantRoles: {
          include: { tenantRole: true },
        },
      },
    });
    const hasOwnerRole = membershipWithTenantRoles?.membershipTenantRoles.some(
      (mtr) => mtr.tenantRole.slug === "owner",
    );
    if (hasOwnerRole) {
      return { allowed: true, reason: "User is tenant owner" };
    }

    // Check if user has any role (roles themselves represent access)
    const hasRole = membership.membershipRoles.length > 0;

    return {
      allowed: hasRole,
      reason: hasRole ? undefined : "No role assigned",
    };
  }

  /**
   * Check multiple permissions at once
   */
  async checkPermissions(
    userId: string,
    tenantId: string,
    permissions: string[],
  ): Promise<{ results: Record<string, boolean>; allAllowed: boolean }> {
    const results: Record<string, boolean> = {};

    for (const permission of permissions) {
      const { allowed } = await this.checkPermission(
        userId,
        tenantId,
        permission,
      );
      results[permission] = allowed;
    }

    return {
      results,
      allAllowed: Object.values(results).every((v) => v),
    };
  }

  /**
   * Get all roles for a user in a tenant
   */
  async getUserPermissions(
    userId: string,
    tenantId: string,
  ): Promise<{
    roles: Array<{ id: string; name: string; slug: string }>;
  }> {
    const membership = await this.prisma.membership.findFirst({
      where: {
        userId,
        tenantId,
        status: "ACTIVE",
      },
      include: {
        membershipRoles: {
          include: {
            role: true,
          },
        },
      },
    });

    if (!membership) {
      return { roles: [] };
    }

    const roles: Array<{ id: string; name: string; slug: string }> = [];

    for (const mr of membership.membershipRoles) {
      roles.push({
        id: mr.role.id,
        name: mr.role.name,
        slug: mr.role.slug,
      });
    }

    return {
      roles,
    };
  }
}
