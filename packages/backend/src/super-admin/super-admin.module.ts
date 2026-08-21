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
import { AdminTenantMembersService } from './services/admin-tenant-members.service';
import { AdminApplicationClientsService } from './services/admin-application-clients.service';

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
    forwardRef(() => WebhooksModule),
    forwardRef(() => LicensingModule),
  ],
  // NO controllers here — the HTTP surface registers exclusively via
  // ControlPlaneModule (SERVICE_ROLE admin|all). This module only provides
  // services/guards so data-plane modules can import it without exposing
  // any admin routes on a public service.
  providers: [
    AdminAuthService,
    AdminUsersService,
    AdminTenantMembersService,
    AdminServiceAccountsService,
    AdminTenantsService,
    AdminRolesService,
    AdminApplicationsService,
    AdminApplicationClientsService,
    AdminLicensingService,
    AdminInstanceService,
    AdminSsoService,
    SuperAdminGuard,
  ],
  exports: [
    AdminAuthService,
    AdminUsersService,
    AdminTenantsService,
    AdminTenantMembersService,
    AdminServiceAccountsService,
    AdminApplicationsService,
    AdminApplicationClientsService,
    AdminRolesService,
    AdminLicensingService,
    AdminInstanceService,
    AdminSsoService,
    SuperAdminGuard,
  ],
})
export class SuperAdminModule {}
