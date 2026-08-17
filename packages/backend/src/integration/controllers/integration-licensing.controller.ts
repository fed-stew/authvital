import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { M2MAuthGuard, M2MRequestInfo } from '../../oauth/m2m-auth.guard';
import { IntegrationLicensingService, IntegrationRolesService } from '../services';
import { IntegrationEntitlementsService } from '../services/integration-entitlements.service';
import { SetMemberRoleDto } from '../dto';
import {
  RequireScopes,
  IntegrationScope,
  M2mTenantFrom,
  M2mTenantAgnostic,
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
 * Integration Licensing Controller
 * Handles licensing and role management
 */
@Controller('integration')
@UseGuards(M2MAuthGuard, M2mScopeGuard, M2mTenantGuard)
export class IntegrationLicensingController {
  constructor(
    private readonly licensingService: IntegrationLicensingService,
    private readonly rolesService: IntegrationRolesService,
    private readonly entitlementsService: IntegrationEntitlementsService,
  ) {}

  /**
   * Validate that the tenant is licensable for write operations.
   * Requires the tenant to have an active subscription (license pool) before
   * seats can be granted / revoked / changed. This is NOT an M2M-client
   * authorization check — the M2MAuthGuard already authenticates the client;
   * here we simply refuse mutations against a tenant that has no pool to mutate.
   */
  private async validateTenantAccess(
    req: RequestWithM2M,
    tenantId: string,
  ): Promise<void> {
    const m2m = req.m2m;
    if (!m2m?.clientId) {
      throw new UnauthorizedException('M2M client information not found');
    }

    // Require the tenant to have an active subscription (license pool).
    const subscriptionStatus = await this.entitlementsService.getSubscriptionStatus(
      tenantId,
      undefined, // Check all applications for this tenant
    );

    if (!subscriptionStatus.hasActiveSubscription) {
      throw new ForbiddenException(
        `Tenant '${tenantId}' has no active subscription (license pool). Provision a subscription before managing licenses.`,
      );
    }
  }

  /**
   * Grant a license to a user
   */
  @Post('grant-license')
  @HttpCode(HttpStatus.OK)
  @RequireScopes(IntegrationScope.WRITE)
  @M2mTenantFrom('body')
  async grantLicense(
    @Req() req: RequestWithM2M,
    @Body() dto: {
      userId: string;
      tenantId: string;
      applicationId: string;
      licenseTypeId: string;
    },
  ) {
    if (!dto.userId || !dto.tenantId || !dto.applicationId || !dto.licenseTypeId) {
      throw new BadRequestException('userId, tenantId, applicationId, and licenseTypeId are required');
    }
    await this.validateTenantAccess(req, dto.tenantId);
    return this.licensingService.grantLicense(dto);
  }

  /**
   * Revoke a license from a user
   */
  @Post('revoke-license')
  @HttpCode(HttpStatus.OK)
  @RequireScopes(IntegrationScope.WRITE)
  @M2mTenantFrom('body')
  async revokeLicense(
    @Req() req: RequestWithM2M,
    @Body() dto: {
      userId: string;
      tenantId: string;
      applicationId: string;
    },
  ) {
    if (!dto.userId || !dto.tenantId || !dto.applicationId) {
      throw new BadRequestException('userId, tenantId, and applicationId are required');
    }
    await this.validateTenantAccess(req, dto.tenantId);
    return this.licensingService.revokeLicense(dto);
  }

  /**
   * Change a user's license type
   */
  @Post('change-license-type')
  @HttpCode(HttpStatus.OK)
  @RequireScopes(IntegrationScope.WRITE)
  @M2mTenantFrom('body')
  async changeLicenseType(
    @Req() req: RequestWithM2M,
    @Body() dto: {
      userId: string;
      tenantId: string;
      applicationId: string;
      newLicenseTypeId: string;
    },
  ) {
    if (!dto.userId || !dto.tenantId || !dto.applicationId || !dto.newLicenseTypeId) {
      throw new BadRequestException('userId, tenantId, applicationId, and newLicenseTypeId are required');
    }
    await this.validateTenantAccess(req, dto.tenantId);
    return this.licensingService.changeLicenseType(dto);
  }

  /**
   * Get user's licenses in a tenant
   */
  @Get('user-licenses')
  @RequireScopes(IntegrationScope.READ)
  @M2mTenantFrom('query')
  async getUserLicenses(
    @Req() req: RequestWithM2M,
    @Query('userId') userId: string,
    @Query('tenantId') tenantId: string,
  ) {
    if (!userId || !tenantId) {
      throw new BadRequestException('userId and tenantId are required');
    }
    // Read-only: a tenant with no license pool genuinely has zero licenses,
    // so let the service return its natural (empty) result instead of throwing.
    return this.licensingService.getUserLicenses(tenantId, userId);
  }

  /**
   * Get license holders for an application
   */
  @Get('license-holders')
  @RequireScopes(IntegrationScope.READ)
  @M2mTenantFrom('query')
  async getLicenseHolders(
    @Req() req: RequestWithM2M,
    @Query('tenantId') tenantId: string,
    @Query('applicationId') applicationId: string,
  ) {
    if (!tenantId || !applicationId) {
      throw new BadRequestException('tenantId and applicationId are required');
    }
    // Read-only: no pool => no holders. Return the natural (empty) result.
    return this.licensingService.getLicenseHolders(tenantId, applicationId);
  }

  /**
   * Get usage overview for a tenant
   */
  @Get('usage-overview')
  @RequireScopes(IntegrationScope.READ)
  @M2mTenantFrom('query')
  async getUsageOverview(
    @Req() req: RequestWithM2M,
    @Query('tenantId') tenantId: string,
  ) {
    if (!tenantId) {
      throw new BadRequestException('tenantId is required');
    }
    // Read-only: no pool => zeroed overview. Return the natural service result.
    return this.licensingService.getUsageOverview(tenantId);
  }

  /**
   * Get roles for an application
   */
  @Get('roles/:clientId')
  @RequireScopes(IntegrationScope.READ)
  @M2mTenantAgnostic()
  async getApplicationRoles(@Param('clientId') clientId: string) {
    return this.rolesService.getApplicationRoles(clientId);
  }

  /**
   * Get tenant roles
   */
  @Get('tenant-roles')
  @RequireScopes(IntegrationScope.READ)
  @M2mTenantAgnostic()
  async getTenantRoles() {
    return this.rolesService.getTenantRoles();
  }

  /**
   * Set a member's application role.
   *
   * Body is validated by SetMemberRoleDto. The args are now passed with correct
   * intent: (membershipId, roleId=app Role id, applicationId). Previously the
   * controller forwarded them positionally into a service that expected
   * (membershipId, roleSlug, callerUserId) — so roleId was treated as a slug
   * and applicationId as a userId. See IntegrationRolesService.setMemberRole.
   */
  @Post('set-member-role')
  @HttpCode(HttpStatus.OK)
  @RequireScopes(IntegrationScope.WRITE)
  @M2mTenantFromRecord()
  async setMemberRole(
    @Req() req: RequestWithM2M,
    @Body() dto: SetMemberRoleDto,
  ) {
    const m2m = req.m2m;
    if (!m2m?.clientId) {
      throw new UnauthorizedException('M2M client information not found');
    }
    return this.rolesService.setMemberRole(
      dto.membershipId,
      dto.roleId,
      dto.applicationId,
      m2m.clientId,
    );
  }
}
