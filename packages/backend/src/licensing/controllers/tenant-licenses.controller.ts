import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  ForbiddenException,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantAccessGuard } from '../../tenants/guards/tenant-access.guard';
import { TenantIdentifierGuard } from '../../tenants/guards/tenant-identifier.guard';
import { PermissionGuard } from '../../authorization/guards/permission.guard';
import { RequirePermission } from '../../authorization/decorators/require-permission.decorator';
import { TENANT_PERMISSIONS } from '../../authorization/constants';
import { LicensePoolService } from '../services/license-pool.service';
import { LicenseAssignmentService } from '../services/license-assignment.service';
import { LicenseAssignmentBulkService } from '../services/license-assignment-bulk.service';
import { LicenseUsageService } from '../services/license-usage.service';
import {
  GrantLicenseBodyDto,
  RevokeLicenseBodyDto,
  ChangeLicenseBodyDto,
  BulkGrantBodyDto,
  BulkRevokeBodyDto,
  ProvisionSubscriptionBodyDto,
  UpdateQuantityBodyDto,
  UsageTrendsQueryDto,
} from '../dto/tenant-licenses.dto';

/**
 * TenantLicensesController - self-serve licensing for tenant admins.
 *
 * The super-admin LicenseAdminController is for internal Interspark operators.
 * THIS controller lets a tenant's own owner/admin/billing-admin manage their
 * licenses, scoped strictly to their tenant.
 *
 * Security model:
 * - `TenantAccessGuard` verifies the caller has an ACTIVE/INVITED membership in
 *   the `:tenantId` in the URL and attaches fresh, DB-derived permissions
 *   (owner expanded to god-mode via resolveEffectiveTenantPermissions).
 * - `PermissionGuard` enforces the per-route `@RequirePermission`.
 * - tenantId ALWAYS comes from the URL, never the body.
 * - Subscription-scoped routes additionally verify the subscription belongs to
 *   this tenant (the underlying services key by subscriptionId alone, so this
 *   controller is responsible for that IDOR check).
 *
 * Permission tiers:
 * - `licenses:view`      → read (owner, admin, member, billing-admin)
 * - `licenses:manage`    → grant/revoke/change seats (owner, admin, billing-admin)
 * - `licenses:provision` → buy/resize/cancel inventory (owner, billing-admin)
 */
@Controller('tenants/:tenantId/licenses')
@UseGuards(JwtAuthGuard, TenantIdentifierGuard, TenantAccessGuard, PermissionGuard)
export class TenantLicensesController {
  constructor(
    private readonly pool: LicensePoolService,
    private readonly assignments: LicenseAssignmentService,
    private readonly bulk: LicenseAssignmentBulkService,
    private readonly usage: LicenseUsageService,
  ) {}

    private callerId(req?: { user?: { sub?: string } }): string | undefined {
    return req?.user?.sub;
  }

  /** Ensure a subscription actually belongs to this tenant (IDOR guard). */
  private async assertSubscriptionInTenant(subscriptionId: string, tenantId: string) {
    const sub = await this.pool.findById(subscriptionId);
    if (sub.tenantId !== tenantId) {
      // Don't confirm existence of another tenant's resource.
      throw new ForbiddenException('Subscription does not belong to this tenant');
    }
    return sub;
  }

  // ===========================================================================
  // READ (licenses:view)
  // ===========================================================================

  @Get('overview')
  @RequirePermission(TENANT_PERMISSIONS.LICENSES_VIEW)
  getOverview(@Param('tenantId') tenantId: string) {
    return this.pool.getTenantLicenseOverview(tenantId);
  }

  @Get('subscriptions')
  @RequirePermission(TENANT_PERMISSIONS.LICENSES_VIEW)
  getSubscriptions(@Param('tenantId') tenantId: string) {
    return this.pool.getTenantSubscriptions(tenantId);
  }

  @Get('available-types')
  @RequirePermission(TENANT_PERMISSIONS.LICENSES_VIEW)
  getAvailableTypes(@Param('tenantId') tenantId: string) {
    return this.pool.getAvailableLicenseTypesForTenant(tenantId);
  }

  @Get('members')
  @RequirePermission(TENANT_PERMISSIONS.LICENSES_VIEW)
  getMembers(@Param('tenantId') tenantId: string) {
    return this.assignments.getTenantMembersWithLicenses(tenantId);
  }

  @Get('users/:userId')
  @RequirePermission(TENANT_PERMISSIONS.LICENSES_VIEW)
  getUserLicenses(
    @Param('tenantId') tenantId: string,
    @Param('userId') userId: string,
  ) {
    return this.assignments.getUserLicenses(tenantId, userId);
  }

  @Get('apps/:appId/holders')
  @RequirePermission(TENANT_PERMISSIONS.LICENSES_VIEW)
  getAppHolders(
    @Param('tenantId') tenantId: string,
    @Param('appId') appId: string,
  ) {
    return this.assignments.getAppLicenseHolders(tenantId, appId);
  }

  /**
   * GET /api/tenants/:tenantId/licenses/usage-trends?days=30
   * Seat usage time series (owned vs assigned) for charts, from the daily
   * snapshots written by the license lifecycle sweep. Gated on billing:view.
   */
  @Get('usage-trends')
  @RequirePermission(TENANT_PERMISSIONS.BILLING_VIEW)
  getUsageTrends(
    @Param('tenantId') tenantId: string,
    @Query() query: UsageTrendsQueryDto,
  ) {
    return this.usage.getUsageTrends(tenantId, query.days ?? 30);
  }

  // ===========================================================================
  // MANAGE SEATS (licenses:manage) — assign within purchased inventory
  // ===========================================================================

  @Post('grant')
  @RequirePermission(TENANT_PERMISSIONS.LICENSES_MANAGE)
  grant(
    @Param('tenantId') tenantId: string,
    @Body() body: GrantLicenseBodyDto,
    @Req() req: any,
  ) {
    return this.assignments.grantLicense({
      tenantId,
      userId: body.userId,
      applicationId: body.applicationId,
      licenseTypeId: body.licenseTypeId,
      assignedById: this.callerId(req),
    });
  }

  @Post('revoke')
  @RequirePermission(TENANT_PERMISSIONS.LICENSES_MANAGE)
  async revoke(
    @Param('tenantId') tenantId: string,
    @Body() body: RevokeLicenseBodyDto,
  ) {
    await this.assignments.revokeLicense({
      tenantId,
      userId: body.userId,
      applicationId: body.applicationId,
    });
    return { success: true as const };
  }

  @Post('change')
  @RequirePermission(TENANT_PERMISSIONS.LICENSES_MANAGE)
  change(
    @Param('tenantId') tenantId: string,
    @Body() body: ChangeLicenseBodyDto,
    @Req() req: any,
  ) {
    return this.assignments.changeLicenseType({
      tenantId,
      userId: body.userId,
      applicationId: body.applicationId,
      newLicenseTypeId: body.newLicenseTypeId,
      assignedById: this.callerId(req),
    });
  }

  @Post('grant-bulk')
  @RequirePermission(TENANT_PERMISSIONS.LICENSES_MANAGE)
  grantBulk(
    @Param('tenantId') tenantId: string,
    @Body() body: BulkGrantBodyDto,
    @Req() req: any,
  ) {
    const assignedById = this.callerId(req);
    return this.bulk.grantLicensesBulk(
      body.assignments.map((a) => ({ ...a, tenantId, assignedById })),
    );
  }

  @Post('revoke-bulk')
  @RequirePermission(TENANT_PERMISSIONS.LICENSES_MANAGE)
  revokeBulk(
    @Param('tenantId') tenantId: string,
    @Body() body: BulkRevokeBodyDto,
  ) {
    return this.bulk.revokeLicensesBulk(
      body.revocations.map((r) => ({ ...r, tenantId })),
    );
  }

  @Delete('users/:userId')
  @RequirePermission(TENANT_PERMISSIONS.LICENSES_MANAGE)
  async revokeAllForUser(
    @Param('tenantId') tenantId: string,
    @Param('userId') userId: string,
  ) {
    const revoked = await this.bulk.revokeAllUserLicenses(tenantId, userId);
    return { revoked };
  }

  // ===========================================================================
  // PROVISION INVENTORY (licenses:provision) — owner + billing-admin
  // ===========================================================================

  @Post('subscriptions')
  @RequirePermission(TENANT_PERMISSIONS.LICENSES_PROVISION)
  provision(
    @Param('tenantId') tenantId: string,
    @Body() body: ProvisionSubscriptionBodyDto,
    @Req() req: any,
  ) {
    return this.pool.provisionSubscription({
      tenantId,
      applicationId: body.applicationId,
      licenseTypeId: body.licenseTypeId,
      quantityPurchased: body.quantityPurchased,
      currentPeriodEnd: new Date(body.currentPeriodEnd),
      actorUserId: this.callerId(req),
    });
  }

  @Patch('subscriptions/:subscriptionId/quantity')
  @RequirePermission(TENANT_PERMISSIONS.LICENSES_PROVISION)
  async updateQuantity(
    @Param('tenantId') tenantId: string,
    @Param('subscriptionId') subscriptionId: string,
    @Body() body: UpdateQuantityBodyDto,
    @Req() req: any,
  ) {
    await this.assertSubscriptionInTenant(subscriptionId, tenantId);
    return this.pool.updateQuantity(subscriptionId, body.quantityPurchased, this.callerId(req));
  }

  @Post('subscriptions/:subscriptionId/cancel')
  @RequirePermission(TENANT_PERMISSIONS.LICENSES_PROVISION)
  async cancel(
    @Param('tenantId') tenantId: string,
    @Param('subscriptionId') subscriptionId: string,
    @Req() req: any,
  ) {
    await this.assertSubscriptionInTenant(subscriptionId, tenantId);
    return this.pool.cancelSubscription(subscriptionId, this.callerId(req));
  }
}
