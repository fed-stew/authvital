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
} from '@nestjs/common';
import { M2MAuthGuard } from '../../oauth/m2m-auth.guard';
import { IntegrationTenantsService, IntegrationInvitationsService } from '../services';
import { MfaService } from '../../auth/mfa/mfa.service';

/**
 * Integration Tenants Controller
 * Handles tenant, member, and invitation management
 */
@Controller('integration')
@UseGuards(M2MAuthGuard)
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
   * Send an invitation to join a tenant
   */
  @Post('invite')
  @HttpCode(HttpStatus.OK)
  async sendInvitation(
    @Body() dto: {
      tenantId: string;
      email: string;
      roleIds?: string[];
      applicationId?: string;
      invitedById?: string;
    },
  ) {
    if (!dto.tenantId || !dto.email) {
      throw new BadRequestException('tenantId and email are required');
    }
    return this.invitationsService.sendInvitation(dto);
  }

  /**
   * Get pending invitations for a tenant
   */
  @Get('invitations')
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
  async revokeInvitation(@Param('invitationId') invitationId: string) {
    return this.invitationsService.revokeInvitation(invitationId);
  }

  /**
   * Resend an invitation
   */
  @Post('invitation/:invitationId/resend')
  @HttpCode(HttpStatus.OK)
  async resendInvitation(@Param('invitationId') invitationId: string) {
    return this.invitationsService.resendInvitation(invitationId);
  }
}
