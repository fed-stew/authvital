import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { InstanceModule } from '../instance/instance.module';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization';
import { TenantsModule } from '../tenants';
import { KeyModule } from '../oauth/key.module';
import { MfaModule } from '../auth/mfa';
import { SsoModule } from '../sso/sso.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { LicensingModule } from '../licensing/licensing.module';

import { SuperAdminController } from './super-admin.controller';
import { SuperAdminGuard } from './guards/super-admin.guard';

import {
  AdminAuthService,
  AdminUsersService,
  AdminTenantsService,
  AdminServiceAccountsService,
  AdminApplicationsService,
  AdminRolesService,
  AdminLicensingService,
  AdminInstanceService,
  AdminSsoService,
} from './services';

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    KeyModule,
    forwardRef(() => InstanceModule),
    forwardRef(() => AuthModule),
    AuthorizationModule,
    forwardRef(() => TenantsModule),
    MfaModule,
    SsoModule,
    forwardRef(() => WebhooksModule), // For SystemWebhookService (tenant events)
    forwardRef(() => LicensingModule), // For LicensePoolService (auto-provisioning)
  ],
  controllers: [SuperAdminController],
  providers: [
    AdminAuthService,
    AdminUsersService,
    AdminServiceAccountsService, // Must be before AdminTenantsService (dependency)
    AdminTenantsService,
    AdminRolesService, // Must be before AdminApplicationsService (dependency)
    AdminApplicationsService,
    AdminLicensingService,
    AdminInstanceService,
    AdminSsoService,
    SuperAdminGuard,
  ],
  exports: [
    AdminAuthService,
    AdminUsersService,
    AdminTenantsService,
    AdminServiceAccountsService,
    AdminApplicationsService,
    AdminRolesService,
    AdminLicensingService,
    AdminInstanceService,
    AdminSsoService,
    SuperAdminGuard,
  ],
})
export class SuperAdminModule {}
