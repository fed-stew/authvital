/**
 * SERVICE_ROLE composition tests.
 *
 * Compiles the AppModule graph per role (same technique as
 * app-module.boot.spec.ts — Nest's dependency scanner runs, no app.init(),
 * no DB/network) and asserts the security-critical invariants:
 *
 *  - PUBLIC service: NO admin controllers, NO scheduler (crons).
 *  - ADMIN service: admin controllers + scheduler present.
 *  - ALL: everything (back-compat with the pre-split single container).
 */

// Env vars MUST be set before AppModule (and its config validation) loads.
process.env.MASTER_SECRET =
  process.env.MASTER_SECRET ??
  // Test-only value; not a real secret.
  '2a847f5fcf7f94946d3140411f353497e8c94db0aba228697801fa437aab79c5';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://test:test@localhost:5432/test';
process.env.BASE_URL = process.env.BASE_URL ?? 'http://localhost:8000';
process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.PORT = process.env.PORT ?? '8000';

import { Test, TestingModule } from '@nestjs/testing';
import { SchedulerRegistry } from '@nestjs/schedule';

async function compileForRole(role: 'public' | 'admin' | 'all'): Promise<TestingModule> {
  const { AppModule } = await import('./app.module');
  return Test.createTestingModule({
    imports: [AppModule.forRole(role)],
  }).compile();
}

/** get() throws for tokens absent from the compiled graph. */
function has(moduleRef: TestingModule, token: any): boolean {
  try {
    moduleRef.get(token, { strict: false });
    return true;
  } catch {
    return false;
  }
}

describe('AppModule.forRole composition', () => {
  beforeAll(() => {
    // Module-level setIntervals (redirect-tokens, SsoAuthService) would keep
    // Jest alive — same treatment as app-module.boot.spec.ts.
    jest.useFakeTimers({
      doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'],
    });
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  describe("role 'public' (data plane)", () => {
    let moduleRef: TestingModule;

    beforeAll(async () => {
      moduleRef = await compileForRole('public');
    });

    it('must NOT register any admin controller', async () => {
      const { SuperAdminAuthController, SuperAdminTenantsController } =
        await import('./super-admin/controllers');
      const { SystemWebhookController } = await import(
        './webhooks/system-webhook.controller'
      );
      const { PubSubAdminController } = await import(
        './pubsub/pubsub-admin.controller'
      );
      const { AuditController } = await import('./audit/audit.controller');
      const { InstanceController } = await import(
        './instance/instance.controller'
      );
      const { LicenseAdminController } = await import(
        './licensing/controllers/license-admin.controller'
      );

      expect(has(moduleRef, SuperAdminAuthController)).toBe(false);
      expect(has(moduleRef, SuperAdminTenantsController)).toBe(false);
      expect(has(moduleRef, SystemWebhookController)).toBe(false);
      expect(has(moduleRef, PubSubAdminController)).toBe(false);
      expect(has(moduleRef, AuditController)).toBe(false);
      expect(has(moduleRef, InstanceController)).toBe(false);
      expect(has(moduleRef, LicenseAdminController)).toBe(false);
    });

    it('must register the public data-plane controllers', async () => {
      const { OAuthController } = await import('./oauth/oauth.controller');
      const { AuthController } = await import('./auth/auth.controller');
      const { LicenseCheckController } = await import(
        './licensing/controllers/license-check.controller'
      );

      expect(has(moduleRef, OAuthController)).toBe(true);
      expect(has(moduleRef, AuthController)).toBe(true);
      expect(has(moduleRef, LicenseCheckController)).toBe(true);
    });

    it('must NOT register the scheduler (no crons on public replicas)', () => {
      expect(has(moduleRef, SchedulerRegistry)).toBe(false);
    });

    it('must keep event-emission services available (outbox, system webhooks, audit write)', async () => {
      const { PubSubOutboxService } = await import(
        './pubsub/pubsub-outbox.service'
      );
      const { SystemWebhookService } = await import(
        './webhooks/system-webhook.service'
      );
      const { AuditService } = await import('./audit/audit.service');

      expect(has(moduleRef, PubSubOutboxService)).toBe(true);
      expect(has(moduleRef, SystemWebhookService)).toBe(true);
      expect(has(moduleRef, AuditService)).toBe(true);
    });
  });

  describe("role 'admin' (control plane)", () => {
    let moduleRef: TestingModule;

    beforeAll(async () => {
      moduleRef = await compileForRole('admin');
    });

    it('must register the admin controllers', async () => {
      const { SuperAdminAuthController } = await import(
        './super-admin/controllers'
      );
      const { SystemWebhookController } = await import(
        './webhooks/system-webhook.controller'
      );
      const { PubSubAdminController } = await import(
        './pubsub/pubsub-admin.controller'
      );
      const { AuditController } = await import('./audit/audit.controller');
      const { InstanceController } = await import(
        './instance/instance.controller'
      );

      expect(has(moduleRef, SuperAdminAuthController)).toBe(true);
      expect(has(moduleRef, SystemWebhookController)).toBe(true);
      expect(has(moduleRef, PubSubAdminController)).toBe(true);
      expect(has(moduleRef, AuditController)).toBe(true);
      expect(has(moduleRef, InstanceController)).toBe(true);
    });

    it('must register the scheduler (crons run here in split deployments)', () => {
      expect(has(moduleRef, SchedulerRegistry)).toBe(true);
    });
  });

  describe("role 'all' (default — pre-split back-compat)", () => {
    let moduleRef: TestingModule;

    beforeAll(async () => {
      moduleRef = await compileForRole('all');
    });

    it('must register public AND admin controllers AND the scheduler', async () => {
      const { OAuthController } = await import('./oauth/oauth.controller');
      const { SuperAdminAuthController } = await import(
        './super-admin/controllers'
      );
      const { SystemWebhookController } = await import(
        './webhooks/system-webhook.controller'
      );

      expect(has(moduleRef, OAuthController)).toBe(true);
      expect(has(moduleRef, SuperAdminAuthController)).toBe(true);
      expect(has(moduleRef, SystemWebhookController)).toBe(true);
      expect(has(moduleRef, SchedulerRegistry)).toBe(true);
    });
  });
});
