import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantPermissionGuard } from '../guards/tenant-permission.guard';
import { RequireTenantPermission } from '../decorators/require-tenant-permission.decorator';
import { JwtTenantId } from '../decorators/jwt-tenant-id.decorator';
import { TENANT_PERMISSIONS } from '../../authorization';
import { LicenseCheckService } from '../services/license-check.service';
import { CheckLicenseDto, BulkCheckLicenseDto, CheckFeatureDto } from '../dto';

/**
 * LicenseCheckController - SDK Integration API
 *
 * These are the endpoints that external applications call to check
 * if users have valid licenses.
 *
 * Protected by JWT authentication with tenant permission checks.
 * The tenant ID is extracted from the JWT to prevent IDOR attacks.
 */
@Controller('integration/licenses')
@UseGuards(JwtAuthGuard, TenantPermissionGuard)
export class LicenseCheckController {
  constructor(
    private readonly licenseCheckService: LicenseCheckService,
  ) {}

  // ===========================================================================
  // PRIMARY LICENSE CHECK
  // ===========================================================================

  /**
   * Check if a user has a license for an application
   *
   * GET /api/integration/licenses/check?userId=xxx&applicationId=xxx
   *
   * Note: tenantId is extracted from JWT (not query param) for security
   */
  @Get('check')
  @RequireTenantPermission(TENANT_PERMISSIONS.LICENSES_VIEW)
  async checkLicense(
    @JwtTenantId() tenantId: string,
    @Query('userId') userId: string,
    @Query('applicationId') applicationId: string,
  ) {
    return this.licenseCheckService.checkLicense(
      tenantId,
      userId,
      applicationId,
    );
  }

  /**
   * POST version for SDKs that prefer POST
   */
  @Post('check')
  @RequireTenantPermission(TENANT_PERMISSIONS.LICENSES_VIEW)
  async checkLicensePost(
    @JwtTenantId() tenantId: string,
    @Body() dto: Omit<CheckLicenseDto, 'tenantId'>,
  ) {
    return this.licenseCheckService.checkLicense(
      tenantId,
      dto.userId,
      dto.applicationId,
    );
  }

  // ===========================================================================
  // BULK LICENSE CHECK
  // ===========================================================================

  @Post('check-bulk')
  @RequireTenantPermission(TENANT_PERMISSIONS.LICENSES_VIEW)
  async checkLicensesBulk(
    @JwtTenantId() tenantId: string,
    @Body() dto: Omit<BulkCheckLicenseDto, 'tenantId'>,
  ) {
    return this.licenseCheckService.checkLicensesBulk(
      tenantId,
      dto.userId,
      dto.applicationIds,
    );
  }

  // ===========================================================================
  // FEATURE CHECK
  // ===========================================================================

  @Get('feature')
  @RequireTenantPermission(TENANT_PERMISSIONS.LICENSES_VIEW)
  async hasFeature(
    @JwtTenantId() tenantId: string,
    @Query('userId') userId: string,
    @Query('applicationId') applicationId: string,
    @Query('featureKey') featureKey: string,
  ) {
    const result = await this.licenseCheckService.hasFeature(
      tenantId,
      userId,
      applicationId,
      featureKey,
    );
    return { hasFeature: result };
  }

  @Post('feature')
  @RequireTenantPermission(TENANT_PERMISSIONS.LICENSES_VIEW)
  async hasFeaturePost(
    @JwtTenantId() tenantId: string,
    @Body() dto: Omit<CheckFeatureDto, 'tenantId'>,
  ) {
    const result = await this.licenseCheckService.hasFeature(
      tenantId,
      dto.userId,
      dto.applicationId,
      dto.featureKey,
    );
    return { hasFeature: result };
  }

  // ===========================================================================
  // USER LICENSE TYPE
  // ===========================================================================

  @Get('type')
  @RequireTenantPermission(TENANT_PERMISSIONS.LICENSES_VIEW)
  async getUserLicenseType(
    @JwtTenantId() tenantId: string,
    @Query('userId') userId: string,
    @Query('applicationId') applicationId: string,
  ) {
    const licenseType = await this.licenseCheckService.getUserLicenseType(
      tenantId,
      userId,
      applicationId,
    );
    return { licenseType };
  }

  // ===========================================================================
  // TENANT STATS (requires licenses:view permission)
  // ===========================================================================

  @Get('apps/:applicationId/users')
  @RequireTenantPermission(TENANT_PERMISSIONS.LICENSES_VIEW)
  async getAppLicensedUsers(
    @JwtTenantId() tenantId: string,
    @Param('applicationId') applicationId: string,
  ) {
    return this.licenseCheckService.getAppLicensedUsers(
      tenantId,
      applicationId,
    );
  }

  @Get('apps/:applicationId/count')
  @RequireTenantPermission(TENANT_PERMISSIONS.LICENSES_VIEW)
  async countLicensedUsers(
    @JwtTenantId() tenantId: string,
    @Param('applicationId') applicationId: string,
  ) {
    const count = await this.licenseCheckService.countLicensedUsers(
      tenantId,
      applicationId,
    );
    return { count };
  }
}
