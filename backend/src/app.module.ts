import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { TenantsModule } from './tenants/tenants.module';
import { LicensingModule } from './licensing/licensing.module';
import { AuthorizationModule } from './authorization/authorization.module';
import { SuperAdminModule } from './super-admin/super-admin.module';
import { OAuthModule } from './oauth/oauth.module';
import { IntegrationModule } from './integration/integration.module';
import { InvitationsModule } from './invitations/invitations.module';
import { HealthModule } from './health/health.module';
import { FrontendModule } from './frontend/frontend.module';
import { InstanceModule } from './instance/instance.module';
// TenantManagementModule - DEPRECATED: consolidated into TenantsModule
import { SyncModule } from './sync';
import { SsoModule } from './sso/sso.module';
import { WebhooksModule } from './webhooks';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ScheduleModule.forRoot(),
    // Frontend module serves UI at explicit routes:
    // - /auth/* (OAuth login pages for users)
    // - /admin/* (Admin dashboard)
    FrontendModule,
    PrismaModule,
    InstanceModule, // Singleton instance configuration
    AuthModule,
    OAuthModule,
    TenantsModule, // Replaces TenancyModule + TenantManagementModule
    LicensingModule,
    AuthorizationModule, // Replaces AccessControlModule + AppAccessModule
    SuperAdminModule,
    IntegrationModule,
    InvitationsModule,
    SyncModule,
    HealthModule,
    SsoModule, // SSO provider configuration and tenant SSO config
    WebhooksModule, // System-level webhooks for orchestration
  ],
})
export class AppModule {}
