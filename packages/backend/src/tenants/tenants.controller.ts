import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { MfaService } from '../auth/mfa/mfa.service';
import { CreateTenantDto, UpdateTenantDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantAccessGuard } from './guards';
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
@UseGuards(JwtAuthGuard)
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
  @UseGuards(TenantAccessGuard)
  async getTenant(@Param('tenantId') tenantId: string) {
    return this.tenantsService.getTenant(tenantId);
  }

  /**
   * GET /api/tenants/:tenantId/overview
   * Get tenant dashboard stats
   */
  @Get(':tenantId/overview')
  @UseGuards(TenantAccessGuard)
  async getTenantOverview(@Param('tenantId') tenantId: string) {
    return this.tenantsService.getTenantOverview(tenantId);
  }

  /**
   * PATCH /api/tenants/:tenantId
   * Update tenant settings
   */
  @Patch(':tenantId')
  @UseGuards(TenantAccessGuard)
  async updateTenant(
    @Param('tenantId') tenantId: string,
    @Body() dto: UpdateTenantDto,
  ) {
    return this.tenantsService.updateTenant(tenantId, dto);
  }

  /**
   * DELETE /api/tenants/:tenantId
   * Delete a tenant (requires owner role - checked in service)
   */
  @Delete(':tenantId')
  @UseGuards(TenantAccessGuard)
  @HttpCode(HttpStatus.OK)
  async deleteTenant(@Param('tenantId') tenantId: string) {
    return this.tenantsService.deleteTenant(tenantId);
  }

  /**
   * GET /api/tenants/:tenantId/applications
   * Get tenant's app subscriptions
   */
  @Get(':tenantId/applications')
  @UseGuards(TenantAccessGuard)
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
  @UseGuards(TenantAccessGuard)
  async getMfaPolicy(@Param('tenantId') tenantId: string) {
    return this.mfaService.getTenantMfaPolicy(tenantId);
  }

  /**
   * PATCH /api/tenants/:tenantId/mfa-policy
   * Update the MFA policy for this tenant
   * Requires owner or admin tenant role
   */
  @Patch(':tenantId/mfa-policy')
  @UseGuards(TenantAccessGuard)
  @HttpCode(HttpStatus.OK)
  async updateMfaPolicy(
    @Param('tenantId') tenantId: string,
    @Body() dto: { 
      policy: 'DISABLED' | 'OPTIONAL' | 'ENCOURAGED' | 'REQUIRED';
      gracePeriodDays?: number;
    },
  ) {
    // TODO: Add role check for owner/admin once permission guard is ready
    return this.mfaService.updateTenantMfaPolicy(
      tenantId,
      dto.policy,
      dto.gracePeriodDays,
    );
  }

  /**
   * GET /api/tenants/:tenantId/mfa-stats
   * Get MFA compliance statistics for this tenant
   */
  @Get(':tenantId/mfa-stats')
  @UseGuards(TenantAccessGuard)
  async getMfaStats(@Param('tenantId') tenantId: string) {
    return this.mfaService.getTenantMfaStats(tenantId);
  }
}
