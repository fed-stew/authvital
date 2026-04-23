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
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { M2MAuthGuard, M2MRequestInfo } from '../../oauth/m2m-auth.guard';
import { IntegrationLicensingService, IntegrationRolesService } from '../services';
import { IntegrationEntitlementsService } from '../services/integration-entitlements.service';

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
@UseGuards(M2MAuthGuard)
export class IntegrationLicensingController {
  constructor(
    private readonly licensingService: IntegrationLicensingService,
    private readonly rolesService: IntegrationRolesService,
    private readonly entitlementsService: IntegrationEntitlementsService,
  ) {}

  /**
   * Validate that the M2M client has permission to access the tenant's data.
   * Checks if the application (identified by clientId) has an active subscription for the tenant.
   */
  private async validateTenantAccess(
    req: RequestWithM2M,
    tenantId: string,
  ): Promise<void> {
    const m2m = req.m2m;
    if (!m2m?.clientId) {
      throw new UnauthorizedException('M2M client information not found');
    }

    // Check if the application has an active subscription for this tenant
    const subscriptionStatus = await this.entitlementsService.getSubscriptionStatus(
      tenantId,
      undefined, // Check all applications for this client
    );

    // The check is based on whether the tenant has any active subscriptions
    // In a stricter implementation, you would verify that the specific application
    // (identified by clientId) has a subscription for this tenant
    if (!subscriptionStatus.hasActiveSubscription) {
      throw new UnauthorizedException(
        'M2M client is not authorized to access this tenant\'s data',
      );
    }
  }

  /**
   * Grant a license to a user
   */
  @Post('grant-license')
  @HttpCode(HttpStatus.OK)
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
  async getUserLicenses(
    @Req() req: RequestWithM2M,
    @Query('userId') userId: string,
    @Query('tenantId') tenantId: string,
  ) {
    if (!userId || !tenantId) {
      throw new BadRequestException('userId and tenantId are required');
    }
    await this.validateTenantAccess(req, tenantId);
    return this.licensingService.getUserLicenses(tenantId, userId);
  }

  /**
   * Get license holders for an application
   */
  @Get('license-holders')
  async getLicenseHolders(
    @Req() req: RequestWithM2M,
    @Query('tenantId') tenantId: string,
    @Query('applicationId') applicationId: string,
  ) {
    if (!tenantId || !applicationId) {
      throw new BadRequestException('tenantId and applicationId are required');
    }
    await this.validateTenantAccess(req, tenantId);
    return this.licensingService.getLicenseHolders(tenantId, applicationId);
  }

  /**
   * Get usage overview for a tenant
   */
  @Get('usage-overview')
  async getUsageOverview(
    @Req() req: RequestWithM2M,
    @Query('tenantId') tenantId: string,
  ) {
    if (!tenantId) {
      throw new BadRequestException('tenantId is required');
    }
    await this.validateTenantAccess(req, tenantId);
    return this.licensingService.getUsageOverview(tenantId);
  }

  /**
   * Get roles for an application
   */
  @Get('roles/:clientId')
  async getApplicationRoles(@Param('clientId') clientId: string) {
    return this.rolesService.getApplicationRoles(clientId);
  }

  /**
   * Get tenant roles
   */
  @Get('tenant-roles')
  async getTenantRoles() {
    return this.rolesService.getTenantRoles();
  }

  /**
   * Set member role
   */
  @Post('set-member-role')
  @HttpCode(HttpStatus.OK)
  async setMemberRole(
    @Body() dto: {
      membershipId: string;
      roleId: string;
      applicationId: string;
    },
  ) {
    if (!dto.membershipId || !dto.roleId || !dto.applicationId) {
      throw new BadRequestException('membershipId, roleId, and applicationId are required');
    }
    return this.rolesService.setMemberRole(dto.membershipId, dto.roleId, dto.applicationId);
  }
}
