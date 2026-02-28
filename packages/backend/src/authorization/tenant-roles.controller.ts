import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { TenantRolesService } from './tenant-roles.service';
import { PermissionsService } from './permissions.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AssignTenantRoleDto } from './dto';

/**
 * TenantRolesController - REST API for tenant role management
 *
 * Provides endpoints for:
 * - Listing available tenant roles
 * - Assigning/removing roles from memberships
 * - Checking permissions
 */
@Controller('authorization')
@UseGuards(JwtAuthGuard)
export class TenantRolesController {
  constructor(
    private readonly tenantRolesService: TenantRolesService,
    private readonly permissionsService: PermissionsService,
  ) {}

  // ===========================================================================
  // TENANT ROLE MANAGEMENT
  // ===========================================================================

  /**
   * GET /api/authorization/tenant-roles
   * Get all available tenant roles
   */
  @Get('tenant-roles')
  async getTenantRoles() {
    return this.tenantRolesService.getTenantRoles();
  }

  /**
   * GET /api/authorization/memberships/:membershipId/tenant-roles
   * Get a membership's tenant roles
   */
  @Get('memberships/:membershipId/tenant-roles')
  async getMembershipTenantRoles(
    @Param('membershipId') membershipId: string,
  ) {
    return this.tenantRolesService.getMembershipTenantRoles(membershipId);
  }

  /**
   * POST /api/authorization/memberships/:membershipId/tenant-roles
   * Assign a tenant role to a membership
   */
  @Post('memberships/:membershipId/tenant-roles')
  async assignTenantRole(
    @Param('membershipId') membershipId: string,
    @Body() dto: AssignTenantRoleDto,
  ) {
    await this.tenantRolesService.assignTenantRole(
      membershipId,
      dto.tenantRoleSlug,
    );
    const roles =
      await this.tenantRolesService.getMembershipTenantRoles(membershipId);
    return {
      success: true,
      message: 'Tenant role assigned successfully',
      roles,
    };
  }

  /**
   * DELETE /api/authorization/memberships/:membershipId/tenant-roles/:roleSlug
   * Remove a tenant role from a membership
   */
  @Delete('memberships/:membershipId/tenant-roles/:roleSlug')
  @HttpCode(HttpStatus.OK)
  async removeTenantRole(
    @Param('membershipId') membershipId: string,
    @Param('roleSlug') roleSlug: string,
  ) {
    await this.tenantRolesService.removeTenantRole(membershipId, roleSlug);
    return { success: true, message: 'Tenant role removed successfully' };
  }

  /**
   * GET /api/authorization/memberships/:membershipId/permissions
   * Get resolved tenant permissions for a membership
   */
  @Get('memberships/:membershipId/permissions')
  async getMembershipPermissions(
    @Param('membershipId') membershipId: string,
  ) {
    const permissions =
      await this.tenantRolesService.getMembershipTenantPermissions(membershipId);
    return { permissions };
  }

  // ===========================================================================
  // PERMISSION CHECKING
  // ===========================================================================

  /**
   * GET /api/authorization/check
   * Check if current user has a permission in a tenant
   */
  @Get('check')
  async checkPermission(
    @CurrentUser('id') userId: string,
    @Param('tenantId') tenantId: string,
    @Body() body: { permission: string },
  ) {
    const result = await this.permissionsService.checkPermission(
      userId,
      tenantId,
      body.permission,
    );
    return {
      userId,
      tenantId,
      permission: body.permission,
      ...result,
    };
  }

  /**
   * POST /api/authorization/check-bulk
   * Check multiple permissions at once
   */
  @Post('check-bulk')
  async checkPermissions(
    @CurrentUser('id') userId: string,
    @Body() body: { tenantId: string; permissions: string[] },
  ) {
    const results = await this.permissionsService.checkPermissions(
      userId,
      body.tenantId,
      body.permissions,
    );
    return {
      userId,
      tenantId: body.tenantId,
      results,
      allAllowed: Object.values(results).every((v) => v),
    };
  }

  /**
   * GET /api/authorization/users/:userId/tenants/:tenantId/permissions
   * Get all permissions for a user in a tenant
   */
  @Get('users/:userId/tenants/:tenantId/permissions')
  async getUserPermissions(
    @Param('userId') userId: string,
    @Param('tenantId') tenantId: string,
  ) {
    return this.permissionsService.getUserPermissions(userId, tenantId);
  }
}
