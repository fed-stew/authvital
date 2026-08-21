import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization';
import { SyncModule } from '../sync/sync.module';
import { WebhooksModule } from '../webhooks/webhooks.module';

// Services
import { LicenseTypeService } from './services/license-type.service';
import { LicenseCapacityService } from './services/license-capacity.service';
import { LicensePoolService } from './services/license-pool.service';
import { LicenseAssignmentService } from './services/license-assignment.service';
import { LicenseAssignmentBulkService } from './services/license-assignment-bulk.service';
import { LicenseCheckService } from './services/license-check.service';
import { LicenseProvisioningService } from './services/license-provisioning.service';
import { LicenseLifecycleService } from './services/license-lifecycle.service';
import { LicenseUsageService } from './services/license-usage.service';

// Controllers
import { LicenseCheckController } from './controllers/license-check.controller';
import { TenantLicensesController } from './controllers/tenant-licenses.controller';

// Guards
import { TenantAccessGuard } from '../tenants/guards/tenant-access.guard';
import { TenantIdentifierGuard } from '../tenants/guards/tenant-identifier.guard';

/**
 * LicensingModule - License Pool System 🎫
 * 
 * Core Philosophy: Tenant = Wallet, User = License Holder
 * 
 * Components:
 * - LicenseTypeService: Manage the catalog of license types
 * - LicensePoolService: Manage tenant inventory (subscriptions)
 * - LicenseAssignmentService: Grant/revoke licenses to users
 * - LicenseCheckService: SDK endpoint for checking access
 */
@Module({
  imports: [
    PrismaModule,
    forwardRef(() => AuthModule), // ForJwtAuthGuard (circular dependency)
    AuthorizationModule, // For AppAccessService (license grants create AppAccess)
    SyncModule, // For emitting webhook events
    forwardRef(() => WebhooksModule), // For SystemWebhookService (subscription events)
  ],
  // LicenseAdminController (SuperAdminGuard'd catalog admin) registers via
  // ControlPlaneModule only; the tenant/member-facing controllers stay here.
  controllers: [
    LicenseCheckController,
    TenantLicensesController,
  ],
  providers: [
    LicenseTypeService,
    LicenseCapacityService,
    LicensePoolService,
    LicenseAssignmentService,
    LicenseAssignmentBulkService,
    LicenseCheckService,
    LicenseProvisioningService,
    LicenseLifecycleService,
    LicenseUsageService,
    // Provided locally so TenantLicensesController can use it without importing
    // the whole TenantsModule (the guard only needs PrismaService).
    TenantAccessGuard,
    TenantIdentifierGuard,
  ],
  exports: [
    LicenseTypeService,
    LicenseCapacityService,
    LicensePoolService,
    LicenseAssignmentService,
    LicenseAssignmentBulkService,
    LicenseCheckService,
    LicenseProvisioningService,
    LicenseLifecycleService,
    LicenseUsageService,
  ],
})
export class LicensingModule {}
