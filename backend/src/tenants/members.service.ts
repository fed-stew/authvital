import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SyncEventService, SYNC_EVENT_TYPES } from '../sync';
import { AppAccessService } from '../authorization';
import { MembershipStatus, SubscriptionStatus, AccessType } from '@prisma/client';
import { InviteMemberDto } from './dto/invite-member.dto';

/**
 * MembersService - Member management operations
 *
 * Consolidated from:
 * - TenancyService (inviteUser, acceptInvitation, removeMember)
 * - TenantManagementService (getMembers, getMemberDetail, updateMemberStatus, removeMember, etc.)
 *
 * This service handles member lifecycle:
 * - Invite/accept invitations
 * - List/get member details
 * - Update member status (suspend/activate)
 * - Remove members
 * - Manage app access and roles
 */
@Injectable()
export class MembersService {
  private readonly logger = new Logger(MembersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly syncEventService: SyncEventService,
    private readonly appAccessService: AppAccessService,
  ) {}

  // ===========================================================================
  // MEMBER CRUD
  // ===========================================================================

  /**
   * Invite a user to a tenant
   * Creates a membership with INVITED status
   */
  async inviteUser(dto: InviteMemberDto) {
    if (!dto.userId) {
      throw new BadRequestException('userId is required for direct membership invitation');
    }

    // Get tenant with current member count
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: dto.tenantId },
      include: {
        memberships: {
          where: {
            status: { in: [MembershipStatus.ACTIVE, MembershipStatus.INVITED] },
          },
        },
        appSubscriptions: {
          where: {
            status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] },
          },
          include: { licenseType: true },
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    // Verify user exists
    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check if user already has membership
    const existingMembership = await this.prisma.membership.findUnique({
      where: {
        userId_tenantId: {
          userId: dto.userId,
          tenantId: dto.tenantId,
        },
      },
    });

    if (existingMembership) {
      throw new ConflictException('User is already a member of this tenant');
    }

    // Get tenant role (default to 'member')
    const tenantRole = await this.prisma.tenantRole.findUnique({
      where: { slug: dto.tenantRoleSlug || 'member' },
    });

    const currentMemberCount = tenant.memberships.length;

    // Create invitation/membership
    const membership = await this.prisma.membership.create({
      data: {
        userId: dto.userId,
        tenantId: dto.tenantId,
        status: MembershipStatus.INVITED,
        ...(tenantRole && {
          membershipTenantRoles: {
            create: { tenantRoleId: tenantRole.id },
          },
        }),
      },
      include: {
        user: {
          select: { id: true, email: true },
        },
        tenant: {
          select: { id: true, name: true, slug: true },
        },
        membershipTenantRoles: {
          include: { tenantRole: true },
        },
      },
    });

    this.logger.log(`User ${user.email} invited to tenant ${tenant.name}`);

    return {
      membership,
      seatsUsed: currentMemberCount + 1,
    };
  }

  /**
   * Accept an invitation
   */
  async acceptInvitation(membershipId: string, userId: string) {
    const membership = await this.prisma.membership.findUnique({
      where: { id: membershipId },
      include: {
        tenant: { select: { id: true, name: true, slug: true } },
      },
    });

    if (!membership) {
      throw new NotFoundException('Membership not found');
    }

    if (membership.userId !== userId) {
      throw new ForbiddenException('This invitation is not for you');
    }

    if (membership.status !== MembershipStatus.INVITED) {
      throw new BadRequestException('Invitation has already been processed');
    }

    const updated = await this.prisma.membership.update({
      where: { id: membershipId },
      data: {
        status: MembershipStatus.ACTIVE,
        joinedAt: new Date(),
      },
      include: {
        tenant: { select: { id: true, name: true, slug: true } },
      },
    });

    this.logger.log(`User ${userId} accepted invitation to ${membership.tenant.name}`);

    // Auto-grant access to FREE and TENANT_WIDE apps for the new member
    try {
      await this.appAccessService.autoGrantFreeApps(membership.tenantId, userId);
      await this.appAccessService.autoGrantTenantWideApps(membership.tenantId, userId);
      this.logger.log(`Auto-granted FREE/TENANT_WIDE app access for user ${userId}`);
    } catch (err) {
      // Log but don't fail - access grants are secondary to membership activation
      this.logger.warn(
        `Failed to auto-grant app access for user ${userId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return updated;
  }

  /**
   * Get all members of a tenant
   */
  async getMembers(tenantId: string) {
    const memberships = await this.prisma.membership.findMany({
      where: { tenantId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            givenName: true,
            familyName: true,
          },
        },
        membershipTenantRoles: {
          include: { tenantRole: true },
        },
        membershipRoles: {
          include: {
            role: {
              include: {
                application: {
                  select: { id: true, name: true },
                },
              },
            },
          },
        },
        invitation: {
          select: {
            id: true,
            expiresAt: true,
            invitedBy: {
              select: {
                id: true,
                email: true,
                givenName: true,
                familyName: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return memberships.map((m) => ({
      id: m.id,
      status: m.status,
      joinedAt: m.joinedAt,
      user: m.user,
      tenantRoles: m.membershipTenantRoles.map((mtr) => ({
        id: mtr.tenantRole.id,
        name: mtr.tenantRole.name,
        slug: mtr.tenantRole.slug,
      })),
      appAccess: m.membershipRoles.map((mr) => ({
        appId: mr.role.application.id,
        appName: mr.role.application.name,
        roleId: mr.role.id,
        roleName: mr.role.name,
      })),
      invitation:
        m.status === 'INVITED' && m.invitation
          ? {
              id: m.invitation.id,
              expiresAt: m.invitation.expiresAt,
              invitedBy: m.invitation.invitedBy,
            }
          : undefined,
    }));
  }

  /**
   * Get member details
   */
  async getMemberDetail(tenantId: string, membershipId: string) {
    const membership = await this.prisma.membership.findFirst({
      where: { id: membershipId, tenantId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            givenName: true,
            familyName: true,
            createdAt: true,
          },
        },
        membershipTenantRoles: {
          include: { tenantRole: true },
        },
        membershipRoles: {
          include: {
            role: {
              include: {
                application: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    });

    if (!membership) {
      throw new NotFoundException('Member not found');
    }

    return {
      id: membership.id,
      status: membership.status,
      joinedAt: membership.joinedAt,
      user: membership.user,
      tenantRoles: membership.membershipTenantRoles.map((mtr) => mtr.tenantRole),
      appAccess: membership.membershipRoles.map((mr) => ({
        appId: mr.role.application.id,
        appName: mr.role.application.name,
        roleId: mr.role.id,
        roleName: mr.role.name,
        roleSlug: mr.role.slug,
      })),
    };
  }

  /**
   * Update member status (suspend/activate)
   */
  async updateMemberStatus(
    tenantId: string,
    membershipId: string,
    status: 'ACTIVE' | 'SUSPENDED',
  ) {
    const membership = await this.prisma.membership.findFirst({
      where: { id: membershipId, tenantId },
      include: {
        user: { select: { id: true, email: true } },
        membershipRoles: {
          include: { role: { select: { applicationId: true } } },
        },
        membershipTenantRoles: {
          include: { tenantRole: true },
        },
      },
    });

    if (!membership) {
      throw new NotFoundException('Member not found');
    }

    // Check if member has owner role
    const hasOwnerRole = membership.membershipTenantRoles.some(
      (mtr) => mtr.tenantRole.slug === 'owner',
    );
    if (hasOwnerRole && status === 'SUSPENDED') {
      throw new BadRequestException('Cannot suspend tenant owner');
    }

    const updated = await this.prisma.membership.update({
      where: { id: membershipId },
      data: { status },
    });

    // Emit event to all applications the member has access to
    const applicationIds = [
      ...new Set(membership.membershipRoles.map((mr) => mr.role.applicationId)),
    ];

    const eventType =
      status === 'SUSPENDED'
        ? SYNC_EVENT_TYPES.MEMBER_SUSPENDED
        : SYNC_EVENT_TYPES.MEMBER_ACTIVATED;

    for (const applicationId of applicationIds) {
      this.syncEventService
        .emit(eventType, tenantId, applicationId, {
          membership_id: membershipId,
          sub: membership.user.id,
          email: membership.user.email,
        })
        .catch((err) => this.logger.warn(`Failed to emit ${eventType}: ${err.message}`));
    }

    this.logger.log(`Member ${membershipId} status changed to ${status}`);
    return updated;
  }

  /**
   * Remove member from tenant
   * Consolidated from both modules (TenancyService and TenantManagementService)
   */
  async removeMember(tenantId: string, membershipId: string) {
    const membership = await this.prisma.membership.findFirst({
      where: { id: membershipId, tenantId },
      include: {
        user: { select: { id: true, email: true } },
        membershipRoles: {
          include: { role: { select: { applicationId: true } } },
        },
        membershipTenantRoles: {
          include: { tenantRole: true },
        },
      },
    });

    if (!membership) {
      throw new NotFoundException('Member not found');
    }

    // Check if member has owner role
    const hasOwnerRole = membership.membershipTenantRoles.some(
      (mtr) => mtr.tenantRole.slug === 'owner',
    );
    if (hasOwnerRole) {
      throw new BadRequestException('Cannot remove tenant owner');
    }

    // Get application IDs before deletion for sync events
    const applicationIds = [
      ...new Set(membership.membershipRoles.map((mr) => mr.role.applicationId)),
    ];

    // Remove membership (cascades to roles and licenses)
    await this.prisma.membership.delete({
      where: { id: membershipId },
    });

    // Emit member.left event to all applications
    for (const applicationId of applicationIds) {
      this.syncEventService
        .emit(SYNC_EVENT_TYPES.MEMBER_LEFT, tenantId, applicationId, {
          membership_id: membershipId,
          sub: membership.user.id,
          email: membership.user.email,
        })
        .catch((err) =>
          this.logger.warn(`Failed to emit member.left: ${err.message}`),
        );
    }

    this.logger.log(`Member ${membership.user.email} removed from tenant ${tenantId}`);
    return { success: true, message: 'Member removed successfully' };
  }

  /**
   * Change a member's tenant role
   */
  async changeMemberRole(tenantId: string, membershipId: string, roleSlug: string) {
    const membership = await this.prisma.membership.findFirst({
      where: { id: membershipId, tenantId },
      include: {
        membershipTenantRoles: {
          include: { tenantRole: true },
        },
      },
    });

    if (!membership) {
      throw new NotFoundException('Membership not found');
    }

    const newRole = await this.prisma.tenantRole.findUnique({
      where: { slug: roleSlug },
    });

    if (!newRole) {
      throw new NotFoundException(`Role '${roleSlug}' not found`);
    }

    // Check if trying to remove the last owner
    const currentRoles = membership.membershipTenantRoles.map((mtr) => mtr.tenantRole.slug);
    const isCurrentlyOwner = currentRoles.includes('owner');

    if (isCurrentlyOwner && roleSlug !== 'owner') {
      const otherOwners = await this.prisma.membershipTenantRole.count({
        where: {
          tenantRole: { slug: 'owner' },
          membership: {
            tenantId,
            id: { not: membershipId },
            status: { not: 'SUSPENDED' },
          },
        },
      });

      if (otherOwners === 0) {
        throw new BadRequestException('Cannot remove the last owner. Transfer ownership first.');
      }
    }

    // Remove all existing tenant roles and add the new one
    await this.prisma.$transaction(async (tx) => {
      await tx.membershipTenantRole.deleteMany({
        where: { membershipId },
      });

      await tx.membershipTenantRole.create({
        data: {
          membershipId,
          tenantRoleId: newRole.id,
        },
      });
    });

    this.logger.log(`Member ${membershipId} role changed to ${newRole.name}`);
    return { success: true, message: `Role changed to ${newRole.name}` };
  }

  // ===========================================================================
  // APP ACCESS MANAGEMENT
  // ===========================================================================

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

    // Get application to check licensing mode
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

      // Check how many of these members already have access (don't count them twice)
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
          `Not enough seats available. Need ${newUsersCount} seats but only ${seatsAvailable} available. Purchase more seats to grant access.`,
        );
      }
    }

    // Use enableAppAccess for each member to avoid duplicating logic
    // Note: We've already done the bulk seat check above, so individual checks will pass
    let grantedCount = 0;
    for (const membership of memberships) {
      try {
        await this.enableAppAccess(
          tenantId,
          applicationId,
          membership,
          application,
          { roleId },
        );
        grantedCount++;
      } catch (err) {
        this.logger.warn(`Failed to grant access to user ${membership.user.id}: ${err}`);
      }
    }

    this.logger.log(
      `Granted app access to ${grantedCount} members for app ${applicationId}`,
    );

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

    // Delegate to disableAppAccess which handles everything including licenses
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
   * Enable app access for a user (private helper)
   */
  private async enableAppAccess(
    tenantId: string,
    applicationId: string,
    membership: { id: string; user: { id: string; email: string | null; givenName?: string | null; familyName?: string | null } },
    application: { id: string; name: string; licensingMode: string },
    options?: { roleId?: string; performedById?: string },
  ) {
    // For PER_SEAT: check seat availability
    if (application.licensingMode === 'PER_SEAT') {
      const subscription = await this.prisma.appSubscription.findFirst({
        where: { tenantId, applicationId, status: 'ACTIVE' },
      });

      if (!subscription) {
        throw new BadRequestException('No active subscription for this application');
      }

      const seatsAvailable = subscription.quantityPurchased - subscription.quantityAssigned;
      if (seatsAvailable <= 0) {
        throw new BadRequestException('No seats available. Purchase more seats to grant access.');
      }
    }

    // Find effective role
    let effectiveRoleId = options?.roleId;
    if (!effectiveRoleId) {
      const defaultRole = await this.prisma.role.findFirst({
        where: { applicationId, isDefault: true },
        select: { id: true },
      });
      effectiveRoleId = defaultRole?.id;

      if (!effectiveRoleId) {
        const firstRole = await this.prisma.role.findFirst({
          where: { applicationId },
          select: { id: true },
        });
        effectiveRoleId = firstRole?.id;
      }
    }

    // Grant access
    await this.appAccessService.grantAccess({
      tenantId,
      userId: membership.user.id,
      applicationId,
      accessType: AccessType.GRANTED,
      grantedById: options?.performedById,
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

    return { success: true, action: 'activated', userId: membership.user.id };
  }

  /**
   * Disable app access for a user (private helper)
   */
  private async disableAppAccess(
    tenantId: string,
    applicationId: string,
    membership: { id: string; user: { id: string; email: string | null; givenName?: string | null; familyName?: string | null } },
    application: { id: string; name: string; licensingMode: string },
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
      try {
        const assignment = await this.prisma.licenseAssignment.findUnique({
          where: {
            tenantId_userId_applicationId: {
              tenantId,
              userId: membership.user.id,
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
        }
      } catch (e) {
        this.logger.warn(`Failed to revoke license assignment: ${e}`);
      }
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

    return { success: true, action: 'deactivated', userId: membership.user.id };
  }
}
