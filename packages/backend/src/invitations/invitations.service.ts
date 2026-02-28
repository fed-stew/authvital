import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as crypto from 'crypto';
import { LicensePoolService } from '../licensing/services/license-pool.service';
import { LicenseAssignmentService } from '../licensing/services/license-assignment.service';
import { LicenseProvisioningService } from '../licensing/services/license-provisioning.service';
import { SyncEventService, SYNC_EVENT_TYPES } from '../sync';
import { EmailService } from '../auth/email.service';
import { AppAccessService } from '../authorization';
import { InvitationManagementService } from './invitation-management.service';

export interface CreateInvitationDto {
  email: string;
  tenantId: string;
  roleId?: string;
  invitedById?: string;
  expiresInDays?: number;
  clientId?: string;
  applicationId?: string;
  licenseTypeId?: string;
  autoAssign?: boolean;
  givenName?: string;
  familyName?: string;
}

/**
 * InvitationsService - Core invitation flows
 *
 * Handles:
 * - Create invitation (with validation)
 * - Get invitation by token
 * - Accept invitation
 *
 * For admin operations (list, revoke, resend, update),
 * see InvitationManagementService
 */
@Injectable()
export class InvitationsService {
  private readonly logger = new Logger(InvitationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly licensePoolService: LicensePoolService,
    private readonly licenseAssignmentService: LicenseAssignmentService,
    private readonly licenseProvisioningService: LicenseProvisioningService,
    private readonly syncEventService: SyncEventService,
    private readonly emailService: EmailService,
    private readonly appAccessService: AppAccessService,
    private readonly invitationManagementService: InvitationManagementService,
  ) {}

  /**
   * Create an invitation to join a tenant
   */
  async createInvitation(data: CreateInvitationDto) {
    const {
      email,
      tenantId,
      roleId,
      invitedById,
      expiresInDays = 7,
      clientId,
      applicationId,
      licenseTypeId,
      autoAssign = false,
      givenName,
      familyName,
    } = data;

    if (!roleId) {
      throw new BadRequestException(
        'roleId is required. Use /api/authorization/tenant-roles to get valid role IDs.',
      );
    }

    // Validate tenant and role exist
    const [tenant, tenantRole] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { id: tenantId } }),
      this.prisma.tenantRole.findUnique({ where: { id: roleId } }),
    ]);

    if (!tenant) throw new NotFoundException('Tenant not found');
    if (!tenantRole) throw new BadRequestException('Invalid role ID');

    // Check member limits
    const limitCheck = await this.licenseProvisioningService.checkMemberLimit(
      tenantId,
      applicationId,
    );
    if (!limitCheck.allowed) {
      throw new ForbiddenException(
        limitCheck.reason ||
          `Member limit reached (${limitCheck.maxAllowed}). Upgrade your plan to add more members.`,
      );
    }

    // Check for existing user/membership
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { memberships: { where: { tenantId } } },
    });

    if (user?.memberships.length) {
      throw new ConflictException('User is already a member of this tenant');
    }

    // Check for existing pending invitation
    const existingInvite = await this.prisma.invitation.findFirst({
      where: {
        email: email.toLowerCase(),
        tenantId,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    if (existingInvite) {
      throw new ConflictException('An invitation for this email is already pending');
    }

    // Validate license assignment if applicationId provided
    const application = await this.validateLicenseAssignment(
      applicationId,
      licenseTypeId,
      tenantId,
      clientId,
    );

    // Generate token and calculate expiration
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);

    // Create everything in a transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Create user if doesn't exist
      let targetUserId: string;
      if (user) {
        targetUserId = user.id;
      } else {
        const newUser = await tx.user.create({
          data: {
            email: email.toLowerCase(),
            givenName: givenName || undefined,
            familyName: familyName || undefined,
          },
        });
        targetUserId = newUser.id;
        this.logger.log(`Created placeholder user for invitation: ${targetUserId}`);
      }

      // 2. Create membership with INVITED status
      const membership = await tx.membership.create({
        data: {
          userId: targetUserId,
          tenantId,
          status: 'INVITED',
        },
      });
      this.logger.log(`Created INVITED membership: ${membership.id}`);

      // 3. Assign tenant role
      await tx.membershipTenantRole.create({
        data: {
          membershipId: membership.id,
          tenantRoleId: roleId,
        },
      });

      // 4. Create invitation record
      const invitation = await tx.invitation.create({
        data: {
          email: email.toLowerCase(),
          token,
          expiresAt,
          tenantId,
          invitedById,
          clientId: clientId || application?.clientId,
          membershipId: membership.id,
          metadata: { applicationId, licenseTypeId, autoAssign },
        },
        include: {
          tenant: { select: { id: true, name: true, slug: true } },
          invitedBy: {
            select: { id: true, email: true, givenName: true, familyName: true },
          },
        },
      });

      return { invitation, membership, userId: targetUserId };
    });

    // Send invitation email
    const baseUrl = process.env.BASE_URL!;
    const inviteUrl = `${baseUrl}/invite?token=${result.invitation.token}`;

    await this.emailService.sendInvitationEmail(email, {
      inviterName: result.invitation.invitedBy
        ? `${result.invitation.invitedBy.givenName || ''} ${result.invitation.invitedBy.familyName || ''}`.trim() ||
          result.invitation.invitedBy.email ||
          undefined
        : undefined,
      tenantName: result.invitation.tenant.name,
      inviteUrl,
    });

    // Emit sync event
    this.syncEventService
      .emit(SYNC_EVENT_TYPES.INVITE_CREATED, tenantId, applicationId || '', {
        invite_id: result.invitation.id,
        membership_id: result.membership.id,
        email: result.invitation.email,
        tenant_roles: [tenantRole.slug],
        invited_by_sub: invitedById,
        expires_at: expiresAt.toISOString(),
      })
      .catch((err) => this.logger.warn(`Failed to emit invite.created: ${err.message}`));

    return {
      id: result.invitation.id,
      email: result.invitation.email,
      token: result.invitation.token,
      expiresAt: result.invitation.expiresAt,
      tenant: result.invitation.tenant,
      invitedBy: result.invitation.invitedBy,
      membership: { id: result.membership.id, status: result.membership.status },
      inviteUrl,
    };
  }

  /**
   * Get invitation details by token
   */
  async getInvitationByToken(token: string) {
    const invitation = await this.prisma.invitation.findUnique({
      where: { token },
      include: {
        tenant: { select: { id: true, name: true, slug: true } },
        invitedBy: { select: { givenName: true, familyName: true, email: true } },
        membership: {
          include: {
            membershipTenantRoles: { include: { tenantRole: true } },
          },
        },
      },
    });

    if (!invitation) throw new NotFoundException('Invitation not found');
    if (invitation.consumedAt) throw new BadRequestException('This invitation has already been used');
    if (invitation.expiresAt < new Date()) throw new BadRequestException('This invitation has expired');

    const tenantRole = invitation.membership?.membershipTenantRoles?.[0]?.tenantRole;

    return {
      id: invitation.id,
      email: invitation.email,
      role: tenantRole?.name || 'Member',
      expiresAt: invitation.expiresAt,
      tenant: invitation.tenant,
      invitedBy: invitation.invitedBy
        ? {
            name:
              [invitation.invitedBy.givenName, invitation.invitedBy.familyName]
                .filter(Boolean)
                .join(' ') || invitation.invitedBy.email,
          }
        : null,
    };
  }

  /**
   * Accept an invitation
   */
  async acceptInvitation(data: {
    token: string;
    password?: string;
    givenName?: string;
    familyName?: string;
  }) {
    const { token, password, givenName, familyName } = data;

    if (!token?.trim()) {
      throw new BadRequestException('Token is required');
    }

    const invitation = await this.prisma.invitation.findUnique({
      where: { token },
      include: {
        tenant: { select: { id: true, name: true, slug: true } },
        membership: {
          include: {
            user: true,
            membershipTenantRoles: { include: { tenantRole: true } },
          },
        },
      },
    });

    if (!invitation) throw new NotFoundException('Invitation not found');
    if (invitation.consumedAt) throw new BadRequestException('This invitation has already been used');
    if (invitation.expiresAt < new Date()) throw new BadRequestException('This invitation has expired');
    if (!invitation.membership) throw new BadRequestException('Invalid invitation - no membership linked');

    const user = invitation.membership.user;

    // If user has no password, they need to set one
    if (!user.passwordHash && !password) {
      return {
        success: false,
        needsPassword: true,
        email: user.email,
        message: 'Please create a password to set up your account.',
      };
    }

    // Look up application for redirect URL
    const application = invitation.clientId
      ? await this.prisma.application.findUnique({
          where: { clientId: invitation.clientId },
          select: { clientId: true, initiateLoginUri: true },
        })
      : null;

    // Update user and membership in transaction
    const result = await this.prisma.$transaction(async (tx) => {
      const updateData: Record<string, unknown> = {};
      if (password) {
        const bcrypt = await import('bcrypt');
        updateData.passwordHash = await bcrypt.hash(password, 12);
      }
      if (givenName) updateData.givenName = givenName;
      if (familyName) updateData.familyName = familyName;

      const updatedUser = Object.keys(updateData).length > 0
        ? await tx.user.update({ where: { id: user.id }, data: updateData })
        : user;

      const updatedMembership = await tx.membership.update({
        where: { id: invitation.membership!.id },
        data: { status: 'ACTIVE', joinedAt: new Date() },
        include: { tenant: { select: { id: true, name: true, slug: true } } },
      });

      await tx.invitation.update({
        where: { id: invitation.id },
        data: { consumedAt: new Date(), consumedById: user.id },
      });

      return { user: updatedUser, membership: updatedMembership };
    });

    this.logger.log(`Invitation accepted - membership activated: ${result.membership.id}`);

    // Auto-grant app access and licenses
    await this.handlePostAcceptanceGrants(invitation, result.user);

    // Emit sync events
    await this.emitAcceptanceEvents(invitation, result);

    return {
      success: true,
      user: {
        id: result.user.id,
        email: result.user.email,
        givenName: result.user.givenName,
        familyName: result.user.familyName,
      },
      tenant: invitation.tenant,
      membership: { id: result.membership.id, status: result.membership.status },
      redirectUrl: application?.initiateLoginUri?.replace('{tenant}', invitation.tenant.slug) || null,
      clientId: invitation.clientId,
    };
  }

  // ===========================================================================
  // DELEGATED METHODS (for backward compatibility)
  // ===========================================================================

  async listTenantInvitations(tenantId: string) {
    return this.invitationManagementService.listTenantInvitations(tenantId);
  }

  async revokeInvitation(invitationId: string) {
    return this.invitationManagementService.revokeInvitation(invitationId);
  }

  async resendInvitationEmail(invitationId: string) {
    return this.invitationManagementService.resendInvitationEmail(invitationId);
  }

  async updateInvitation(invitationId: string, data: { roleId?: string }) {
    return this.invitationManagementService.updateInvitation(invitationId, data);
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  private async validateLicenseAssignment(
    applicationId?: string,
    licenseTypeId?: string,
    tenantId?: string,
    clientId?: string,
  ) {
    let application: { id: string; name: string; licensingMode: string; clientId: string } | null = null;

    if (applicationId) {
      application = await this.prisma.application.findUnique({
        where: { id: applicationId },
        select: { id: true, name: true, licensingMode: true, clientId: true },
      });

      if (!application) throw new NotFoundException('Application not found');

      const accessCheck = await this.licensePoolService.checkMemberAccess(tenantId!, application.id);
      if (!accessCheck.allowed) {
        throw new ForbiddenException(accessCheck.reason || 'Cannot add member to this application');
      }

      // Validate based on licensing mode
      if (application.licensingMode === 'PER_SEAT') {
        if (!licenseTypeId) {
          throw new BadRequestException('License type is required for PER_SEAT applications');
        }

        const licenseType = await this.prisma.licenseType.findFirst({
          where: { id: licenseTypeId, applicationId: application.id },
        });
        if (!licenseType) {
          throw new BadRequestException('License type does not belong to this application');
        }

        const capacity = await this.licensePoolService.getAvailableCapacity(
          tenantId!,
          application.id,
          licenseTypeId,
        );
        if (!capacity || capacity.available <= 0) {
          throw new BadRequestException(`No available seats for ${licenseType.name}. Purchase more seats first.`);
        }
      }
    }

    if (clientId && !application) {
      application = await this.prisma.application.findUnique({
        where: { clientId },
        select: { id: true, name: true, licensingMode: true, clientId: true },
      });
      if (!application) throw new NotFoundException('Application not found');
    }

    return application;
  }

  private async handlePostAcceptanceGrants(
    invitation: { tenantId: string; invitedById: string | null; metadata: unknown },
    user: { id: string; email: string | null },
  ) {
    // Grant access to FREE and TENANT_WIDE apps
    try {
      await this.appAccessService.autoGrantFreeApps(
        invitation.tenantId,
        user.id,
        invitation.invitedById || undefined,
      );
      await this.appAccessService.autoGrantTenantWideApps(
        invitation.tenantId,
        user.id,
        invitation.invitedById || undefined,
      );
    } catch (err) {
      this.logger.warn(`Failed to auto-grant app access: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Auto-assign license if metadata indicates
    const metadata = invitation.metadata as Record<string, unknown> | null;
    if (metadata?.autoAssign && metadata?.applicationId) {
      try {
        const app = await this.prisma.application.findUnique({
          where: { id: metadata.applicationId as string },
          select: { id: true, licensingMode: true, name: true },
        });

        if (app?.licensingMode === 'PER_SEAT' && metadata.licenseTypeId) {
          const capacity = await this.licensePoolService.getAvailableCapacity(
            invitation.tenantId,
            app.id,
            metadata.licenseTypeId as string,
          );

          if (capacity && capacity.available > 0) {
            await this.licenseAssignmentService.grantLicense({
              tenantId: invitation.tenantId,
              userId: user.id,
              applicationId: app.id,
              licenseTypeId: metadata.licenseTypeId as string,
              assignedById: invitation.invitedById || user.id,
            });
            this.logger.log(`Auto-assigned license to user ${user.email}`);
          }
        }
      } catch (err) {
        this.logger.error(`Failed to auto-assign license: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  private async emitAcceptanceEvents(
    invitation: {
      id: string;
      email: string;
      tenantId: string;
      clientId: string | null;
      tenant: { slug: string };
      membership: {
        id: string;
        membershipTenantRoles: Array<{ tenantRole: { slug: string } }>;
      } | null;
    },
    result: {
      user: { id: string; email: string | null; givenName: string | null; familyName: string | null };
      membership: { id: string };
    },
  ) {
    const appIdsToNotify = invitation.clientId
      ? await this.invitationManagementService.getApplicationIdFromClientId(invitation.clientId)
      : await this.invitationManagementService.getApplicationIdsForTenant(invitation.tenantId);

    const tenantRoleSlugs = invitation.membership?.membershipTenantRoles.map(
      (mtr) => mtr.tenantRole.slug,
    ) || [];

    for (const appId of appIdsToNotify) {
      this.syncEventService
        .emit(SYNC_EVENT_TYPES.INVITE_ACCEPTED, invitation.tenantId, appId, {
          invite_id: invitation.id,
          membership_id: result.membership.id,
          email: invitation.email,
          tenant_roles: tenantRoleSlugs,
          sub: result.user.id,
          given_name: result.user.givenName,
          family_name: result.user.familyName,
        })
        .catch((err) => this.logger.warn(`Failed to emit invite.accepted: ${err.message}`));

      this.syncEventService
        .emit(SYNC_EVENT_TYPES.MEMBER_JOINED, invitation.tenantId, appId, {
          membership_id: result.membership.id,
          sub: result.user.id,
          email: result.user.email,
          tenant_roles: tenantRoleSlugs,
          given_name: result.user.givenName,
          family_name: result.user.familyName,
        })
        .catch((err) => this.logger.warn(`Failed to emit member.joined: ${err.message}`));
    }
  }
}
