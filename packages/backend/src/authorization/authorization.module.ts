import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { WebhooksModule } from '../webhooks/webhooks.module';

// Services
import { AppAccessService } from './app-access.service';
import { AppAccessAutoGrantService } from './app-access-auto-grant.service';
import { TenantRolesService } from './tenant-roles.service';
import { PermissionsService } from './permissions.service';

// Controllers
import { AppAccessController } from './app-access.controller';
import { AppAccessMatrixController } from './app-access-matrix.controller';
import { TenantRolesController } from './tenant-roles.controller';

// Guards
import { PermissionGuard } from './guards/permission.guard';
import { AppAccessGuard } from './guards/app-access.guard';
import { MembershipTenantGuard } from './guards/membership-tenant.guard';
import { TenantIdentifierGuard } from '../tenants/guards/tenant-identifier.guard';
import { TenantAccessGuard } from '../tenants/guards/tenant-access.guard';

/**
 * AuthorizationModule - Unified Authorization Module
 *
 * Consolidates functionality from:
 * - AppAccessModule (app access grants/revocations)
 * - AccessControlModule (tenant roles, app roles, permission checking)
 *
 * Provides:
 * - AppAccessService: Who can access which applications
 * - TenantRolesService: Tenant-level role management (owner, admin, member)
 * - PermissionsService: Centralized permission checking
 *
 * Guards:
 * - PermissionGuard: Route-level permission enforcement
 * - AppAccessGuard: Route-level app access enforcement
 */
@Module({
  imports: [
    PrismaModule,
    forwardRef(() => AuthModule),
    forwardRef(() => WebhooksModule),
  ],
  controllers: [
    AppAccessController,
    AppAccessMatrixController,
    TenantRolesController,
  ],
  providers: [
    AppAccessAutoGrantService,
    AppAccessService,
    TenantRolesService,
    PermissionsService,
    PermissionGuard,
    AppAccessGuard,
    MembershipTenantGuard,
    TenantIdentifierGuard,
    TenantAccessGuard,
  ],
  exports: [
    AppAccessAutoGrantService,
    AppAccessService,
    TenantRolesService,
    PermissionsService,
    PermissionGuard,
    AppAccessGuard,
    MembershipTenantGuard,
  ],
})
export class AuthorizationModule {}
