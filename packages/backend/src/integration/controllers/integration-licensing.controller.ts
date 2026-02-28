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
} from '@nestjs/common';
import { M2MAuthGuard } from '../../oauth/m2m-auth.guard';
import { IntegrationLicensingService, IntegrationRolesService } from '../services';

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
  ) {}

  /**
   * Grant a license to a user
   */
  @Post('grant-license')
  @HttpCode(HttpStatus.OK)
  async grantLicense(
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
    return this.licensingService.grantLicense(dto);
  }

  /**
   * Revoke a license from a user
   */
  @Post('revoke-license')
  @HttpCode(HttpStatus.OK)
  async revokeLicense(
    @Body() dto: {
      userId: string;
      tenantId: string;
      applicationId: string;
    },
  ) {
    if (!dto.userId || !dto.tenantId || !dto.applicationId) {
      throw new BadRequestException('userId, tenantId, and applicationId are required');
    }
    return this.licensingService.revokeLicense(dto);
  }

  /**
   * Change a user's license type
   */
  @Post('change-license-type')
  @HttpCode(HttpStatus.OK)
  async changeLicenseType(
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
    return this.licensingService.changeLicenseType(dto);
  }

  /**
   * Get user's licenses in a tenant
   */
  @Get('user-licenses')
  async getUserLicenses(
    @Query('userId') userId: string,
    @Query('tenantId') tenantId: string,
  ) {
    if (!userId || !tenantId) {
      throw new BadRequestException('userId and tenantId are required');
    }
    return this.licensingService.getUserLicenses(tenantId, userId);
  }

  /**
   * Get license holders for an application
   */
  @Get('license-holders')
  async getLicenseHolders(
    @Query('tenantId') tenantId: string,
    @Query('applicationId') applicationId: string,
  ) {
    if (!tenantId || !applicationId) {
      throw new BadRequestException('tenantId and applicationId are required');
    }
    return this.licensingService.getLicenseHolders(tenantId, applicationId);
  }

  /**
   * Get usage overview for a tenant
   */
  @Get('usage-overview')
  async getUsageOverview(@Query('tenantId') tenantId: string) {
    if (!tenantId) {
      throw new BadRequestException('tenantId is required');
    }
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
