import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SyncEventService, SYNC_EVENT_TYPES } from '../sync';
import { EmailService } from '../auth/email.service';

/**
 * InvitationManagementService - Administrative invitation operations
 *
 * Handles:
 * - List pending invitations
 * - Revoke/delete invitations
 * - Resend invitation emails
 * - Update invitation details
 */
@Injectable()
export class InvitationManagementService {
  private readonly logger = new Logger(InvitationManagementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly syncEventService: SyncEventService,
    private readonly emailService: EmailService,
  ) {}

  /**
   * List pending invitations for a tenant
   */
  async listTenantInvitations(tenantId: string) {
    return this.prisma.invitation.findMany({
      where: {
        tenantId,
        consumedAt: null,
      },
      include: {
        invitedBy: {
          select: { id: true, email: true, givenName: true, familyName: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Revoke/delete an invitation
   *
   * Also deletes the membership and potentially the placeholder user
   */
  async revokeInvitation(invitationId: string) {
    const invitation = await this.prisma.invitation.findUnique({
      where: { id: invitationId },
      include: {
        membership: {
          include: {
            user: {
              include: {
                memberships: true,
              },
            },
          },
        },
      },
    });

    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }

    if (invitation.consumedAt) {
      throw new BadRequestException('Cannot revoke a consumed invitation');
    }

    const { tenantId, email, clientId } = invitation;
    const membershipId = invitation.membership?.id;

    await this.prisma.$transaction(async (tx) => {
      // Delete the invitation first (to avoid FK constraint issues)
      await tx.invitation.delete({
        where: { id: invitationId },
      });

      // Delete the membership if it exists
      if (invitation.membership) {
        await tx.membership.delete({
          where: { id: invitation.membership.id },
        });
        this.logger.log(`Deleted INVITED membership: ${invitation.membership.id}`);

        // If user has no other memberships and no password (placeholder), delete them
        const user = invitation.membership.user;
        if (user && !user.passwordHash && user.memberships.length <= 1) {
          await tx.user.delete({
            where: { id: user.id },
          });
          this.logger.log(`Deleted placeholder user: ${user.id}`);
        }
      }
    });

    // Emit invite.deleted event
    const appIdsToNotify = clientId
      ? await this.getApplicationIdFromClientId(clientId)
      : await this.getApplicationIdsForTenant(tenantId);

    for (const appId of appIdsToNotify) {
      this.syncEventService
        .emit(SYNC_EVENT_TYPES.INVITE_DELETED, tenantId, appId, {
          invite_id: invitationId,
          membership_id: membershipId || '',
          email,
        })
        .catch((err) =>
          this.logger.warn(`Failed to emit invite.deleted: ${err.message}`),
        );
    }

    return { success: true, message: 'Invitation revoked' };
  }

  /**
   * Resend invitation email
   */
  async resendInvitationEmail(invitationId: string) {
    const invitation = await this.prisma.invitation.findUnique({
      where: { id: invitationId },
      include: {
        tenant: { select: { id: true, name: true, slug: true } },
        invitedBy: {
          select: { id: true, email: true, givenName: true, familyName: true },
        },
      },
    });

    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }

    if (invitation.consumedAt) {
      throw new BadRequestException('This invitation has already been used');
    }

    if (invitation.expiresAt < new Date()) {
      throw new BadRequestException('This invitation has expired');
    }

    const baseUrl = process.env.BASE_URL!;
    const inviteUrl = `${baseUrl}/invite?token=${invitation.token}`;

    await this.emailService.sendInvitationEmail(invitation.email, {
      inviterName: invitation.invitedBy
        ? `${invitation.invitedBy.givenName || ''} ${invitation.invitedBy.familyName || ''}`.trim() ||
          invitation.invitedBy.email ||
          undefined
        : undefined,
      tenantName: invitation.tenant.name,
      inviteUrl,
    });

    return { success: true, message: 'Invitation email resent' };
  }

  /**
   * Update an invitation (e.g., change role)
   *
   * Updates the role on the linked membership instead of on the invitation
   */
  async updateInvitation(invitationId: string, data: { roleId?: string }) {
    const invitation = await this.prisma.invitation.findUnique({
      where: { id: invitationId },
      include: {
        membership: {
          include: {
            membershipTenantRoles: {
              include: { tenantRole: true },
            },
          },
        },
        tenant: { select: { id: true, name: true, slug: true } },
      },
    });

    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }

    if (invitation.consumedAt) {
      throw new BadRequestException('Cannot update a consumed invitation');
    }

    if (invitation.expiresAt < new Date()) {
      throw new BadRequestException('Cannot update an expired invitation');
    }

    let updatedRole = invitation.membership?.membershipTenantRoles?.[0]?.tenantRole;

    if (data.roleId && invitation.membership) {
      const role = await this.prisma.tenantRole.findUnique({
        where: { id: data.roleId },
      });
      if (!role) {
        throw new BadRequestException('Invalid role ID');
      }

      await this.prisma.$transaction(async (tx) => {
        await tx.membershipTenantRole.deleteMany({
          where: { membershipId: invitation.membership!.id },
        });
        await tx.membershipTenantRole.create({
          data: {
            membershipId: invitation.membership!.id,
            tenantRoleId: data.roleId!,
          },
        });
      });

      updatedRole = role;
      this.logger.log(`Updated invitation ${invitationId} role to ${role.name}`);
    }

    return {
      id: invitation.id,
      email: invitation.email,
      role: updatedRole,
      tenant: invitation.tenant,
      success: true,
      message: 'Invitation updated',
    };
  }

  // ===========================================================================
  // HELPERS (shared with InvitationsService)
  // ===========================================================================

  async getApplicationIdsForTenant(tenantId: string): Promise<string[]> {
    const subscriptions = await this.prisma.appSubscription.findMany({
      where: { tenantId, status: 'ACTIVE' },
      select: { applicationId: true },
    });
    return subscriptions.map((s) => s.applicationId);
  }

  async getApplicationIdFromClientId(clientId: string): Promise<string[]> {
    const app = await this.prisma.application.findUnique({
      where: { clientId },
      select: { id: true },
    });
    return app ? [app.id] : [];
  }
}
