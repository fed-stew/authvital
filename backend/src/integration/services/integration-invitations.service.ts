import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import * as crypto from 'crypto';

/**
 * Handles invitation management for M2M integration.
 * 
 * Used by SaaS backends to invite users via API key.
 * Note: This is separate from the InvitationsModule which handles
 * the user-facing invitation acceptance flow.
 */
@Injectable()
export class IntegrationInvitationsService {
  private readonly logger = new Logger(IntegrationInvitationsService.name);
  private readonly idpBaseUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.idpBaseUrl = this.configService.getOrThrow<string>('BASE_URL');
  }

  /**
   * Send an invitation to join a tenant
   * Used by SaaS backends to invite users via API key
   *
   * - If user with email exists, uses that user
   * - If not, creates a new user with provided details
   * - Returns only the user's sub (id) and invite expiration for security
   */
  async sendInvitation(data: {
    email: string;
    tenantId: string;
    roleId?: string;
    expiresInDays?: number;
    clientId?: string;
    givenName?: string;
    familyName?: string;
  }): Promise<{
    sub: string;
    expiresAt: Date;
  }> {
    const { email, tenantId, roleId, expiresInDays = 7, clientId, givenName, familyName } = data;

    // Verify tenant exists
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    // Look up existing user (email is globally unique)
    let user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: {
        memberships: {
          where: { tenantId },
        },
      },
    });

    // If user exists and is already a member, throw error
    if (user?.memberships.length) {
      throw new ConflictException('User is already a member of this tenant');
    }

    // If user doesn't exist, create them
    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email: email.toLowerCase(),
          givenName: givenName || null,
          familyName: familyName || null,
          // No password - user will set it when accepting invite
        },
        include: {
          memberships: {
            where: { tenantId },
          },
        },
      });
      this.logger.log(`[Invitation] Created new user ${user.id} for ${email}`);
    }

    // Validate roleId is provided and exists
    if (!roleId) {
      throw new BadRequestException('roleId is required. Use /api/integration/tenant-roles to get valid role IDs.');
    }

    const tenantRole = await this.prisma.tenantRole.findUnique({
      where: { id: roleId },
    });
    if (!tenantRole) {
      throw new BadRequestException('Invalid roleId. Use /api/integration/tenant-roles to get valid role IDs.');
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

    // Generate secure token
    const token = crypto.randomBytes(32).toString('hex');

    // Calculate expiration
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);

    // Create membership and invitation in a transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // Create membership with INVITED status
      const membership = await tx.membership.create({
        data: {
          userId: user.id,
          tenantId,
          status: 'INVITED',
        },
      });

      // Assign tenant role
      await tx.membershipTenantRole.create({
        data: {
          membershipId: membership.id,
          tenantRoleId: roleId,
        },
      });

      // Create invitation (linked to membership)
      const invitation = await tx.invitation.create({
        data: {
          email: email.toLowerCase(),
          token,
          expiresAt,
          tenantId,
          clientId,
          membershipId: membership.id,
        },
      });

      return { invitation, membership };
    });

    const inviteUrl = `${this.idpBaseUrl}/invite?token=${result.invitation.token}`;

    // Log invite URL for dev/debugging only (not returned to client)
    this.logger.log(`\n${'='.repeat(60)}`);
    this.logger.log(`📨 INVITATION CREATED (dev/debugging only)`);
    this.logger.log(`${'='.repeat(60)}`);
    this.logger.log(`User Sub: ${user.id}`);
    this.logger.log(`Email: ${result.invitation.email}`);
    this.logger.log(`Tenant: ${tenant.name} (${tenant.slug})`);
    this.logger.log(`Role: ${tenantRole.name}`);
    this.logger.log(`Membership: ${result.membership.id}`);
    this.logger.log(`Expires: ${result.invitation.expiresAt.toISOString()}`);
    this.logger.log(`${'─'.repeat(60)}`);
    this.logger.log(`🔗 ${inviteUrl}`);
    this.logger.log(`${'='.repeat(60)}\n`);

    // Only return sub and expiresAt - no sensitive info
    return {
      sub: user.id,
      expiresAt: result.invitation.expiresAt,
    };
  }

  /**
   * Get pending invitations for a tenant
   * Returns all non-consumed, non-expired invitations
   */
  async getPendingInvitations(tenantId: string): Promise<{
    tenantId: string;
    tenantName: string;
    invitations: Array<{
      id: string;
      email: string;
      role: string;
      expiresAt: Date;
      createdAt: Date;
      invitedBy: { id: string; email: string | null; givenName: string | null; familyName: string | null } | null;
    }>;
    totalCount: number;
  }> {
    // Verify tenant exists
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const invitations = await this.prisma.invitation.findMany({
      where: {
        tenantId,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: {
        invitedBy: {
          select: { id: true, email: true, givenName: true, familyName: true },
        },
        membership: {
          include: {
            membershipTenantRoles: {
              include: { tenantRole: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      tenantId: tenant.id,
      tenantName: tenant.name,
      invitations: invitations.map((inv) => ({
        id: inv.id,
        email: inv.email,
        role: inv.membership?.membershipTenantRoles?.[0]?.tenantRole?.name || 'Member',
        expiresAt: inv.expiresAt,
        createdAt: inv.createdAt,
        invitedBy: inv.invitedBy,
      })),
      totalCount: invitations.length,
    };
  }

  /**
   * Resend an invitation
   * Generates a new token and extends expiration
   * Returns only the new expiration date for security
   */
  async resendInvitation(
    invitationId: string,
    options?: { expiresInDays?: number },
  ): Promise<{ expiresAt: Date }> {
    const invitation = await this.prisma.invitation.findUnique({
      where: { id: invitationId },
      include: {
        tenant: { select: { id: true, name: true, slug: true } },
        membership: {
          include: {
            membershipTenantRoles: {
              include: { tenantRole: true },
            },
          },
        },
      },
    });

    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }

    if (invitation.consumedAt) {
      throw new BadRequestException('This invitation has already been consumed');
    }

    // Generate new token and extend expiration
    const newToken = crypto.randomBytes(32).toString('hex');
    const expiresInDays = options?.expiresInDays ?? 7;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);

    const updatedInvitation = await this.prisma.invitation.update({
      where: { id: invitationId },
      data: {
        token: newToken,
        expiresAt,
      },
      include: {
        tenant: { select: { id: true, name: true, slug: true } },
      },
    });

    const inviteUrl = `${this.idpBaseUrl}/invite?token=${updatedInvitation.token}`;
    const roleName = invitation.membership?.membershipTenantRoles?.[0]?.tenantRole?.name || 'Member';

    // Log invite URL for dev/debugging
    this.logger.log(`\n${'='.repeat(60)}`);
    this.logger.log(`📨 INVITATION RESENT (for dev/debugging)`);
    this.logger.log(`${'='.repeat(60)}`);
    this.logger.log(`Email: ${updatedInvitation.email}`);
    this.logger.log(`Tenant: ${updatedInvitation.tenant.name} (${updatedInvitation.tenant.slug})`);
    this.logger.log(`Role: ${roleName}`);
    this.logger.log(`Expires: ${updatedInvitation.expiresAt.toISOString()}`);
    this.logger.log(`${'─'.repeat(60)}`);
    this.logger.log(`🔗 ${inviteUrl}`);
    this.logger.log(`${'='.repeat(60)}\n`);

    // Only return expiresAt - no sensitive info
    return {
      expiresAt: updatedInvitation.expiresAt,
    };
  }

  /**
   * Revoke an invitation
   * Deletes the invitation record entirely
   */
  async revokeInvitation(invitationId: string): Promise<{ success: boolean; message: string }> {
    const invitation = await this.prisma.invitation.findUnique({
      where: { id: invitationId },
    });

    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }

    if (invitation.consumedAt) {
      throw new BadRequestException('Cannot revoke an already consumed invitation');
    }

    await this.prisma.invitation.delete({
      where: { id: invitationId },
    });

    return { success: true, message: 'Invitation revoked successfully' };
  }
}
