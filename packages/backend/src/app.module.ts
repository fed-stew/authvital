import { DynamicModule, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { TenantsModule } from './tenants/tenants.module';
import { LicensingModule } from './licensing/licensing.module';
import { AuthorizationModule } from './authorization/authorization.module';
import { ControlPlaneModule } from './control-plane/control-plane.module';
import { OAuthModule } from './oauth/oauth.module';
import { IntegrationModule } from './integration/integration.module';
import { InvitationsModule } from './invitations/invitations.module';
import { HealthModule } from './health/health.module';
import { FrontendModule } from './frontend/frontend.module';
import { InstanceModule } from './instance/instance.module';
import { SyncModule } from './sync';
import { SsoModule } from './sso/sso.module';
import { WebhooksModule } from './webhooks';
import { PubSubModule } from './pubsub';
import { AuditModule } from './audit/audit.module';
import { ServiceRole, resolveServiceRole } from './config/service-role';

/**
 * =============================================================================
 * SERVICE_ROLE MODULE CLASSIFICATION (single source of truth)
 * =============================================================================
 *
 * | Module              | Plane  | Notes                                       |
 * |---------------------|--------|---------------------------------------------|
 * | PrismaModule        | both   | DB access                                   |
 * | InstanceModule      | both   | config READ (write ctrl -> ControlPlane)    |
 * | HealthModule        | both   | /api/health on every service                |
 * | FrontendModule      | both   | static assets; /auth vs /admin UI routes    |
 * |                     |        | gated by plane middleware in main.ts        |
 * | AuditModule         | both   | WRITE path (@Global service); read/export   |
 * |                     |        | controller -> ControlPlane                  |
 * | PubSubModule        | both   | outbox enqueue needed wherever events emit; |
 * |                     |        | admin controller -> ControlPlane            |
 * | WebhooksModule      | both   | system-event dispatch service; CRUD         |
 * |                     |        | controller -> ControlPlane                  |
 * | AuthModule          | public | login/signup/password flows                 |
 * | OAuthModule         | public | OAuth/OIDC + JWKS                           |
 * | TenantsModule       | public | member-facing tenant APIs                   |
 * | LicensingModule     | public | entitlement checks (admin ctrl split out)   |
 * | AuthorizationModule | public | permission checks                           |
 * | IntegrationModule   | public | SDK M2M integration APIs                    |
 * | InvitationsModule   | public | invite accept flows                         |
 * | SyncModule          | public | polling API (one SuperAdminGuard'd endpoint |
 * |                     |        | stays here; see ControlPlaneModule note)    |
 * | SsoModule           | public | SSO login flows                             |
 * | ControlPlaneModule  | admin  | ALL admin controllers (super-admin, system  |
 * |                     |        | webhooks CRUD, pubsub admin, audit read,    |
 * |                     |        | instance write, license catalog admin)     |
 * | ScheduleModule      | admin  | see CRON PLACEMENT below                    |
 *
 * CRON PLACEMENT: @Cron decorators are inert unless ScheduleModule.forRoot()
 * is registered, so importing it only on 'admin' | 'all' guarantees each
 * background job (outbox publisher, key rotation, MFA cleanup, license
 * lifecycle, legacy sync retry) runs in exactly ONE deployment unit:
 * the low-traffic internal admin service. Public replicas never run crons.
 * Key SELF-HEAL on boot is unaffected (it is not a cron: KeyManagerService
 * onModuleInit runs everywhere, is idempotent, and advisory-locked).
 *
 * SPLIT-TOPOLOGY NOTE: pair a split deployment with
 * WEBHOOK_DELIVERY_MODE=broker (as the deployment templates do). Legacy
 * webhook retries would still work — SyncModule reaches the admin service
 * transitively via ControlPlane -> LicensingModule -> SyncModule, so its
 * cron runs there — but the broker owns delivery cleanly in split mode.
 *
 * ASYMMETRIC STRICTNESS (deliberate): the PUBLIC service must never register
 * an admin controller — enforced here and by tests. The ADMIN service may
 * transitively carry some public-plane controllers via SuperAdminModule's
 * service imports (harmless: it deploys behind internal ingress / IAP).
 * =============================================================================
 */
@Module({})
export class AppModule {
  static forRole(role: ServiceRole = resolveServiceRole()): DynamicModule {
    const servesPublic = role === 'public' || role === 'all';
    const servesAdmin = role === 'admin' || role === 'all';

    const imports: DynamicModule['imports'] = [
      ConfigModule.forRoot({
        isGlobal: true,
        envFilePath: '.env',
      }),
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
      // Crons only on the control plane (see CRON PLACEMENT above)
      ...(servesAdmin ? [ScheduleModule.forRoot()] : []),

      // ----- both planes -----
      FrontendModule,
      PrismaModule,
      InstanceModule,
      HealthModule,
      AuditModule,
      PubSubModule,
      WebhooksModule,

      // ----- public data plane -----
      ...(servesPublic
        ? [
            AuthModule,
            OAuthModule,
            TenantsModule,
            LicensingModule,
            AuthorizationModule,
            IntegrationModule,
            InvitationsModule,
            SyncModule,
            SsoModule,
          ]
        : []),

      // ----- admin control plane -----
      ...(servesAdmin ? [ControlPlaneModule] : []),
    ];

    return {
      module: AppModule,
      imports,
      providers: [
        // Enforce rate limits on every route by default
        { provide: APP_GUARD, useClass: ThrottlerGuard },
      ],
    };
  }
}
