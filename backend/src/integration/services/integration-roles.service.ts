import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Handles role queries and role assignment for M2M integration.
 *
 * Provides:
 * - Tenant role listing (IDP-level roles like owner/admin/member)
 * - Application role listing (app-specific roles)
 * - Member role assignment with hierarchy enforcement
 */
@Injectable()
export class IntegrationRolesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get all available tenant roles (IDP-level)
   */
  async getTenantRoles(): Promise<{
    roles: Array<{
      id: string;
      name: string;
      slug: string;
      description: string | null;
      isSystem: boolean;
      permissions: string[];
    }>;
  }> {
    const roles = await this.prisma.tenantRole.findMany({
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });

    return {
      roles: roles.map((r) => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        description: r.description,
        isSystem: r.isSystem,
        permissions: r.permissions,
      })),
    };
  }

  /**
   * Get all roles for an application (by clientId)
   *
   * Use this for role selection when inviting users or assigning roles.
   * These are application-specific roles, NOT the tenant-level roles (owner/admin/member).
   */
  async getApplicationRoles(clientId: string): Promise<{
    roles: Array<{
      id: string;
      name: string;
      slug: string;
      description: string | null;
    }>;
  }> {
    // Find application by clientId
    const application = await this.prisma.application.findUnique({
      where: { clientId },
      include: {
        roles: {
          orderBy: [{ name: 'asc' }],
        },
      },
    });

    if (!application) {
      throw new NotFoundException(`Application with clientId '${clientId}' not found`);
    }

    return {
      roles: application.roles.map((r) => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        description: r.description,
      })),
    };
  }

  /**
   * Set a member's tenant role (replaces all existing roles)
   *
   * Enforces role hierarchy:
   * - owner can change anyone (except last owner protection)
   * - admin can change admins and members, but cannot touch owners or promote to owner
   * - member cannot change roles
   */
  async setMemberRole(
    membershipId: string,
    roleSlug: string,
    callerUserId: string,
  ): Promise<{
    success: boolean;
    message: string;
    role: { id: string; name: string; slug: string };
  }> {
    // 1. Validate target membership exists
    const targetMembership = await this.prisma.membership.findUnique({
      where: { id: membershipId },
      include: {
        membershipTenantRoles: {
          include: { tenantRole: true },
        },
      },
    });

    if (!targetMembership) {
      throw new NotFoundException(`Membership '${membershipId}' not found`);
    }

    if (!targetMembership.tenantId) {
      throw new BadRequestException('Membership has no associated tenant');
    }

    // 2. Validate the new role exists
    const newRole = await this.prisma.tenantRole.findUnique({
      where: { slug: roleSlug },
    });

    if (!newRole) {
      throw new NotFoundException(`Tenant role '${roleSlug}' not found`);
    }

    // 3. Look up the caller's membership in the same tenant
    const callerMembership = await this.prisma.membership.findFirst({
      where: {
        userId: callerUserId,
        tenantId: targetMembership.tenantId,
        status: 'ACTIVE',
      },
      include: {
        membershipTenantRoles: {
          include: { tenantRole: true },
        },
      },
    });

    if (!callerMembership) {
      throw new BadRequestException('Caller is not an active member of this tenant');
    }

    // 4. Determine caller's and target's highest role
    const roleWeight = (slug: string): number => {
      switch (slug) {
        case 'owner': return 3;
        case 'admin': return 2;
        case 'member': return 1;
        default: return 0;
      }
    };

    const callerHighestRole = callerMembership.membershipTenantRoles.reduce(
      (max, mtr) => Math.max(max, roleWeight(mtr.tenantRole.slug)),
      0,
    );

    const targetCurrentRole = targetMembership.membershipTenantRoles.reduce(
      (max, mtr) => Math.max(max, roleWeight(mtr.tenantRole.slug)),
      0,
    );

    const newRoleWeight = roleWeight(roleSlug);

    // 5. Enforce hierarchy
    // Members cannot change roles
    if (callerHighestRole < roleWeight('admin')) {
      throw new BadRequestException('Insufficient permissions: only owners and admins can change member roles');
    }

    // Admins cannot touch owners
    if (callerHighestRole < roleWeight('owner') && targetCurrentRole >= roleWeight('owner')) {
      throw new BadRequestException('Insufficient permissions: admins cannot change an owner\'s role');
    }

    // Admins cannot promote to owner
    if (callerHighestRole < roleWeight('owner') && newRoleWeight >= roleWeight('owner')) {
      throw new BadRequestException('Insufficient permissions: only owners can promote to owner');
    }

    // 6. Execute the role change in a transaction
    await this.prisma.$transaction(async (tx) => {
      // Last owner protection
      if (roleSlug !== 'owner') {
        const ownerRole = await tx.tenantRole.findUnique({
          where: { slug: 'owner' },
        });

        if (ownerRole) {
          const isTargetCurrentlyOwner = targetMembership.membershipTenantRoles.some(
            (mtr) => mtr.tenantRole.slug === 'owner',
          );

          if (isTargetCurrentlyOwner) {
            const otherOwners = await tx.membershipTenantRole.count({
              where: {
                tenantRoleId: ownerRole.id,
                membership: {
                  tenantId: targetMembership.tenantId,
                  id: { not: membershipId },
                  status: { not: 'SUSPENDED' },
                },
              },
            });

            if (otherOwners === 0) {
              throw new BadRequestException(
                'Cannot change role of the last owner. Transfer ownership first.',
              );
            }
          }
        }
      }

      // Clear all existing tenant roles
      await tx.membershipTenantRole.deleteMany({
        where: { membershipId },
      });

      // Set the new role
      await tx.membershipTenantRole.create({
        data: {
          membershipId,
          tenantRoleId: newRole.id,
        },
      });
    });

    return {
      success: true,
      message: `Member role set to '${roleSlug}'`,
      role: {
        id: newRole.id,
        name: newRole.name,
        slug: newRole.slug,
      },
    };
  }
}
