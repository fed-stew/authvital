import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SuperAdminGuard } from '../../super-admin/guards/super-admin.guard';
import { LicenseTypeService } from '../services/license-type.service';
import { LicensePoolService } from '../services/license-pool.service';
import { LicenseAssignmentService } from '../services/license-assignment.service';
import {
  CreateLicenseTypeDto,
  UpdateLicenseTypeDto,
  ProvisionSubscriptionDto,
  UpdateSubscriptionQuantityDto,
  GrantLicenseDto,
  RevokeLicenseDto,
  ChangeLicenseTypeDto,
  BulkGrantLicenseDto,
  BulkRevokeLicenseDto,
} from '../dto';

/**
 * LicenseAdminController - Admin Dashboard API 🎛️
 * 
 * Endpoints for managing the license pool system:
 * - License types (catalog)
 * - Subscriptions (inventory)
 * - License assignments (who has what)
 */
@Controller('licensing')
@UseGuards(SuperAdminGuard)
export class LicenseAdminController {
  constructor(
    private readonly licenseTypeService: LicenseTypeService,
    private readonly licensePoolService: LicensePoolService,
    private readonly licenseAssignmentService: LicenseAssignmentService,
  ) {}

  // ===========================================================================
  // LICENSE TYPES (Catalog Management)
  // ===========================================================================

  @Post('license-types')
  async createLicenseType(@Body() dto: CreateLicenseTypeDto) {
    return this.licenseTypeService.create(dto);
  }

  @Get('license-types/:id')
  async getLicenseType(@Param('id') id: string) {
    return this.licenseTypeService.findById(id);
  }

  @Put('license-types/:id')
  async updateLicenseType(
    @Param('id') id: string,
    @Body() dto: UpdateLicenseTypeDto,
  ) {
    return this.licenseTypeService.update(id, dto);
  }

  @Delete('license-types/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteLicenseType(@Param('id') id: string) {
    await this.licenseTypeService.delete(id);
  }

  @Post('license-types/:id/archive')
  async archiveLicenseType(@Param('id') id: string) {
    return this.licenseTypeService.archive(id);
  }

  @Get('applications/:applicationId/license-types')
  async getApplicationLicenseTypes(
    @Param('applicationId') applicationId: string,
    @Query('includeHidden') includeHidden?: string,
  ) {
    return this.licenseTypeService.findByApplication(
      applicationId,
      includeHidden === 'true',
    );
  }

  @Get('applications/:applicationId/subscription-stats')
  async getApplicationSubscriptionStats(
    @Param('applicationId') applicationId: string,
  ) {
    return this.licensePoolService.getApplicationSubscriptionStats(applicationId);
  }

  @Get('license-types')
  async getAllLicenseTypes(
    @Query('includeHidden') includeHidden?: string,
  ) {
    return this.licenseTypeService.findAll(
      includeHidden === 'true',
    );
  }

  // ===========================================================================
  // SUBSCRIPTIONS (Inventory Management)
  // ===========================================================================

  @Post('subscriptions')
  async provisionSubscription(@Body() dto: ProvisionSubscriptionDto) {
    return this.licensePoolService.provisionSubscription({
      ...dto,
      currentPeriodEnd: new Date(dto.currentPeriodEnd),
    });
  }

  @Get('subscriptions/:id')
  async getSubscription(@Param('id') id: string) {
    return this.licensePoolService.findById(id);
  }

  @Put('subscriptions/:id/quantity')
  async updateSubscriptionQuantity(
    @Param('id') id: string,
    @Body() dto: UpdateSubscriptionQuantityDto,
  ) {
    return this.licensePoolService.updateQuantity(id, dto.quantityPurchased);
  }

  @Post('subscriptions/:id/cancel')
  async cancelSubscription(@Param('id') id: string) {
    return this.licensePoolService.cancelSubscription(id);
  }

  @Post('subscriptions/:id/expire')
  async expireSubscription(@Param('id') id: string) {
    return this.licensePoolService.expireSubscription(id);
  }

  @Post('subscriptions/:id/reconcile')
  async reconcileSubscription(@Param('id') id: string) {
    const count = await this.licensePoolService.reconcileAssignedCount(id);
    return { reconciledCount: count };
  }

  @Get('tenants/:tenantId/subscriptions')
  async getTenantSubscriptions(@Param('tenantId') tenantId: string) {
    return this.licensePoolService.getTenantSubscriptions(tenantId);
  }

  @Get('tenants/:tenantId/license-overview')
  async getTenantLicenseOverview(@Param('tenantId') tenantId: string) {
    return this.licensePoolService.getTenantLicenseOverview(tenantId);
  }

  @Get('tenants/:tenantId/available-license-types')
  async getAvailableLicenseTypes(@Param('tenantId') tenantId: string) {
    return this.licensePoolService.getAvailableLicenseTypesForTenant(tenantId);
  }

  // ===========================================================================
  // LICENSE ASSIGNMENTS (User Access Management)
  // ===========================================================================

  @Post('licenses/grant')
  async grantLicense(@Body() dto: GrantLicenseDto) {
    return this.licenseAssignmentService.grantLicense(dto);
  }

  @Post('licenses/revoke')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeLicense(@Body() dto: RevokeLicenseDto) {
    await this.licenseAssignmentService.revokeLicense(dto);
  }

  @Post('licenses/change-type')
  async changeLicenseType(@Body() dto: ChangeLicenseTypeDto) {
    return this.licenseAssignmentService.changeLicenseType(dto);
  }

  // Bulk Operations

  @Post('licenses/grant-bulk')
  async grantLicensesBulk(@Body() dto: BulkGrantLicenseDto) {
    return this.licenseAssignmentService.grantLicensesBulk(dto.assignments);
  }

  @Post('licenses/revoke-bulk')
  async revokeLicensesBulk(@Body() dto: BulkRevokeLicenseDto) {
    return this.licenseAssignmentService.revokeLicensesBulk(dto.revocations);
  }

  @Get('tenants/:tenantId/users/:userId/licenses')
  async getUserLicenses(
    @Param('tenantId') tenantId: string,
    @Param('userId') userId: string,
  ) {
    return this.licenseAssignmentService.getUserLicenses(tenantId, userId);
  }

  @Get('subscriptions/:subscriptionId/assignments')
  async getSubscriptionAssignments(
    @Param('subscriptionId') subscriptionId: string,
  ) {
    return this.licenseAssignmentService.getSubscriptionAssignments(subscriptionId);
  }

  @Get('tenants/:tenantId/applications/:applicationId/license-holders')
  async getAppLicenseHolders(
    @Param('tenantId') tenantId: string,
    @Param('applicationId') applicationId: string,
  ) {
    return this.licenseAssignmentService.getAppLicenseHolders(tenantId, applicationId);
  }

  @Get('tenants/:tenantId/members-with-licenses')
  async getTenantMembersWithLicenses(@Param('tenantId') tenantId: string) {
    return this.licenseAssignmentService.getTenantMembersWithLicenses(tenantId);
  }

  @Get('tenants/:tenantId/applications/:applicationId/check-member-access')
  async checkMemberAccess(
    @Param('tenantId') tenantId: string,
    @Param('applicationId') applicationId: string,
  ) {
    return this.licensePoolService.checkMemberAccess(tenantId, applicationId);
  }

  @Delete('tenants/:tenantId/users/:userId/all-licenses')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeAllUserLicenses(
    @Param('tenantId') tenantId: string,
    @Param('userId') userId: string,
  ) {
    await this.licenseAssignmentService.revokeAllUserLicenses(tenantId, userId);
  }
}
