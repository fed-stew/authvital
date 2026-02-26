import {
  Controller,
  Post,
  Get,
  Delete,
  Put,
  Body,
  Query,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { M2MAuthGuard } from '../oauth/m2m-auth.guard';
import {
  IntegrationPermissionsService,
  IntegrationEntitlementsService,
  IntegrationLicensingService,
  IntegrationTenantsService,
  IntegrationRolesService,
  IntegrationInvitationsService,
} from './services';
import { MfaService } from '../auth/mfa/mfa.service';

/**
 * Integration APIs for SaaS applications
 * These endpoints are used by your SaaS backend to:
 * - Check user permissions
 * - Check subscription/feature access
 * - Validate user access to resources
 *
 * All endpoints require M2M OAuth authentication (client_credentials flow)
 */
@Controller('integration')
@UseGuards(M2MAuthGuard)
export class IntegrationController {
  constructor(
    private readonly permissionsService: IntegrationPermissionsService,
    private readonly entitlementsService: IntegrationEntitlementsService,
    private readonly licensingService: IntegrationLicensingService,
    private readonly tenantsService: IntegrationTenantsService,
    private readonly rolesService: IntegrationRolesService,
    private readonly invitationsService: IntegrationInvitationsService,
    private readonly mfaService: MfaService,
  ) {}

  /**
   * Check if a user has a specific permission in a tenant
   *
   * Usage from your SaaS:
   * ```
   * POST /integration/check-permission
   * Authorization: Bearer <m2m_access_token>
   * {
   *   "userId": "user_123",
   *   "tenantId": "tenant_456",
   *   "permission": "invoices:delete"
   * }
   * ```
   */
  @Post('check-permission')
  @HttpCode(HttpStatus.OK)
  async checkPermission(
    @Body()
    dto: {
      userId: string;
      tenantId: string;
      permission: string;
    },
  ) {
    if (!dto.userId || !dto.tenantId || !dto.permission) {
      throw new BadRequestException('userId, tenantId, and permission are required');
    }

    return this.permissionsService.checkPermission(
      dto.userId,
      dto.tenantId,
      dto.permission,
    );
  }

  /**
   * Check multiple permissions at once
   */
  @Post('check-permissions')
  @HttpCode(HttpStatus.OK)
  async checkPermissions(
    @Body()
    dto: {
      userId: string;
      tenantId: string;
      permissions: string[];
    },
  ) {
    if (!dto.userId || !dto.tenantId || !dto.permissions?.length) {
      throw new BadRequestException('userId, tenantId, and permissions are required');
    }

    return this.permissionsService.checkPermissions(
      dto.userId,
      dto.tenantId,
      dto.permissions,
    );
  }

  /**
   * Get all permissions for a user in a tenant
   */
  @Get('user-permissions')
  async getUserPermissions(
    @Query('userId') userId: string,
    @Query('tenantId') tenantId: string,
  ) {
    if (!userId || !tenantId) {
      throw new BadRequestException('userId and tenantId are required');
    }

    return this.permissionsService.getUserPermissions(userId, tenantId);
  }

  /**
   * Check if a tenant has access to a feature based on subscription
   *
   * Usage from your SaaS:
   * ```
   * GET /integration/check-feature?tenantId=xxx&feature=advanced_reports
   * Authorization: Bearer <m2m_access_token>
   * ```
   */
  @Get('check-feature')
  async checkFeature(
    @Query('tenantId') tenantId: string,
    @Query('feature') feature: string,
    @Query('applicationId') applicationId?: string,
  ) {
    if (!tenantId || !feature) {
      throw new BadRequestException('tenantId and feature are required');
    }

    return this.entitlementsService.checkFeature(tenantId, feature, applicationId);
  }

  /**
   * Get subscription status for a tenant
   */
  @Get('subscription-status')
  async getSubscriptionStatus(
    @Query('tenantId') tenantId: string,
    @Query('applicationId') applicationId?: string,
  ) {
    if (!tenantId) {
      throw new BadRequestException('tenantId is required');
    }

    return this.entitlementsService.getSubscriptionStatus(tenantId, applicationId);
  }

  /**
   * Check seat availability for a tenant
   */
  @Get('check-seats')
  async checkSeats(
    @Query('tenantId') tenantId: string,
    @Query('clientId') clientId?: string,
  ) {
    if (!tenantId) {
      throw new BadRequestException('tenantId is required');
    }

    return this.entitlementsService.checkSeats(tenantId, clientId);
  }

  /**
   * Validate that a user is a member of a tenant
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
   * Get all memberships for a tenant
   *
   * Usage from your SaaS:
   * ```
   * GET /integration/tenant-memberships?tenantId=xxx
   * Authorization: Bearer <m2m_access_token>
   * ```
   *
   * Optional query params:
   * - status: Filter by membership status (ACTIVE, INVITED, SUSPENDED)
   * - includeRoles: Whether to include role information (default: true)
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
      includeRoles: includeRoles !== 'false',
    });
  }

  /**
   * Get all memberships that have roles for a specific application
   *
   * Usage from your SaaS:
   * ```
   * GET /integration/application-memberships?clientId=xxx
   * Authorization: Bearer <m2m_access_token>
   * ```
   *
   * Optional query params:
   * - status: Filter by membership status (ACTIVE, INVITED, SUSPENDED)
   * - tenantId: Filter to a specific tenant
   */
  @Get('application-memberships')
  async getApplicationMemberships(
    @Query('clientId') clientId: string,
    @Query('status') status?: 'ACTIVE' | 'INVITED' | 'SUSPENDED',
    @Query('tenantId') tenantId?: string,
  ) {
    if (!clientId) {
      throw new BadRequestException('clientId is required');
    }

    return this.tenantsService.getApplicationMemberships(clientId, {
      status,
      tenantId,
    });
  }

  /**
   * Get all tenants for a user
   *
   * Usage from your SaaS:
   * ```
   * GET /integration/user-tenants?userId=xxx
   * Authorization: Bearer <m2m_access_token>
   * ```
   *
   * Optional query params:
   * - status: Filter by membership status (ACTIVE, INVITED, SUSPENDED)
   * - includeRoles: Whether to include role information (default: true)
   */
  @Get('user-tenants')
  async getUserTenants(
    @Query('userId') userId: string,
    @Query('status') status?: 'ACTIVE' | 'INVITED' | 'SUSPENDED',
    @Query('includeRoles') includeRoles?: string,
  ) {
    if (!userId) {
      throw new BadRequestException('userId is required');
    }

    return this.tenantsService.getUserTenants(userId, {
      status,
      includeRoles: includeRoles !== 'false',
    });
  }

  // ===========================================================================
  // INVITATION MANAGEMENT ENDPOINTS
  // ===========================================================================

  /**
   * Send an invitation to join a tenant
   * 
   * Creates or finds user by email, creates invitation, returns user sub.
   * The invite URL is logged server-side only (not returned) for security.
   *
   * Usage from your SaaS:
   * ```
   * POST /integration/invitations/send
   * Authorization: Bearer <m2m_access_token>
   * {
   *   "email": "newuser@example.com",
   *   "tenantId": "tenant_123",
   *   "givenName": "John",
   *   "familyName": "Doe",
   *   "roleId": "clxyz...",
   *   "expiresInDays": 7
   * }
   * ```
   * 
   * Returns: { "sub": "user-id", "expiresAt": "2024-01-21T00:00:00.000Z" }
   */
  @Post('invitations/send')
  @HttpCode(HttpStatus.CREATED)
  async sendInvitation(
    @Body()
    dto: {
      email: string;
      tenantId: string;
      givenName?: string;
      familyName?: string;
      roleId: string; // Required - Tenant role ID (get from /api/integration/tenant-roles)
      expiresInDays?: number;
      clientId?: string; // Application clientId - determines redirect URL after acceptance
    },
  ) {
    if (!dto.email || !dto.tenantId || !dto.roleId) {
      throw new BadRequestException('email, tenantId, and roleId are required');
    }

    return this.invitationsService.sendInvitation(dto);
  }

  /**
   * Get pending invitations for a tenant
   *
   * Usage from your SaaS:
   * ```
   * GET /integration/invitations/pending?tenantId=tenant_123
   * Authorization: Bearer <m2m_access_token>
   * ```
   */
  @Get('invitations/pending')
  async getPendingInvitations(@Query('tenantId') tenantId: string) {
    if (!tenantId) {
      throw new BadRequestException('tenantId is required');
    }

    return this.invitationsService.getPendingInvitations(tenantId);
  }

  /**
   * Resend an invitation (generates new token and extends expiration)
   *
   * Usage from your SaaS:
   * ```
   * POST /integration/invitations/resend
   * Authorization: Bearer <m2m_access_token>
   * {
   *   "invitationId": "inv_123",
   *   "expiresInDays": 7
   * }
   * ```
   */
  @Post('invitations/resend')
  @HttpCode(HttpStatus.OK)
  async resendInvitation(
    @Body()
    dto: {
      invitationId: string;
      expiresInDays?: number;
    },
  ) {
    if (!dto.invitationId) {
      throw new BadRequestException('invitationId is required');
    }

    return this.invitationsService.resendInvitation(dto.invitationId, {
      expiresInDays: dto.expiresInDays,
    });
  }

  /**
   * Revoke an invitation
   *
   * Usage from your SaaS:
   * ```
   * DELETE /integration/invitations/:id
   * Authorization: Bearer <m2m_access_token>
   * ```
   */
  @Delete('invitations/:id')
  async revokeInvitation(@Param('id') id: string) {
    if (!id) {
      throw new BadRequestException('invitation id is required');
    }

    return this.invitationsService.revokeInvitation(id);
  }

  // ===========================================================================
  // LICENSE MANAGEMENT (For SaaS apps to manage user licenses)
  // ===========================================================================

  /**
   * Grant a license to a user
   *
   * Usage from your SaaS:
   * ```
   * POST /integration/licenses/grant
   * Authorization: Bearer <m2m_access_token>
   * {
   *   "tenantId": "tenant_456",
   *   "userId": "user_123",
   *   "applicationId": "app_abc",
   *   "licenseTypeId": "license_pro"
   * }
   * ```
   */
  @Post('licenses/grant')
  @HttpCode(HttpStatus.CREATED)
  async grantLicense(
    @Body()
    dto: {
      tenantId: string;
      userId: string;
      applicationId: string;
      licenseTypeId: string;
    },
  ) {
    if (!dto.tenantId || !dto.userId || !dto.applicationId || !dto.licenseTypeId) {
      throw new BadRequestException('tenantId, userId, applicationId, and licenseTypeId are required');
    }

    return this.licensingService.grantLicense(dto);
  }

  /**
   * Revoke a license from a user
   *
   * Usage from your SaaS:
   * ```
   * POST /integration/licenses/revoke
   * Authorization: Bearer <m2m_access_token>
   * {
   *   "tenantId": "tenant_456",
   *   "userId": "user_123",
   *   "applicationId": "app_abc"
   * }
   * ```
   */
  @Post('licenses/revoke')
  @HttpCode(HttpStatus.OK)
  async revokeLicense(
    @Body()
    dto: {
      tenantId: string;
      userId: string;
      applicationId: string;
    },
  ) {
    if (!dto.tenantId || !dto.userId || !dto.applicationId) {
      throw new BadRequestException('tenantId, userId, and applicationId are required');
    }

    return this.licensingService.revokeLicense(dto);
  }

  /**
   * Change a user's license type
   *
   * Usage from your SaaS:
   * ```
   * POST /integration/licenses/change-type
   * Authorization: Bearer <m2m_access_token>
   * {
   *   "tenantId": "tenant_456",
   *   "userId": "user_123",
   *   "applicationId": "app_abc",
   *   "newLicenseTypeId": "license_pro"
   * }
   * ```
   */
  @Post('licenses/change-type')
  @HttpCode(HttpStatus.OK)
  async changeLicenseType(
    @Body()
    dto: {
      tenantId: string;
      userId: string;
      applicationId: string;
      newLicenseTypeId: string;
    },
  ) {
    if (!dto.tenantId || !dto.userId || !dto.applicationId || !dto.newLicenseTypeId) {
      throw new BadRequestException('tenantId, userId, applicationId, and newLicenseTypeId are required');
    }

    return this.licensingService.changeLicenseType(dto);
  }

  /**
   * Get all licenses for a user in a tenant
   *
   * Usage from your SaaS:
   * ```
   * GET /integration/licenses/tenants/:tenantId/users/:userId
   * Authorization: Bearer <m2m_access_token>
   * ```
   */
  @Get('licenses/tenants/:tenantId/users/:userId')
  async getUserLicenses(
    @Param('tenantId') tenantId: string,
    @Param('userId') userId: string,
  ) {
    if (!tenantId || !userId) {
      throw new BadRequestException('tenantId and userId are required');
    }

    return this.licensingService.getUserLicenses(tenantId, userId);
  }

  /**
   * Get all license holders for an application in a tenant
   *
   * Usage from your SaaS:
   * ```
   * GET /integration/licenses/tenants/:tenantId/applications/:applicationId/holders
   * Authorization: Bearer <m2m_access_token>
   * ```
   */
  @Get('licenses/tenants/:tenantId/applications/:applicationId/holders')
  async getLicenseHolders(
    @Param('tenantId') tenantId: string,
    @Param('applicationId') applicationId: string,
  ) {
    if (!tenantId || !applicationId) {
      throw new BadRequestException('tenantId and applicationId are required');
    }

    return this.licensingService.getLicenseHolders(tenantId, applicationId);
  }

  /**
   * Get license audit log for a tenant
   *
   * Usage from your SaaS:
   * ```
   * GET /integration/licenses/tenants/:tenantId/audit-log?userId=xxx&applicationId=xxx&limit=50&offset=0
   * Authorization: Bearer <m2m_access_token>
   * ```
   */
  @Get('licenses/tenants/:tenantId/audit-log')
  async getLicenseAuditLog(
    @Param('tenantId') tenantId: string,
    @Query('userId') userId?: string,
    @Query('applicationId') applicationId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    if (!tenantId) {
      throw new BadRequestException('tenantId is required');
    }

    return this.licensingService.getLicenseAuditLog(tenantId, {
      userId,
      applicationId,
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
    });
  }

  /**
   * Get usage overview for a tenant
   *
   * Usage from your SaaS:
   * ```
   * GET /integration/licenses/tenants/:tenantId/usage-overview
   * Authorization: Bearer <m2m_access_token>
   * ```
   */
  @Get('licenses/tenants/:tenantId/usage-overview')
  async getUsageOverview(@Param('tenantId') tenantId: string) {
    if (!tenantId) {
      throw new BadRequestException('tenantId is required');
    }

    return this.licensingService.getUsageOverview(tenantId);
  }

  /**
   * Get usage trends for a tenant
   *
   * Usage from your SaaS:
   * ```
   * GET /integration/licenses/tenants/:tenantId/usage-trends?days=30
   * Authorization: Bearer <m2m_access_token>
   * ```
   */
  @Get('licenses/tenants/:tenantId/usage-trends')
  async getUsageTrends(
    @Param('tenantId') tenantId: string,
    @Query('days') days?: string,
  ) {
    if (!tenantId) {
      throw new BadRequestException('tenantId is required');
    }

    return this.licensingService.getUsageTrends(tenantId, days ? parseInt(days, 10) : 30);
  }

  // ===========================================================================
  // TENANT ROLE MANAGEMENT (M2M)
  // ===========================================================================

  /**
   * Get all available tenant roles (IDP-level)
   *
   * These are instance-wide roles like "owner", "admin", "member".
   * Use these to populate role pickers in your app.
   *
   * Usage from your SaaS:
   * ```
   * GET /integration/tenant-roles
   * Authorization: Bearer <m2m_access_token>
   * ```
   */
  @Get('tenant-roles')
  async getTenantRoles() {
    return this.rolesService.getTenantRoles();
  }

  /**
   * Get all roles for an application (by clientId)
   *
   * These are application-specific roles, NOT tenant-level roles.
   * Use these to populate role pickers when inviting users or assigning roles.
   *
   * Usage from your SaaS:
   * ```
   * GET /integration/application-roles?clientId=your-client-id
   * Authorization: Bearer <m2m_access_token>
   * ```
   */
  @Get('application-roles')
  async getApplicationRoles(@Query('clientId') clientId: string) {
    if (!clientId) {
      throw new BadRequestException('clientId query parameter is required');
    }
    return this.rolesService.getApplicationRoles(clientId);
  }

  /**
   * Set a member's tenant role (replaces any existing roles)
   *
   * Enforces role hierarchy:
   * - Owners can change anyone's role (except last owner protection)
   * - Admins can change admins and members, but cannot touch owners or promote to owner
   * - Members cannot change roles
   *
   * Usage from your SaaS:
   * ```
   * PUT /integration/memberships/:membershipId/tenant-role
   * Authorization: Bearer <m2m_access_token>
   * {
   *   "roleSlug": "admin",
   *   "callerUserId": "user_123"
   * }
   * ```
   */
  @Put('memberships/:membershipId/tenant-role')
  async setMemberRole(
    @Param('membershipId') membershipId: string,
    @Body() dto: { roleSlug: string; callerUserId: string },
  ) {
    if (!dto.roleSlug) {
      throw new BadRequestException('roleSlug is required');
    }
    if (!dto.callerUserId) {
      throw new BadRequestException('callerUserId is required');
    }

    return this.rolesService.setMemberRole(membershipId, dto.roleSlug, dto.callerUserId);
  }

  // ===========================================================================
  // TENANT MFA POLICY MANAGEMENT
  // ===========================================================================

  /**
   * Get MFA policy for a tenant
   * 
   * Usage from your SaaS:
   * ```
   * GET /integration/tenants/:tenantId/mfa-policy
   * Authorization: Bearer <m2m_access_token>
   * ```
   */
  @Get('tenants/:tenantId/mfa-policy')
  async getTenantMfaPolicy(@Param('tenantId') tenantId: string) {
    return this.mfaService.getTenantMfaPolicy(tenantId);
  }

  /**
   * Update MFA policy for a tenant
   * Only tenant owners/admins should call this
   * 
   * Usage from your SaaS:
   * ```
   * PUT /integration/tenants/:tenantId/mfa-policy
   * Authorization: Bearer <m2m_access_token>
   * {
   *   "policy": "REQUIRED",
   *   "gracePeriodDays": 14
   * }
   * ```
   */
  @Put('tenants/:tenantId/mfa-policy')
  @HttpCode(HttpStatus.OK)
  async updateTenantMfaPolicy(
    @Param('tenantId') tenantId: string,
    @Body() dto: { 
      policy: 'DISABLED' | 'OPTIONAL' | 'ENCOURAGED' | 'REQUIRED';
      gracePeriodDays?: number;
    },
  ) {
    if (!dto.policy) {
      throw new BadRequestException('policy is required');
    }
    
    const validPolicies = ['DISABLED', 'OPTIONAL', 'ENCOURAGED', 'REQUIRED'];
    if (!validPolicies.includes(dto.policy)) {
      throw new BadRequestException(`policy must be one of: ${validPolicies.join(', ')}`);
    }
    
    return this.mfaService.updateTenantMfaPolicy(
      tenantId,
      dto.policy,
      dto.gracePeriodDays,
    );
  }

  /**
   * Get MFA compliance stats for a tenant
   * Shows how many members have MFA enabled
   * 
   * Usage from your SaaS:
   * ```
   * GET /integration/tenants/:tenantId/mfa-stats
   * Authorization: Bearer <m2m_access_token>
   * ```
   */
  @Get('tenants/:tenantId/mfa-stats')
  async getTenantMfaStats(@Param('tenantId') tenantId: string) {
    return this.mfaService.getTenantMfaStats(tenantId);
  }

  /**
   * Check if a specific user is MFA compliant for a tenant
   * 
   * Usage from your SaaS:
   * ```
   * GET /integration/tenants/:tenantId/users/:userId/mfa-compliance
   * Authorization: Bearer <m2m_access_token>
   * ```
   */
  @Get('tenants/:tenantId/users/:userId/mfa-compliance')
  async checkUserMfaCompliance(
    @Param('tenantId') tenantId: string,
    @Param('userId') userId: string,
  ) {
    return this.mfaService.checkUserMfaCompliance(userId, tenantId);
  }
}
