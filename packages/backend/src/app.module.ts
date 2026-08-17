import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
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
import { PubSubModule } from './pubsub';
import { AuditModule } from './audit/audit.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ScheduleModule.forRoot(),
    // Global rate limiting (moderate default; sensitive endpoints override
    // with stricter @Throttle limits, health checks opt out via @SkipThrottle).
    //
    // NOTE: the default in-memory ThrottlerStorage tracks counters PER
    // INSTANCE. In multi-instance deployments (e.g. Cloud Run autoscaling)
    // the effective global limit is limit × instances. Plug in a shared
    // ThrottlerStorage (e.g. Redis via @nest-lab/throttler-storage-redis)
    // to enforce true global limits.
    ThrottlerModule.forRoot([
      {
        ttl: 60_000, // 60s window
        limit: 100, // 100 requests / window / IP
      },
    ]),
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
    PubSubModule, // GCP Pub/Sub outbox event publishing
    AuditModule, // Tenant audit trail (global AuditService + read/export API)
  ],
  providers: [
    // Enforce rate limits on every route by default
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
