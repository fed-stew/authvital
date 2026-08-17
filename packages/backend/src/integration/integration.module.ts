import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import {
  IntegrationPermissionsController,
  IntegrationLicensingController,
  IntegrationTenantsController,
} from './controllers';
import { AuthModule } from '../auth/auth.module';
import { OAuthModule } from '../oauth/oauth.module';
import { InvitationsModule } from '../invitations/invitations.module';
import { InstanceModule } from '../instance/instance.module';
import { PrismaModule } from '../prisma/prisma.module';
import { MfaModule } from '../auth/mfa';

import {
  IntegrationPermissionsService,
  IntegrationEntitlementsService,
  IntegrationLicensingService,
  IntegrationTenantsService,
  IntegrationRolesService,
  IntegrationInvitationsService,
} from './services';
import {
  M2mTenantAuthService,
  M2mScopeGuard,
  M2mTenantGuard,
} from './m2m-authz';

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    AuthModule,
    OAuthModule,
    InvitationsModule,
    InstanceModule,
    MfaModule,
  ],
  controllers: [
    IntegrationPermissionsController,
    IntegrationLicensingController,
    IntegrationTenantsController,
  ],
  providers: [
    IntegrationPermissionsService,
    IntegrationEntitlementsService,
    IntegrationLicensingService,
    IntegrationTenantsService,
    IntegrationRolesService,
    IntegrationInvitationsService,
    M2mTenantAuthService,
    M2mScopeGuard,
    M2mTenantGuard,
  ],
  exports: [
    IntegrationPermissionsService,
    IntegrationEntitlementsService,
    IntegrationLicensingService,
    IntegrationTenantsService,
    IntegrationRolesService,
    IntegrationInvitationsService,
    M2mTenantAuthService,
  ],
})
export class IntegrationModule {}
