import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { SuperAdminModule } from '../super-admin/super-admin.module';
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

// Controllers
import { LicenseAdminController } from './controllers/license-admin.controller';
import { LicenseCheckController } from './controllers/license-check.controller';

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
    forwardRef(() => SuperAdminModule), // For SuperAdminGuard (circular dependency)
    AuthorizationModule, // For AppAccessService (license grants create AppAccess)
    SyncModule, // For emitting webhook events
    forwardRef(() => WebhooksModule), // For SystemWebhookService (subscription events)
  ],
  controllers: [
    LicenseAdminController,
    LicenseCheckController,
  ],
  providers: [
    LicenseTypeService,
    LicenseCapacityService,
    LicensePoolService,
    LicenseAssignmentService,
    LicenseAssignmentBulkService,
    LicenseCheckService,
    LicenseProvisioningService,
  ],
  exports: [
    LicenseTypeService,
    LicenseCapacityService,
    LicensePoolService,
    LicenseAssignmentService,
    LicenseAssignmentBulkService,
    LicenseCheckService,
    LicenseProvisioningService,
  ],
})
export class LicensingModule {}
