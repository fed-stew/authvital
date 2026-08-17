import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SyncEventService, SYNC_EVENT_TYPES } from '../sync';
import { AppAccessService } from '../authorization';
import { AccessType } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS, AUDIT_TARGET_TYPES } from '../audit/audit-actions';

interface MembershipWithUser {
  id: string;
  user: {
    id: string;
    email: string | null;
    givenName?: string | null;
    familyName?: string | null;
  };
}

interface ApplicationInfo {
  id: string;
  name: string;
  licensingMode: string;
}

/**
 * MemberAppAccessService - App access management for tenant members
 *
 * Handles:
 * - Viewing app users and their access status
 * - Granting/revoking app access
 * - Updating app roles
 * - License seat management for PER_SEAT apps
 */
@Injectable()
export class MemberAppAccessService {
  private readonly logger = new Logger(MemberAppAccessService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly syncEventService: SyncEventService,
    private readonly appAccessService: AppAccessService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Get all tenant members with their access status for an application
   */
  async getAppUsers(tenantId: string, applicationId: string) {
    const application = await this.prisma.application.findUnique({
      where: { id: applicationId },
      include: {
        roles: {
          select: { id: true, name: true, slug: true, description: true, isDefault: true },
          orderBy: { name: 'asc' },
        },
      },
    });

    if (!application) {
      throw new NotFoundException('Application not found');
    }

    const subscription = await this.prisma.appSubscription.findFirst({
      where: { tenantId, applicationId, status: 'ACTIVE' },
      include: { licenseType: true },
    });

    // Get ALL tenant members
    const memberships = await this.prisma.membership.findMany({
      where: { tenantId, status: { in: ['ACTIVE', 'INVITED'] } },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            givenName: true,
            familyName: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Get all AppAccess records
    const accesses = await this.prisma.appAccess.findMany({
      where: { tenantId, applicationId },
      select: {
        userId: true,
        status: true,
        accessType: true,
        grantedAt: true,
      },
    });
    const accessMap = new Map(accesses.map((a) => [a.userId, a]));

    // Get all MembershipRoles
    const membershipRoles = await this.prisma.membershipRole.findMany({
      where: {
        membership: { tenantId },
        role: { applicationId },
      },
      include: { role: true },
    });
    const roleMap = new Map(membershipRoles.map((mr) => [mr.membershipId, mr]));

    const users = memberships.map((m) => {
      const access = accessMap.get(m.user.id);
      const membershipRole = roleMap.get(m.id);

      return {
        membershipId: m.id,
        userId: m.user.id,
        email: m.user.email,
        name:
          [m.user.givenName, m.user.familyName].filter(Boolean).join(' ') ||
          m.user.email,
        membershipStatus: m.status,
        hasAccess: access?.status === 'ACTIVE',
        accessStatus: access?.status || null,
        accessType: access?.accessType || null,
        grantedAt: access?.grantedAt || null,
        roleId: membershipRole?.role.id || null,
        roleName: membershipRole?.role.name || null,
        roleSlug: membershipRole?.role.slug || null,
      };
    });

    const seatsUsed = subscription?.quantityAssigned || 0;
    const seatsTotal = subscription?.quantityPurchased || 0;
    const seatsAvailable = Math.max(0, seatsTotal - seatsUsed);

    return {
      app: {
        id: application.id,
        name: application.name,
        slug: application.slug,
        licensingMode: application.licensingMode,
        licenseTypeName: subscription?.licenseType.name || 'Unknown',
        seatsUsed,
        seatsTotal,
        seatsAvailable,
        roles: application.roles,
      },
      users,
      totalMembers: memberships.length,
      membersWithAccess: users.filter((u) => u.hasAccess).length,
    };
  }

  /**
   * Grant app access to members
   */
  async grantAppAccess(
    tenantId: string,
    applicationId: string,
    membershipIds: string[],
    roleId: string,
  ) {
    const role = await this.prisma.role.findFirst({
      where: { id: roleId, applicationId },
    });

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    const application = await this.prisma.application.findUnique({
      where: { id: applicationId },
      select: { id: true, name: true, licensingMode: true },
    });

    if (!application) {
      throw new NotFoundException('Application not found');
    }

    const memberships = await this.prisma.membership.findMany({
      where: { id: { in: membershipIds }, tenantId },
      include: {
        user: { select: { id: true, email: true, givenName: true, familyName: true } },
      },
    });

    if (memberships.length !== membershipIds.length) {
      throw new BadRequestException('One or more members not found');
    }

    // For PER_SEAT: check if there are enough seats for all members
    if (application.licensingMode === 'PER_SEAT') {
      const subscription = await this.prisma.appSubscription.findFirst({
        where: { tenantId, applicationId, status: 'ACTIVE' },
      });

      if (!subscription) {
        throw new BadRequestException('No active subscription for this application');
      }

      // Check how many of these members already have access
      const existingAccess = await this.prisma.appAccess.findMany({
        where: {
          tenantId,
          applicationId,
          userId: { in: memberships.map((m) => m.user.id) },
          status: 'ACTIVE',
        },
        select: { userId: true },
      });
      const existingUserIds = new Set(existingAccess.map((a) => a.userId));
      const newUsersCount = memberships.filter((m) => !existingUserIds.has(m.user.id)).length;

      const seatsAvailable = subscription.quantityPurchased - subscription.quantityAssigned;
      if (newUsersCount > seatsAvailable) {
        throw new BadRequestException(
          `Not enough seats available. Need ${newUsersCount} seats but only ${seatsAvailable} available.`,
        );
      }
    }

    let grantedCount = 0;
    for (const membership of memberships) {
      try {
        await this.enableAppAccess(tenantId, applicationId, membership, application, { roleId });
        grantedCount++;
      } catch (err) {
        this.logger.warn(`Failed to grant access to user ${membership.user.id}: ${err}`);
      }
    }

    this.logger.log(`Granted app access to ${grantedCount} members for app ${applicationId}`);
    return { granted: grantedCount };
  }

  /**
   * Update a user's role in an application
   */
  async updateAppRole(
    tenantId: string,
    applicationId: string,
    membershipId: string,
    newRoleId: string,
  ) {
    const membership = await this.prisma.membership.findFirst({
      where: { id: membershipId, tenantId },
      include: {
        user: { select: { id: true, email: true, givenName: true, familyName: true } },
      },
    });

    if (!membership) {
      throw new NotFoundException('Member not found');
    }

    const newRole = await this.prisma.role.findFirst({
      where: { id: newRoleId, applicationId },
    });

    if (!newRole) {
      throw new NotFoundException('Role not found');
    }

    const existingMembershipRole = await this.prisma.membershipRole.findFirst({
      where: {
        membershipId,
        role: { applicationId },
      },
      include: { role: true },
    });

    // Remove existing and assign new
    await this.prisma.membershipRole.deleteMany({
      where: {
        membershipId,
        role: { applicationId },
      },
    });

    await this.prisma.membershipRole.create({
      data: { membershipId, roleId: newRoleId },
    });

    // Emit event
    this.syncEventService
      .emit(SYNC_EVENT_TYPES.APP_ACCESS_ROLE_CHANGED, tenantId, applicationId, {
        membership_id: membershipId,
        sub: membership.user.id,
        email: membership.user.email,
        given_name: membership.user.givenName || '',
        family_name: membership.user.familyName || '',
        role_id: newRole.id,
        role_name: newRole.name,
        role_slug: newRole.slug,
        previous_role_id: existingMembershipRole?.role.id || '',
        previous_role_name: existingMembershipRole?.role.name || '',
        previous_role_slug: existingMembershipRole?.role.slug || '',
      })
      .catch((err) =>
        this.logger.warn(`Failed to emit app_access.role_changed: ${err.message}`),
      );

    await this.auditService.log({
      tenantId,
      action: AUDIT_ACTIONS.APP_ROLE_CHANGED,
      targetType: AUDIT_TARGET_TYPES.APP_ACCESS,
      targetId: membership.user.id,
      metadata: {
        membershipId,
        applicationId,
        roleId: newRole.id,
        roleName: newRole.name,
        previousRoleId: existingMembershipRole?.role.id ?? null,
      },
    });

    return { success: true, role: newRole };
  }

  /**
   * Remove app access from a user
   */
  async removeAppAccess(
    tenantId: string,
    applicationId: string,
    membershipId: string,
  ) {
    const membership = await this.prisma.membership.findFirst({
      where: { id: membershipId, tenantId },
      include: {
        user: { select: { id: true, email: true, givenName: true, familyName: true } },
      },
    });

    if (!membership) {
      throw new NotFoundException('Member not found');
    }

    const application = await this.prisma.application.findUnique({
      where: { id: applicationId },
      select: { id: true, name: true, licensingMode: true },
    });

    if (!application) {
      throw new NotFoundException('Application not found');
    }

    return this.disableAppAccess(tenantId, applicationId, membership, application);
  }

  /**
   * Get members without access to a specific app
   */
  async getMembersWithoutAppAccess(tenantId: string, applicationId: string) {
    const membersWithAccess = await this.prisma.membershipRole.findMany({
      where: {
        membership: { tenantId },
        role: { applicationId },
      },
      select: { membershipId: true },
    });

    const membershipIdsWithAccess = membersWithAccess.map((m) => m.membershipId);

    const membersWithoutAccess = await this.prisma.membership.findMany({
      where: {
        tenantId,
        status: { in: ['ACTIVE', 'INVITED'] },
        id: { notIn: membershipIdsWithAccess },
      },
      include: {
        user: {
          select: { id: true, email: true, givenName: true, familyName: true },
        },
      },
    });

    return membersWithoutAccess.map((m) => ({
      membershipId: m.id,
      userId: m.user.id,
      email: m.user.email,
      name:
        [m.user.givenName, m.user.familyName].filter(Boolean).join(' ') ||
        m.user.email,
    }));
  }

  /**
   * Toggle app access for a user
   */
  async toggleAppAccess(
    tenantId: string,
    applicationId: string,
    userId: string,
    enable: boolean,
    options?: { roleId?: string; performedById?: string },
  ) {
    const membership = await this.prisma.membership.findFirst({
      where: { tenantId, userId },
      include: { user: { select: { id: true, email: true, givenName: true, familyName: true } } },
    });

    if (!membership) {
      throw new NotFoundException('Member not found in this tenant');
    }

    const application = await this.prisma.application.findUnique({
      where: { id: applicationId },
      select: { id: true, name: true, licensingMode: true },
    });

    if (!application) {
      throw new NotFoundException('Application not found');
    }

    if (enable) {
      return this.enableAppAccess(tenantId, applicationId, membership, application, options);
    } else {
      return this.disableAppAccess(tenantId, applicationId, membership, application, options);
    }
  }

  /**
   * Enable app access for a user
   */
  async enableAppAccess(
    tenantId: string,
    applicationId: string,
    membership: MembershipWithUser,
    application: ApplicationInfo,
    options?: { roleId?: string; performedById?: string },
  ) {
    // For PER_SEAT apps, access is backed by a real license seat. Claim one
    // (or reuse the user's existing seat) so that "members with access" and
    // "seats used" stay in lockstep. Throws if the seat pool is exhausted.
    let licenseAssignmentId: string | undefined;
    if (application.licensingMode === 'PER_SEAT') {
      licenseAssignmentId = await this.assignLicenseSeat(
        tenantId,
        applicationId,
        membership.user.id,
      );
    }

    // Find effective role
    const effectiveRoleId = await this.resolveRoleId(applicationId, options?.roleId);

    // Grant access (link the seat so the entitlement <-> assignment are connected)
    await this.appAccessService.grantAccess({
      tenantId,
      userId: membership.user.id,
      applicationId,
      accessType: AccessType.GRANTED,
      grantedById: options?.performedById,
      licenseAssignmentId,
    });

    // Assign role
    let assignedRole: { id: string; name: string; slug: string } | null = null;
    if (effectiveRoleId) {
      await this.prisma.membershipRole.deleteMany({
        where: {
          membershipId: membership.id,
          role: { applicationId },
        },
      });

      assignedRole = await this.prisma.role.findUnique({
        where: { id: effectiveRoleId },
        select: { id: true, name: true, slug: true },
      });

      await this.prisma.membershipRole.create({
        data: {
          membershipId: membership.id,
          roleId: effectiveRoleId,
        },
      });
    }

    // Emit event
    this.syncEventService
      .emit(SYNC_EVENT_TYPES.APP_ACCESS_GRANTED, tenantId, applicationId, {
        membership_id: membership.id,
        sub: membership.user.id,
        email: membership.user.email,
        given_name: membership.user.givenName || '',
        family_name: membership.user.familyName || '',
        role_id: assignedRole?.id || '',
        role_name: assignedRole?.name || '',
        role_slug: assignedRole?.slug || '',
      })
      .catch((err) =>
        this.logger.warn(`Failed to emit app_access.granted: ${err.message}`),
      );

    await this.auditService.log({
      tenantId,
      actorUserId: options?.performedById,
      action: AUDIT_ACTIONS.APP_ACCESS_GRANTED,
      targetType: AUDIT_TARGET_TYPES.APP_ACCESS,
      targetId: membership.user.id,
      metadata: {
        membershipId: membership.id,
        applicationId,
        roleId: assignedRole?.id ?? null,
        roleName: assignedRole?.name ?? null,
      },
    });

    return { success: true, action: 'activated', userId: membership.user.id };
  }

  /**
   * Disable app access for a user
   */
  async disableAppAccess(
    tenantId: string,
    applicationId: string,
    membership: MembershipWithUser,
    application: ApplicationInfo,
    options?: { performedById?: string },
  ) {
    // Revoke access
    try {
      await this.appAccessService.revokeAccess({
        tenantId,
        userId: membership.user.id,
        applicationId,
        revokedById: options?.performedById,
      });
    } catch (e) {
      this.logger.debug(`No access record to revoke for user ${membership.user.id}`);
    }

    // Remove role
    await this.prisma.membershipRole.deleteMany({
      where: {
        membershipId: membership.id,
        role: { applicationId },
      },
    });

    // For PER_SEAT: revoke license assignment
    if (application.licensingMode === 'PER_SEAT') {
      await this.revokeLicenseAssignment(tenantId, membership.user.id, applicationId);
    }

    // Emit event
    this.syncEventService
      .emit(SYNC_EVENT_TYPES.APP_ACCESS_REVOKED, tenantId, applicationId, {
        membership_id: membership.id,
        sub: membership.user.id,
        email: membership.user.email,
      })
      .catch((err) =>
        this.logger.warn(`Failed to emit app_access.revoked: ${err.message}`),
      );

    await this.auditService.log({
      tenantId,
      actorUserId: options?.performedById,
      action: AUDIT_ACTIONS.APP_ACCESS_REVOKED,
      targetType: AUDIT_TARGET_TYPES.APP_ACCESS,
      targetId: membership.user.id,
      metadata: { membershipId: membership.id, applicationId },
    });

    return { success: true, action: 'deactivated', userId: membership.user.id };
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  private async resolveRoleId(applicationId: string, roleId?: string): Promise<string | undefined> {
    if (roleId) return roleId;

    const defaultRole = await this.prisma.role.findFirst({
      where: { applicationId, isDefault: true },
      select: { id: true },
    });
    if (defaultRole) return defaultRole.id;

    const firstRole = await this.prisma.role.findFirst({
      where: { applicationId },
      select: { id: true },
    });
    return firstRole?.id;
  }

  /**
   * Claim (or reuse) a PER_SEAT license seat for a user, keeping the
   * subscription's quantityAssigned counter in lockstep with real
   * assignments. This is the inverse of revokeLicenseAssignment. Returns the
   * licenseAssignment id so the AppAccess entitlement can link to it.
   * Idempotent: if the user already holds a seat, returns it without
   * consuming another. Throws BadRequestException if the pool is exhausted.
   */
  private async assignLicenseSeat(
    tenantId: string,
    applicationId: string,
    userId: string,
  ): Promise<string> {
    const subscription = await this.prisma.appSubscription.findFirst({
      where: { tenantId, applicationId, status: 'ACTIVE' },
      include: { licenseType: true },
    });

    if (!subscription) {
      throw new BadRequestException('No active subscription for this application');
    }

    // Reuse an existing seat if the user already has one (idempotent re-enable).
    const existing = await this.prisma.licenseAssignment.findUnique({
      where: {
        tenantId_userId_applicationId: { tenantId, userId, applicationId },
      },
      select: { id: true },
    });
    if (existing) return existing.id;

    const assignmentId = await this.prisma.$transaction(async (tx) => {
      // Atomically claim a seat: only increments when there is still headroom,
      // which guards against oversubscription under concurrent grants.
      const claimed = await tx.appSubscription.updateMany({
        where: {
          id: subscription.id,
          quantityAssigned: { lt: subscription.quantityPurchased },
        },
        data: { quantityAssigned: { increment: 1 } },
      });

      if (claimed.count === 0) {
        throw new BadRequestException(
          'No seats available. Purchase more seats to grant access.',
        );
      }

      const assignment = await tx.licenseAssignment.create({
        data: {
          userId,
          tenantId,
          applicationId,
          subscriptionId: subscription.id,
          licenseTypeId: subscription.licenseTypeId,
          licenseTypeName: subscription.licenseType.name,
        },
        select: { id: true },
      });

      return assignment.id;
    });

    // A NEW seat was consumed → emit the per-app identity-sync license event
    // (mirrors LicenseAssignmentService.grantLicense so BOTH grant paths agree).
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    this.syncEventService
      .emit(SYNC_EVENT_TYPES.LICENSE_ASSIGNED, tenantId, applicationId, {
        assignment_id: assignmentId,
        sub: userId,
        email: user?.email,
        license_type_id: subscription.licenseTypeId,
        license_type_name: subscription.licenseType.name,
      })
      .catch((err) => this.logger.warn(`Failed to emit license.assigned: ${err.message}`));

    return assignmentId;
  }

  private async revokeLicenseAssignment(
    tenantId: string,
    userId: string,
    applicationId: string,
  ): Promise<void> {
    try {
      const assignment = await this.prisma.licenseAssignment.findUnique({
        where: {
          tenantId_userId_applicationId: {
            tenantId,
            userId,
            applicationId,
          },
        },
      });

      if (assignment) {
        await this.prisma.$transaction(async (tx) => {
          await tx.licenseAssignment.delete({
            where: { id: assignment.id },
          });
          await tx.appSubscription.updateMany({
            where: {
              id: assignment.subscriptionId,
              quantityAssigned: { gt: 0 },
            },
            data: { quantityAssigned: { decrement: 1 } },
          });
        });

        // A real seat was released → emit the per-app identity-sync event.
        const user = await this.prisma.user.findUnique({
          where: { id: userId },
          select: { email: true },
        });
        this.syncEventService
          .emit(SYNC_EVENT_TYPES.LICENSE_REVOKED, tenantId, applicationId, {
            assignment_id: assignment.id,
            sub: userId,
            email: user?.email,
          })
          .catch((err) => this.logger.warn(`Failed to emit license.revoked: ${err.message}`));
      }
    } catch (e) {
      this.logger.warn(`Failed to revoke license assignment: ${e}`);
    }
  }
}
