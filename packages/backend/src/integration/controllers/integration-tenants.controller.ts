import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Query,
  Param,
    HttpCode,
  HttpStatus,
  UseGuards,
  BadRequestException,
  UnauthorizedException,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { M2MAuthGuard, M2MRequestInfo } from '../../oauth/m2m-auth.guard';
import { IntegrationTenantsService, IntegrationInvitationsService } from '../services';
import { MfaService } from '../../auth/mfa/mfa.service';
import { SendInvitationDto } from '../dto';
import {
  RequireScopes,
  IntegrationScope,
  M2mTenantFrom,
  M2mCrossTenant,
  M2mTenantFromRecord,
  M2mScopeGuard,
  M2mTenantGuard,
} from '../m2m-authz';

/**
 * Extended Express Request with M2M info
 */
interface RequestWithM2M extends Request {
  m2m?: M2MRequestInfo;
}

/**
 * Integration Tenants Controller
 * Handles tenant, member, and invitation management
 */
@Controller('integration')
@UseGuards(M2MAuthGuard, M2mScopeGuard, M2mTenantGuard)
export class IntegrationTenantsController {
  constructor(
    private readonly tenantsService: IntegrationTenantsService,
    private readonly invitationsService: IntegrationInvitationsService,
    private readonly mfaService: MfaService,
  ) {}

  /**
   * Validate user membership in a tenant
   */
  @Get('validate-membership')
  @RequireScopes(IntegrationScope.READ)
  @M2mTenantFrom('query')
  async validateMembership(
    @Query('userId') userId: string,
    @Query('tenantId') tenantId: string,
  ) {
    if (!userId || !tenantId) {
      throw new BadRequestException('userId and tenantId are required');
    }
    return this.tenantsService.validateMembership(userId, tenantId);
  }

  /**
   * Get tenant memberships
   */
  @Get('tenant-memberships')
  @RequireScopes(IntegrationScope.READ)
  @M2mTenantFrom('query')
  async getTenantMemberships(
    @Query('tenantId') tenantId: string,
    @Query('status') status?: 'ACTIVE' | 'INVITED' | 'SUSPENDED',
    @Query('includeRoles') includeRoles?: string,
  ) {
    if (!tenantId) {
      throw new BadRequestException('tenantId is required');
    }
    return this.tenantsService.getTenantMemberships(tenantId, {
      status,
      includeRoles: includeRoles === 'true',
    });
  }

  /**
   * Get application memberships (optionally filtered by tenant)
   */
  @Get('application-memberships')
  @RequireScopes(IntegrationScope.READ)
  @M2mCrossTenant()
  async getApplicationMemberships(
    @Query('clientId') clientId: string,
    @Query('tenantId') tenantId?: string,
    @Query('status') status?: 'ACTIVE' | 'INVITED' | 'SUSPENDED',
  ) {
    if (!clientId) {
      throw new BadRequestException('clientId is required');
    }
    return this.tenantsService.getApplicationMemberships(clientId, { tenantId, status });
  }

  /**
   * Get user's tenants
   */
  @Get('user-tenants')
  @RequireScopes(IntegrationScope.READ)
  @M2mCrossTenant()
  async getUserTenants(@Query('userId') userId: string) {
    if (!userId) {
      throw new BadRequestException('userId is required');
    }
    return this.tenantsService.getUserTenants(userId);
  }

  /**
   * Get user's MFA status
   */
  @Get('user-mfa-status')
  @RequireScopes(IntegrationScope.READ)
  @M2mCrossTenant()
  async getUserMfaStatus(@Query('userId') userId: string) {
    if (!userId) {
      throw new BadRequestException('userId is required');
    }
    return this.mfaService.getUserMfaStatus(userId);
  }

  // ===========================================================================
  // INVITATIONS
  // ===========================================================================

  /**
   * Send an invitation to join a tenant.
   *
   * Body is validated by SendInvitationDto, which mirrors EXACTLY what the
   * service consumes ({ tenantId, email, roleId, clientId?, expiresInDays?,
   * givenName?, familyName? }). Previously the inline type advertised
   * roleIds[]/applicationId/invitedById which the service never read.
   */
  @Post('invite')
  @HttpCode(HttpStatus.OK)
  @RequireScopes(IntegrationScope.WRITE)
  @M2mTenantFrom('body')
  async sendInvitation(@Body() dto: SendInvitationDto) {
    return this.invitationsService.sendInvitation(dto);
  }

  /**
   * Get pending invitations for a tenant
   */
  @Get('invitations')
  @RequireScopes(IntegrationScope.READ)
  @M2mTenantFrom('query')
  async getPendingInvitations(@Query('tenantId') tenantId: string) {
    if (!tenantId) {
      throw new BadRequestException('tenantId is required');
    }
    return this.invitationsService.getPendingInvitations(tenantId);
  }

  /**
   * Revoke an invitation
   */
  @Delete('invitation/:invitationId')
  @HttpCode(HttpStatus.OK)
  @RequireScopes(IntegrationScope.WRITE)
  @M2mTenantFromRecord()
  async revokeInvitation(
    @Req() req: RequestWithM2M,
    @Param('invitationId') invitationId: string,
  ) {
    const m2m = req.m2m;
    if (!m2m?.clientId) {
      throw new UnauthorizedException('M2M client information not found');
    }
    return this.invitationsService.revokeInvitation(invitationId, m2m.clientId);
  }

  /**
   * Resend an invitation
   */
  @Post('invitation/:invitationId/resend')
  @HttpCode(HttpStatus.OK)
  @RequireScopes(IntegrationScope.WRITE)
  @M2mTenantFromRecord()
  async resendInvitation(
    @Req() req: RequestWithM2M,
    @Param('invitationId') invitationId: string,
  ) {
    const m2m = req.m2m;
    if (!m2m?.clientId) {
      throw new UnauthorizedException('M2M client information not found');
    }
    return this.invitationsService.resendInvitation(invitationId, m2m.clientId);
  }
}
