import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { MfaService } from '../auth/mfa/mfa.service';
import { CreateTenantDto, UpdateTenantDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantAccessGuard, TenantIdentifierGuard } from './guards';
import { PermissionGuard } from '../authorization/guards/permission.guard';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';
import { TENANT_PERMISSIONS } from '../authorization/constants';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

/**
 * TenantsController - REST API for tenant operations
 *
 * Public routes (just need auth):
 * - POST /api/tenants - Create a new tenant
 * - GET /api/tenants/mine - Get current user's tenants
 *
 * Tenant-specific routes (require membership):
 * - GET /api/tenants/:tenantId - Get tenant details
 * - GET /api/tenants/:tenantId/overview - Get tenant dashboard stats
 * - PATCH /api/tenants/:tenantId - Update tenant
 * - DELETE /api/tenants/:tenantId - Delete tenant
 * - GET /api/tenants/:tenantId/applications - Get tenant's app subscriptions
 */
@Controller('tenants')
@UseGuards(JwtAuthGuard, TenantIdentifierGuard)
export class TenantsController {
  constructor(
    private readonly tenantsService: TenantsService,
    private readonly mfaService: MfaService,
  ) {}

  // ===========================================================================
  // PUBLIC ROUTES (just need auth, no tenant membership required)
  // ===========================================================================

  /**
   * POST /api/tenants
   * Create a new tenant (creator becomes owner)
   */
  @Post()
  async createTenant(
    @Body() dto: CreateTenantDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.tenantsService.createTenant(dto, userId);
  }

  /**
   * GET /api/tenants/mine
   * Get all tenants for the current user
   */
  @Get('mine')
  async getMyTenants(@CurrentUser('id') userId: string) {
    return this.tenantsService.getUserTenants(userId);
  }

  // ===========================================================================
  // TENANT-SPECIFIC ROUTES (require membership in the tenant)
  // ===========================================================================

  /**
   * GET /api/tenants/:tenantId
   * Get tenant details
   */
  @Get(':tenantId')
  @UseGuards(TenantAccessGuard, PermissionGuard)
  @RequirePermission(TENANT_PERMISSIONS.TENANT_VIEW)
  async getTenant(@Param('tenantId') tenantId: string) {
    return this.tenantsService.getTenant(tenantId);
  }

  /**
   * GET /api/tenants/:tenantId/overview
   * Get tenant dashboard stats
   */
  @Get(':tenantId/overview')
  @UseGuards(TenantAccessGuard, PermissionGuard)
  @RequirePermission(TENANT_PERMISSIONS.TENANT_VIEW)
  async getTenantOverview(@Param('tenantId') tenantId: string, @Req() req: any) {
    const overview = await this.tenantsService.getTenantOverview(tenantId);
    // Surface the caller's effective (owner-expanded) tenant permissions so the
    // portal can gate UI. TenantAccessGuard already resolved these.
    return {
      ...overview,
      permissions: (req.tenantPermissions as string[]) ?? [],
      isOwner: (req.isOwner as boolean) ?? false,
    };
  }

  /**
   * PATCH /api/tenants/:tenantId
   * Update tenant settings
   */
  @Patch(':tenantId')
  @UseGuards(TenantAccessGuard, PermissionGuard)
  @RequirePermission(TENANT_PERMISSIONS.TENANT_MANAGE)
  async updateTenant(
    @Param('tenantId') tenantId: string,
    @Body() dto: UpdateTenantDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.tenantsService.updateTenant(tenantId, dto, userId);
  }

  /**
   * DELETE /api/tenants/:tenantId
   * Delete a tenant (requires owner role - checked in service)
   */
  @Delete(':tenantId')
  @UseGuards(TenantAccessGuard, PermissionGuard)
  @RequirePermission(TENANT_PERMISSIONS.TENANT_DELETE)
  @HttpCode(HttpStatus.OK)
  async deleteTenant(@Param('tenantId') tenantId: string) {
    return this.tenantsService.deleteTenant(tenantId);
  }

  /**
   * GET /api/tenants/:tenantId/applications
   * Get tenant's app subscriptions
   */
  @Get(':tenantId/applications')
  @UseGuards(TenantAccessGuard, PermissionGuard)
  @RequirePermission(TENANT_PERMISSIONS.TENANT_VIEW)
  async getTenantApplications(@Param('tenantId') tenantId: string) {
    return this.tenantsService.getTenantApplications(tenantId);
  }

  // ===========================================================================
  // TENANT MFA POLICY (for tenant owners/admins)
  // ===========================================================================

  /**
   * GET /api/tenants/:tenantId/mfa-policy
   * Get the MFA policy for this tenant
   */
  @Get(':tenantId/mfa-policy')
  @UseGuards(TenantAccessGuard, PermissionGuard)
  @RequirePermission(TENANT_PERMISSIONS.TENANT_VIEW)
  async getMfaPolicy(@Param('tenantId') tenantId: string) {
    return this.mfaService.getTenantMfaPolicy(tenantId);
  }

  /**
   * PATCH /api/tenants/:tenantId/mfa-policy
   * Update the MFA policy for this tenant
   * Requires owner or admin tenant role
   */
  @Patch(':tenantId/mfa-policy')
  @UseGuards(TenantAccessGuard, PermissionGuard)
  @RequirePermission(TENANT_PERMISSIONS.TENANT_MANAGE)
  @HttpCode(HttpStatus.OK)
  async updateMfaPolicy(
    @Param('tenantId') tenantId: string,
    @Body() dto: { 
      policy: 'DISABLED' | 'OPTIONAL' | 'ENCOURAGED' | 'REQUIRED';
      gracePeriodDays?: number;
    },
    @CurrentUser('id') userId: string,
  ) {
    return this.mfaService.updateTenantMfaPolicy(
      tenantId,
      dto.policy,
      dto.gracePeriodDays,
      userId,
    );
  }

  /**
   * GET /api/tenants/:tenantId/mfa-stats
   * Get MFA compliance statistics for this tenant
   */
  @Get(':tenantId/mfa-stats')
  @UseGuards(TenantAccessGuard, PermissionGuard)
  @RequirePermission(TENANT_PERMISSIONS.TENANT_VIEW)
  async getMfaStats(@Param('tenantId') tenantId: string) {
    return this.mfaService.getTenantMfaStats(tenantId);
  }
}
