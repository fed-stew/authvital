import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { AppAccessService } from './app-access.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantAccessGuard } from '../tenants/guards/tenant-access.guard';
import { TenantIdentifierGuard } from '../tenants/guards/tenant-identifier.guard';
import { PermissionGuard } from './guards/permission.guard';
import { RequirePermission } from './decorators/require-permission.decorator';
import { TENANT_PERMISSIONS } from './constants';

/**
 * AppAccessMatrixController - the members x apps access grid in ONE call.
 *
 * Built for the Phase 4b matrix page so it can render the whole grid without
 * making N per-app requests.
 *
 * Full tenant-scoped guard stack (auth -> slug resolve -> membership check ->
 * permission). tenantId comes from the URL only.
 */
@Controller('tenants/:tenantId/app-access-matrix')
@UseGuards(JwtAuthGuard, TenantIdentifierGuard, TenantAccessGuard, PermissionGuard)
export class AppAccessMatrixController {
  constructor(private readonly appAccessService: AppAccessService) {}

  @Get()
  @RequirePermission(TENANT_PERMISSIONS.APP_ACCESS_VIEW)
  async getMatrix(@Param('tenantId') tenantId: string) {
    return this.appAccessService.getAccessMatrix(tenantId);
  }
}
