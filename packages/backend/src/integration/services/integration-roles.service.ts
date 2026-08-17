import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { M2mTenantAuthService } from '../m2m-authz';

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly m2mTenantAuth: M2mTenantAuthService,
  ) {}

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
    // clientId identifies an ApplicationClient; roles belong to the container.
    const client = await this.prisma.applicationClient.findUnique({
      where: { clientId },
      select: {
        application: {
          include: {
            roles: {
              orderBy: [{ name: 'asc' }],
            },
          },
        },
      },
    });

    if (!client) {
      throw new NotFoundException(`Application with clientId '${clientId}' not found`);
    }

    const application = client.application;

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
   * Set a member's APPLICATION role (the app-scoped MembershipRole -> Role
   * binding), replacing whatever app role they currently hold for that app.
   *
   * This is the coherent intent of the M2M `set-member-role` endpoint: the SDK
   * body carries `{ membershipId, roleId, applicationId }`, all three of which
   * are meaningful here (an application role id + the app it belongs to). The
   * previous wiring passed these positionally into a tenant-role method with
   * signature `(membershipId, roleSlug, callerUserId)`, so `roleId` was used as
   * a role *slug* and `applicationId` as the caller's *userId* — always wrong.
   *
   * Authorization is handled by the M2M guard on the controller (the calling
   * application is trusted for its own tenants); there is no human "caller" in
   * an M2M context, so no user-relative hierarchy check applies. Tenant-level
   * role changes have their own path (assigned at invite time; see
   * IntegrationInvitationsService) and are intentionally out of scope here.
   *
   * NOTE: mirrors MemberAppAccessService.updateAppRole (which additionally
   * emits sync events for the human-facing tenant UI). Kept as a small,
   * dependency-light Prisma write here to avoid coupling IntegrationModule to
   * the whole TenantsModule.
   */
  async setMemberRole(
    membershipId: string,
    roleId: string,
    applicationId: string,
    clientId: string,
  ): Promise<{
    success: boolean;
    message: string;
    role: { id: string; name: string; slug: string };
  }> {
    // 1. Validate target membership exists
    const targetMembership = await this.prisma.membership.findUnique({
      where: { id: membershipId },
    });

    if (!targetMembership) {
      throw new NotFoundException(`Membership '${membershipId}' not found`);
    }

    if (!targetMembership.tenantId) {
      throw new BadRequestException('Membership has no associated tenant');
    }

    // Record-derived tenant: enforce M2M client access before any mutation.
    await this.m2mTenantAuth.assertTenantAccess(clientId, targetMembership.tenantId);

    // 2. Validate the role exists AND belongs to the given application (guards
    //    against assigning a role from a different app).
    const newRole = await this.prisma.role.findFirst({
      where: { id: roleId, applicationId },
    });

    if (!newRole) {
      throw new NotFoundException(
        `Role '${roleId}' not found for application '${applicationId}'`,
      );
    }

    // 3. Replace the member's role for THIS application only (leave other apps'
    //    roles untouched). Idempotent + atomic.
    await this.prisma.$transaction(async (tx) => {
      await tx.membershipRole.deleteMany({
        where: { membershipId, role: { applicationId } },
      });
      await tx.membershipRole.create({
        data: { membershipId, roleId: newRole.id },
      });
    });

    return {
      success: true,
      message: `Member application role set to '${newRole.slug}'`,
      role: {
        id: newRole.id,
        name: newRole.name,
        slug: newRole.slug,
      },
    };
  }
}
