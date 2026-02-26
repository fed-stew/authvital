import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import * as crypto from "crypto";
import { LicensePoolService } from "../licensing/services/license-pool.service";
import { LicenseAssignmentService } from "../licensing/services/license-assignment.service";
import { LicenseProvisioningService } from "../licensing/services/license-provisioning.service";
import { SyncEventService, SYNC_EVENT_TYPES } from "../sync";
import { EmailService } from "../auth/email.service";
import { AppAccessService } from "../authorization";

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
  ) {}

  /**
   * Create an invitation to join a tenant
   *
   * NEW FLOW:
   * 1. Create User (email only) if doesn't exist
   * 2. Create Membership with INVITED status
   * 3. Assign TenantRole to the membership
   * 4. Create Invitation (token tracking only)
   */
  async createInvitation(data: {
    email: string;
    tenantId: string;
    roleId?: string;
    invitedById?: string;
    expiresInDays?: number;
    clientId?: string;
    applicationId?: string; // Optional: specific app to grant access to
    licenseTypeId?: string; // Optional: license type for PER_SEAT mode
    autoAssign?: boolean; // Optional: auto-assign license on accept
    givenName?: string; // Optional: first name for the invited user
    familyName?: string; // Optional: last name for the invited user
  }) {
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

    // Validate roleId is provided
    if (!roleId) {
      throw new BadRequestException(
        "roleId is required. Use /api/authorization/tenant-roles to get valid role IDs.",
      );
    }

    // Verify tenant exists
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException("Tenant not found");
    }

    // Verify role exists
    const tenantRole = await this.prisma.tenantRole.findUnique({
      where: { id: roleId },
    });

    if (!tenantRole) {
      throw new BadRequestException("Invalid role ID");
    }

    // Check member limits before allowing invite
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

    // Check if user already exists with this email
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: {
        memberships: {
          where: { tenantId },
        },
      },
    });

    // If user exists and already has membership in this tenant
    if (user?.memberships.length) {
      throw new ConflictException("User is already a member of this tenant");
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
      throw new ConflictException(
        "An invitation for this email is already pending",
      );
    }

    // Generate secure token
    const token = crypto.randomBytes(32).toString("hex");

    // Calculate expiration
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);

    // ============================================================================
    // VALIDATION: License Assignment
    // ============================================================================
    let application = null;
    if (applicationId) {
      application = await this.prisma.application.findUnique({
        where: { id: applicationId },
        select: { id: true, name: true, licensingMode: true, clientId: true },
      });

      if (!application) {
        throw new NotFoundException("Application not found");
      }

      // Check if a new member can be added to this application
      const accessCheck = await this.licensePoolService.checkMemberAccess(
        tenantId,
        application.id,
      );

      if (!accessCheck.allowed) {
        this.logger.warn(
          `Member access check failed for ${application.name}: ${accessCheck.reason}`,
        );
        throw new ForbiddenException(
          accessCheck.reason || "Cannot add member to this application",
        );
      }

      this.logger.log(
        `Member access check passed: ${application.name} (${accessCheck.mode}) - ${accessCheck.message}`,
      );

      // Validate license assignment based on licensing mode
      switch (application.licensingMode) {
        case "FREE":
          if (licenseTypeId) {
            this.logger.warn(
              `FREE mode application does not require license type, ignoring licenseTypeId`,
            );
          }
          break;

        case "PER_SEAT": {
          if (!licenseTypeId) {
            throw new BadRequestException(
              "License type is required for PER_SEAT applications",
            );
          }

          const licenseType = await this.prisma.licenseType.findFirst({
            where: {
              id: licenseTypeId,
              applicationId: application.id,
            },
          });

          if (!licenseType) {
            throw new BadRequestException(
              `License type does not belong to this application`,
            );
          }

          const capacity = await this.licensePoolService.getAvailableCapacity(
            tenantId,
            application.id,
            licenseTypeId,
          );

          if (!capacity || capacity.available <= 0) {
            throw new BadRequestException(
              `No available seats for ${licenseType.name}. Purchase more seats first.`,
            );
          }
          break;
        }

        case "TENANT_WIDE":
          if (licenseTypeId) {
            this.logger.warn(
              `TENANT_WIDE mode application does not require specific license type, ignoring`,
            );
          }
          break;

        default:
          throw new BadRequestException(
            `Unknown licensing mode: ${application.licensingMode}`,
          );
      }
    }

    // Validate clientId if provided
    if (clientId) {
      const app = await this.prisma.application.findUnique({
        where: { clientId },
      });
      if (!app) {
        throw new NotFoundException("Application not found");
      }
      if (!application) {
        application = app;
      }
    }

    // ============================================================================
    // CREATE EVERYTHING IN A TRANSACTION
    // ============================================================================
    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Create user if doesn't exist (with just email, no password)
      let targetUserId: string;
      if (user) {
        targetUserId = user.id;
      } else {
        const newUser = await tx.user.create({
          data: {
            email: email.toLowerCase(),
            givenName: givenName || undefined,
            familyName: familyName || undefined,
            // No password - will be set on acceptance
          },
        });
        targetUserId = newUser.id;
        this.logger.log(
          `Created placeholder user for invitation: ${targetUserId}`,
        );
      }

      // 2. Create membership with INVITED status
      const membership = await tx.membership.create({
        data: {
          userId: targetUserId,
          tenantId,
          status: "INVITED",
          // joinedAt will be set when they accept
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
      this.logger.log(`Assigned role ${tenantRole.name} to membership`);

      // 4. Create invitation record (for token tracking)
      const invitation = await tx.invitation.create({
        data: {
          email: email.toLowerCase(),
          token,
          expiresAt,
          tenantId,
          invitedById,
          clientId: clientId || application?.clientId,
          membershipId: membership.id,
          metadata: {
            applicationId,
            licenseTypeId,
            autoAssign,
          },
        },
        include: {
          tenant: { select: { id: true, name: true, slug: true } },
          invitedBy: {
            select: {
              id: true,
              email: true,
              givenName: true,
              familyName: true,
            },
          },
        },
      });

      return { invitation, membership, userId: targetUserId };
    });

    // Send invitation email
    const baseUrl = process.env.BASE_URL!; // Validated at startup
    const inviteUrl = `${baseUrl}/invite?token=${result.invitation.token}`;

    await this.emailService.sendInvitationEmail(email, {
      inviterName: result.invitation.invitedBy
        ? `${result.invitation.invitedBy.givenName || ""} ${result.invitation.invitedBy.familyName || ""}`.trim() ||
          result.invitation.invitedBy.email ||
          undefined
        : undefined,
      tenantName: result.invitation.tenant.name,
      inviteUrl,
    });

    // Emit sync event
    this.syncEventService
      .emit(SYNC_EVENT_TYPES.INVITE_CREATED, tenantId, applicationId || "", {
        invite_id: result.invitation.id,
        membership_id: result.membership.id,
        email: result.invitation.email,
        tenant_roles: [tenantRole.slug],
        invited_by_sub: invitedById,
        expires_at: expiresAt.toISOString(),
      })
      .catch((err) =>
        this.logger.warn(`Failed to emit invite.created: ${err.message}`),
      );

    return {
      id: result.invitation.id,
      email: result.invitation.email,
      token: result.invitation.token,
      expiresAt: result.invitation.expiresAt,
      tenant: result.invitation.tenant,
      invitedBy: result.invitation.invitedBy,
      membership: {
        id: result.membership.id,
        status: result.membership.status,
      },
      inviteUrl,
    };
  }

  /**
   * Get invitation details by token
   * Used by the invite page to show who's inviting and to which org
   */
  async getInvitationByToken(token: string) {
    const invitation = await this.prisma.invitation.findUnique({
      where: { token },
      include: {
        tenant: {
          select: { id: true, name: true, slug: true },
        },
        invitedBy: {
          select: { givenName: true, familyName: true, email: true },
        },
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
      throw new NotFoundException("Invitation not found");
    }

    if (invitation.consumedAt) {
      throw new BadRequestException("This invitation has already been used");
    }

    if (invitation.expiresAt < new Date()) {
      throw new BadRequestException("This invitation has expired");
    }

    // Get role from the membership
    const tenantRole =
      invitation.membership?.membershipTenantRoles?.[0]?.tenantRole;

    return {
      id: invitation.id,
      email: invitation.email,
      role: tenantRole?.name || "Member",
      expiresAt: invitation.expiresAt,
      tenant: invitation.tenant,
      invitedBy: invitation.invitedBy
        ? {
            name:
              [invitation.invitedBy.givenName, invitation.invitedBy.familyName]
                .filter(Boolean)
                .join(" ") || invitation.invitedBy.email,
          }
        : null,
    };
  }

  /**
   * Accept an invitation - NEW FLOW
   *
   * Since user and membership are created upfront:
   * 1. Validate the invitation token
   * 2. Update User with password/name if needed
   * 3. Update Membership status to ACTIVE and set joinedAt
   * 4. Mark Invitation as consumed
   */
  async acceptInvitation(data: {
    token: string;
    password?: string;
    givenName?: string;
    familyName?: string;
  }) {
    const { token, password, givenName, familyName } = data;

    this.logger.log(
      `[acceptInvitation] Starting with token: ${token ? token.substring(0, 10) + "..." : "MISSING"}`,
    );

    // Validate token is present
    if (!token || typeof token !== "string" || token.trim() === "") {
      this.logger.error(`[acceptInvitation] FAIL: Token is missing or invalid`);
      throw new BadRequestException("Token is required");
    }

    // Get invitation with all related data
    const invitation = await this.prisma.invitation.findUnique({
      where: { token },
      include: {
        tenant: { select: { id: true, name: true, slug: true } },
        membership: {
          include: {
            user: true,
            membershipTenantRoles: {
              include: { tenantRole: true },
            },
          },
        },
      },
    });

    if (!invitation) {
      this.logger.error(
        `[acceptInvitation] FAIL: Invitation not found for token`,
      );
      throw new NotFoundException("Invitation not found");
    }

    if (invitation.consumedAt) {
      this.logger.error(
        `[acceptInvitation] FAIL: Invitation already consumed at ${invitation.consumedAt}`,
      );
      throw new BadRequestException("This invitation has already been used");
    }

    if (invitation.expiresAt < new Date()) {
      this.logger.error(
        `[acceptInvitation] FAIL: Invitation expired at ${invitation.expiresAt}`,
      );
      throw new BadRequestException("This invitation has expired");
    }

    if (!invitation.membership) {
      this.logger.error(
        `[acceptInvitation] FAIL: Invalid invitation - no membership linked`,
      );
      throw new BadRequestException(
        "Invalid invitation - no membership linked",
      );
    }

    const user = invitation.membership.user;

    // If user has no password, they need to set one
    if (!user.passwordHash && !password) {
      this.logger.log(
        `[acceptInvitation] User has no password and none provided - returning needsPassword`,
      );
      return {
        success: false,
        needsPassword: true,
        email: user.email,
        message: "Please create a password to set up your account.",
      };
    }

    // Look up application for redirect URL
    let application: {
      clientId: string;
      initiateLoginUri: string | null;
    } | null = null;
    if (invitation.clientId) {
      application = await this.prisma.application.findUnique({
        where: { clientId: invitation.clientId },
        select: { clientId: true, initiateLoginUri: true },
      });
    }

    // Update user and membership in transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // Update user with password and name if provided
      const updateData: Record<string, any> = {};
      if (password) {
        const bcrypt = await import("bcrypt");
        updateData.passwordHash = await bcrypt.hash(password, 12);
      }
      if (givenName) updateData.givenName = givenName;
      if (familyName) updateData.familyName = familyName;

      const updatedUser =
        Object.keys(updateData).length > 0
          ? await tx.user.update({
              where: { id: user.id },
              data: updateData,
            })
          : user;

      // Update membership to ACTIVE
      const updatedMembership = await tx.membership.update({
        where: { id: invitation.membership!.id },
        data: {
          status: "ACTIVE",
          joinedAt: new Date(),
        },
        include: {
          tenant: { select: { id: true, name: true, slug: true } },
        },
      });

      // Mark invitation as consumed
      await tx.invitation.update({
        where: { id: invitation.id },
        data: {
          consumedAt: new Date(),
          consumedById: user.id,
        },
      });

      return { user: updatedUser, membership: updatedMembership };
    });

    this.logger.log(
      `[acceptInvitation] SUCCESS - membership activated: ${result.membership.id}`,
    );

    // Grant access to all FREE and TENANT_WIDE apps for this new member
    try {
      await this.appAccessService.autoGrantFreeApps(
        invitation.tenantId,
        result.user.id,
        invitation.invitedById || undefined,
      );
      await this.appAccessService.autoGrantTenantWideApps(
        invitation.tenantId,
        result.user.id,
        invitation.invitedById || undefined,
      );
      this.logger.log(
        `[acceptInvitation] Auto-granted FREE/TENANT_WIDE app access for user ${result.user.email}`,
      );
    } catch (accessError: unknown) {
      this.logger.warn(
        `[acceptInvitation] Failed to auto-grant app access: ${accessError instanceof Error ? accessError.message : String(accessError)}`,
      );
    }

    // Auto-assign license if invitation has license assignment metadata
    const metadata = invitation.metadata as Record<string, any> | null;
    if (metadata?.autoAssign && metadata?.applicationId) {
      try {
        const app = await this.prisma.application.findUnique({
          where: { id: metadata.applicationId },
          select: { id: true, licensingMode: true, name: true },
        });

        if (app && app.licensingMode === "PER_SEAT" && metadata.licenseTypeId) {
          const capacity = await this.licensePoolService.getAvailableCapacity(
            invitation.tenantId,
            app.id,
            metadata.licenseTypeId,
          );

          if (capacity && capacity.available > 0) {
            await this.licenseAssignmentService.grantLicense({
              tenantId: invitation.tenantId,
              userId: result.user.id,
              applicationId: app.id,
              licenseTypeId: metadata.licenseTypeId,
              assignedById: invitation.invitedById || result.user.id,
            });
            this.logger.log(
              `[acceptInvitation] Auto-assigned license "${metadata.licenseTypeId}" to user ${result.user.email}`,
            );
          }
        }
      } catch (autoAssignError: unknown) {
        this.logger.error(
          `[acceptInvitation] Failed to auto-assign license: ${autoAssignError instanceof Error ? autoAssignError.message : String(autoAssignError)}`,
        );
      }
    }

    // Build redirect URL
    const redirectUrl = application?.initiateLoginUri
      ? application.initiateLoginUri.replace("{tenant}", invitation.tenant.slug)
      : null;

    // Emit sync events
    const appIdsToNotify = invitation.clientId
      ? await this.getApplicationIdFromClientId(invitation.clientId)
      : await this.getApplicationIdsForTenant(invitation.tenantId);

    const tenantRoleSlugs = invitation.membership.membershipTenantRoles.map(
      (mtr) => mtr.tenantRole.slug,
    );

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
        .catch((err) =>
          this.logger.warn(`Failed to emit invite.accepted: ${err.message}`),
        );

      this.syncEventService
        .emit(SYNC_EVENT_TYPES.MEMBER_JOINED, invitation.tenantId, appId, {
          membership_id: result.membership.id,
          sub: result.user.id,
          email: result.user.email,
          tenant_roles: tenantRoleSlugs,
          given_name: result.user.givenName,
          family_name: result.user.familyName,
        })
        .catch((err) =>
          this.logger.warn(`Failed to emit member.joined: ${err.message}`),
        );
    }

    return {
      success: true,
      user: {
        id: result.user.id,
        email: result.user.email,
        givenName: result.user.givenName,
        familyName: result.user.familyName,
      },
      tenant: invitation.tenant,
      membership: {
        id: result.membership.id,
        status: result.membership.status,
      },
      redirectUrl,
      clientId: invitation.clientId,
    };
  }

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
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Revoke/delete an invitation
   *
   * NEW FLOW: Also deletes the membership and potentially the placeholder user
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
      throw new NotFoundException("Invitation not found");
    }

    if (invitation.consumedAt) {
      throw new BadRequestException("Cannot revoke a consumed invitation");
    }

    // Store data for event before deletion
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
        this.logger.log(
          `Deleted INVITED membership: ${invitation.membership.id}`,
        );

        // If user has no other memberships and no password (placeholder user), delete them
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
          membership_id: membershipId || "",
          email,
        })
        .catch((err) =>
          this.logger.warn(`Failed to emit invite.deleted: ${err.message}`),
        );
    }

    return { success: true, message: "Invitation revoked" };
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
      throw new NotFoundException("Invitation not found");
    }

    if (invitation.consumedAt) {
      throw new BadRequestException("This invitation has already been used");
    }

    if (invitation.expiresAt < new Date()) {
      throw new BadRequestException("This invitation has expired");
    }

    // Send email
    const baseUrl = process.env.BASE_URL!; // Validated at startup
    const inviteUrl = `${baseUrl}/invite?token=${invitation.token}`;

    await this.emailService.sendInvitationEmail(invitation.email, {
      inviterName: invitation.invitedBy
        ? `${invitation.invitedBy.givenName || ""} ${invitation.invitedBy.familyName || ""}`.trim() ||
          invitation.invitedBy.email ||
          undefined
        : undefined,
      tenantName: invitation.tenant.name,
      inviteUrl,
    });

    return { success: true, message: "Invitation email resent" };
  }

  /**
   * Update an invitation (e.g., change role)
   *
   * NEW FLOW: Updates the role on the linked membership instead of on the invitation
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
      throw new NotFoundException("Invitation not found");
    }

    if (invitation.consumedAt) {
      throw new BadRequestException("Cannot update a consumed invitation");
    }

    if (invitation.expiresAt < new Date()) {
      throw new BadRequestException("Cannot update an expired invitation");
    }

    let updatedRole =
      invitation.membership?.membershipTenantRoles?.[0]?.tenantRole;

    if (data.roleId && invitation.membership) {
      // Validate the role exists
      const role = await this.prisma.tenantRole.findUnique({
        where: { id: data.roleId },
      });
      if (!role) {
        throw new BadRequestException("Invalid role ID");
      }

      // Update the membership's role
      await this.prisma.$transaction(async (tx) => {
        // Remove existing roles
        await tx.membershipTenantRole.deleteMany({
          where: { membershipId: invitation.membership!.id },
        });
        // Add new role
        await tx.membershipTenantRole.create({
          data: {
            membershipId: invitation.membership!.id,
            tenantRoleId: data.roleId!,
          },
        });
      });

      updatedRole = role;
      this.logger.log(
        `Updated invitation ${invitationId} role to ${role.name}`,
      );
    }

    return {
      id: invitation.id,
      email: invitation.email,
      role: updatedRole,
      tenant: invitation.tenant,
      success: true,
      message: "Invitation updated",
    };
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  /**
   * Get all application IDs that a tenant has access to (for event emission)
   */
  private async getApplicationIdsForTenant(
    tenantId: string,
  ): Promise<string[]> {
    const subscriptions = await this.prisma.appSubscription.findMany({
      where: { tenantId, status: "ACTIVE" },
      select: { applicationId: true },
    });
    return subscriptions.map((s) => s.applicationId);
  }

  /**
   * Get application ID from clientId (returns array for consistent interface)
   */
  private async getApplicationIdFromClientId(
    clientId: string,
  ): Promise<string[]> {
    const app = await this.prisma.application.findUnique({
      where: { clientId },
      select: { id: true },
    });
    return app ? [app.id] : [];
  }
}
