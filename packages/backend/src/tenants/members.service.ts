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
import { MembershipStatus, SubscriptionStatus } from '@prisma/client';
import { InviteMemberDto } from './dto/invite-member.dto';

/**
 * MembersService - Core member lifecycle operations
 *
 * Handles:
 * - Invite/accept invitations
 * - List/get member details
 * - Update member status (suspend/activate)
 * - Remove members
 * - Change tenant roles
 *
 * For app access management, see MemberAppAccessService
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

    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

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

    const tenantRole = await this.prisma.tenantRole.findUnique({
      where: { slug: dto.tenantRoleSlug || 'member' },
    });

    const currentMemberCount = tenant.memberships.length;

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

    const hasOwnerRole = membership.membershipTenantRoles.some(
      (mtr) => mtr.tenantRole.slug === 'owner',
    );
    if (hasOwnerRole) {
      throw new BadRequestException('Cannot remove tenant owner');
    }

    const applicationIds = [
      ...new Set(membership.membershipRoles.map((mr) => mr.role.applicationId)),
    ];

    await this.prisma.membership.delete({
      where: { id: membershipId },
    });

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
}
