import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Body,
  Param,
  Req,
  Res,
  Logger,
} from "@nestjs/common";
import { Response } from "express";
import {
  IsString,
  IsEmail,
  IsOptional,
  IsInt,
  Min,
  IsBoolean,
} from "class-validator";
import { InvitationsService } from "./invitations.service";
import { AuthService } from "../auth/auth.service";
import { getSessionCookieOptions } from "../common/utils/cookie.utils";

// Alias for clarity
const getIdpCookieOptions = getSessionCookieOptions;

// =============================================================================
// DTOs
// =============================================================================

class CreateInvitationDto {
  @IsEmail()
  email!: string;

  @IsString()
  tenantId!: string;

  @IsString()
  roleId!: string; // Required - Tenant role ID (get from /api/authorization/tenant-roles)

  @IsOptional()
  @IsString()
  givenName?: string; // Optional first name for the invited user

  @IsOptional()
  @IsString()
  familyName?: string; // Optional last name for the invited user

  @IsOptional()
  @IsInt()
  @Min(1)
  expiresInDays?: number;

  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsString()
  applicationId?: string; // Optional: specific app to grant access to

  @IsOptional()
  @IsString()
  licenseTypeId?: string; // Required for PER_SEAT mode

  @IsOptional()
  @IsBoolean()
  autoAssign?: boolean; // Auto-assign license on accept (true = default when app selected)
}

class AcceptInvitationDto {
  @IsString()
  token!: string;

  // For new users - optional, will create account if user doesn't exist
  @IsOptional()
  @IsString()
  password?: string;

  @IsOptional()
  @IsString()
  givenName?: string;

  @IsOptional()
  @IsString()
  familyName?: string;
}

class UpdateInvitationDto {
  @IsOptional()
  @IsString()
  roleId?: string;
}

// =============================================================================
// CONTROLLER
// =============================================================================

@Controller("invitations")
export class InvitationsController {
  private readonly logger = new Logger(InvitationsController.name);

  constructor(
    private readonly invitationsService: InvitationsService,
    private readonly authService: AuthService,
  ) {}

  // ===========================================================================
  // PUBLIC ENDPOINTS (for invite page)
  // ===========================================================================

  /**
   * Get invitation details by token
   * Public - used by invite page to show invite info before login/signup
   */
  @Get("token/:token")
  async getInvitation(@Param("token") token: string) {
    return this.invitationsService.getInvitationByToken(token);
  }

  // ===========================================================================
  // AUTHENTICATED ENDPOINTS
  // ===========================================================================

  /**
   * Create an invitation
   * TODO: Re-add auth once working
   */
  @Post()
  async createInvitation(
    @Body() dto: CreateInvitationDto,
    @Req() req: { user?: { sub: string } },
  ) {
    return this.invitationsService.createInvitation({
      ...dto,
      invitedById: req.user?.sub,
    });
  }

  /**
   * Accept an invitation - creates user if needed, adds to tenant
   *
   * Flow:
   * 1. Validate token
   * 2. Check if user with invitation email exists
   * 3. If exists - add to tenant, generate auth token, set cookie
   * 4. If not exists - create user with provided password, add to tenant
   * 5. Return redirect URL for the application
   */
  @Post("accept")
  async acceptInvitation(
    @Body() dto: AcceptInvitationDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.logger.log("=".repeat(60));
    this.logger.log(`[ACCEPT] >>> Incoming POST /invitations/accept`);
    this.logger.log(
      `[ACCEPT] Token provided: ${dto?.token ? "YES (length: " + dto.token.length + ")" : "NO or EMPTY"}`,
    );
    this.logger.log(
      `[ACCEPT] Password provided: ${dto?.password ? "YES" : "NO"}`,
    );
    this.logger.log("=".repeat(60));

    try {
      const result = await this.invitationsService.acceptInvitation(dto);

      // If successful and user exists, set auth cookies to log them in
      if (result.success && result.user?.id && result.user?.email) {
        this.logger.log(
          `[ACCEPT] Generating auth token for user: ${result.user.id}`,
        );

        // Generate JWT for the user (no directoryId needed)
        const accessToken = await this.authService.generateJwt(
          result.user.id,
          result.user.email,
        );

        // Set IDP session cookies
        res.cookie("auth_token", accessToken, getIdpCookieOptions());
        res.cookie("idp_session", accessToken, getIdpCookieOptions());

        this.logger.log(
          `[ACCEPT] Auth cookies set, redirectUrl: ${result.redirectUrl}`,
        );
      }

      this.logger.log(`[ACCEPT] <<< Success response`);
      return result;
    } catch (error: any) {
      this.logger.error(`[ACCEPT] <<< ERROR: ${error.message}`);
      this.logger.error(
        `[ACCEPT] Error status: ${error.status || error.statusCode || "unknown"}`,
      );
      throw error;
    }
  }

  /**
   * List pending invitations for a tenant
   * TODO: Re-add auth once working
   */
  @Get("tenant/:tenantId")
  async listTenantInvitations(@Param("tenantId") tenantId: string) {
    return this.invitationsService.listTenantInvitations(tenantId);
  }

  /**
   * Resend invitation email
   */
  @Post(":id/resend")
  async resendInvitation(@Param("id") id: string) {
    return this.invitationsService.resendInvitationEmail(id);
  }

  /**
   * Update invitation (e.g., change role)
   */
  @Patch(":id")
  async updateInvitation(
    @Param("id") id: string,
    @Body() dto: UpdateInvitationDto,
  ) {
    return this.invitationsService.updateInvitation(id, dto);
  }

  /**
   * Revoke an invitation
   * TODO: Re-add auth once working
   */
  @Delete(":id")
  async revokeInvitation(@Param("id") id: string) {
    return this.invitationsService.revokeInvitation(id);
  }
}
