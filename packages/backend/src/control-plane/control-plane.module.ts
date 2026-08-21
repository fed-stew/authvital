import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MfaModule } from '../auth/mfa';
import { AuthorizationModule } from '../authorization';
import { SsoModule } from '../sso/sso.module';
import { TenantsModule } from '../tenants';
import { AuditController } from '../audit/audit.controller';
import { PermissionGuard } from '../authorization/guards/permission.guard';
import { InstanceController } from '../instance/instance.controller';
import { InstanceModule } from '../instance/instance.module';
import { LicenseAdminController } from '../licensing/controllers/license-admin.controller';
import { LicensingModule } from '../licensing/licensing.module';
import { KeyModule } from '../oauth/key.module';
import { PubSubAdminController } from '../pubsub/pubsub-admin.controller';
import { PubSubModule } from '../pubsub';
import {
  SuperAdminAuthController,
  SuperAdminUsersController,
  SuperAdminTenantsController,
  SuperAdminAppsController,
  SuperAdminSsoController,
} from '../super-admin/controllers';
import { SuperAdminModule } from '../super-admin/super-admin.module';
import { TenantAccessGuard } from '../tenants/guards/tenant-access.guard';
import { TenantIdentifierGuard } from '../tenants/guards/tenant-identifier.guard';
import { SystemWebhookController } from '../webhooks/system-webhook.controller';
import { WebhooksModule } from '../webhooks';

/**
 * ControlPlaneModule — the ONLY place admin/control-plane CONTROLLERS are
 * registered (SERVICE_ROLE 'admin' | 'all').
 *
 * Providers/services stay in their home modules (which are imported wherever
 * the data plane needs them); ONLY the HTTP surface is aggregated here so
 * the public service physically cannot route admin requests. This is the
 * "split controller registration from provider registration" pattern —
 * no service is duplicated.
 *
 * Controllers gathered here (previously scattered across mixed modules):
 *  - SuperAdmin* controllers  (from SuperAdminModule)
 *  - InstanceController       (from InstanceModule — instance config write)
 *  - LicenseAdminController   (from LicensingModule — catalog admin)
 *  - SystemWebhookController  (from WebhooksModule — webhook CRUD)
 *  - PubSubAdminController    (from PubSubModule — outbox/pubsub admin)
 *  - AuditController          (from AuditModule — audit read/export API)
 *
 * NOTE: sync.controller.ts remains on the public plane because it mixes
 * member-facing polling endpoints with one SuperAdminGuard'd endpoint in a
 * single class; the guard still enforces super-admin auth there (and no
 * admin session can be minted on the public host).
 */
@Module({
  imports: [
    KeyModule,
    forwardRef(() => AuthModule), // JwtAuthGuard dependencies (AuditController)
    SuperAdminModule, // AdminAuthService/KeyService for SuperAdminGuard
    InstanceModule,
    LicensingModule,
    WebhooksModule,
    PubSubModule,
    // Controllers resolve constructor deps from THIS module's context, so
    // mirror the service imports their previous host modules provided:
    forwardRef(() => TenantsModule), // DomainsService, TenantRolesService...
    AuthorizationModule,
    SsoModule,
    MfaModule,
  ],
  controllers: [
    SuperAdminAuthController,
    SuperAdminUsersController,
    SuperAdminTenantsController,
    SuperAdminAppsController,
    SuperAdminSsoController,
    InstanceController,
    LicenseAdminController,
    SystemWebhookController,
    PubSubAdminController,
    AuditController,
  ],
  providers: [
    // Guard chain for AuditController (moved with the controller from
    // AuditModule; PrismaService/Reflector are globally available)
    PermissionGuard,
    TenantAccessGuard,
    TenantIdentifierGuard,
  ],
})
export class ControlPlaneModule {}
