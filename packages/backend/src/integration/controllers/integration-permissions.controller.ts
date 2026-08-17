import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { M2MAuthGuard } from '../../oauth/m2m-auth.guard';
import { IntegrationPermissionsService, IntegrationEntitlementsService } from '../services';
import {
  RequireScopes,
  IntegrationScope,
  M2mTenantFrom,
  M2mScopeGuard,
  M2mTenantGuard,
} from '../m2m-authz';

/**
 * Integration Permissions Controller
 * Handles permission checks and entitlements
 */
@Controller('integration')
@UseGuards(M2MAuthGuard, M2mScopeGuard, M2mTenantGuard)
export class IntegrationPermissionsController {
  constructor(
    private readonly permissionsService: IntegrationPermissionsService,
    private readonly entitlementsService: IntegrationEntitlementsService,
  ) {}

  /**
   * Check if a user has a specific permission in a tenant
   */
  @Post('check-permission')
  @HttpCode(HttpStatus.OK)
  @RequireScopes(IntegrationScope.READ)
  @M2mTenantFrom('body')
  async checkPermission(
    @Body() dto: { userId: string; tenantId: string; permission: string },
  ) {
    if (!dto.userId || !dto.tenantId || !dto.permission) {
      throw new BadRequestException('userId, tenantId, and permission are required');
    }
    return this.permissionsService.checkPermission(dto.userId, dto.tenantId, dto.permission);
  }

  /**
   * Check multiple permissions at once
   */
  @Post('check-permissions')
  @HttpCode(HttpStatus.OK)
  @RequireScopes(IntegrationScope.READ)
  @M2mTenantFrom('body')
  async checkPermissions(
    @Body() dto: { userId: string; tenantId: string; permissions: string[] },
  ) {
    if (!dto.userId || !dto.tenantId || !dto.permissions?.length) {
      throw new BadRequestException('userId, tenantId, and permissions are required');
    }
    return this.permissionsService.checkPermissions(dto.userId, dto.tenantId, dto.permissions);
  }

  /**
   * Get all permissions for a user in a tenant
   */
  @Get('user-permissions')
  @RequireScopes(IntegrationScope.READ)
  @M2mTenantFrom('query')
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
   * Check if a tenant has access to a feature
   */
  @Get('check-feature')
  @RequireScopes(IntegrationScope.READ)
  @M2mTenantFrom('query')
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
  @RequireScopes(IntegrationScope.READ)
  @M2mTenantFrom('query')
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
   * Check seats availability for a tenant
   */
  @Get('check-seats')
  @RequireScopes(IntegrationScope.READ)
  @M2mTenantFrom('query')
  async checkSeats(
    @Query('tenantId') tenantId: string,
    @Query('applicationId') applicationId?: string,
  ) {
    if (!tenantId) {
      throw new BadRequestException('tenantId is required');
    }
    return this.entitlementsService.checkSeats(tenantId, applicationId);
  }
}
