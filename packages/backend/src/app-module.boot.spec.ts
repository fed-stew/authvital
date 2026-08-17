/**
 * AppModule boot smoke test.
 *
 * Guards against undefined module imports caused by CJS require cycles —
 * the SsoModule/AuthModule incident: SsoModule held a raw AuthModule
 * reference inside the AuthModule ↔ SuperAdminModule require cycle, so the
 * binding was `undefined` at load time and production boot crashed with
 * "The module at index [2] of the SsoModule imports array is undefined."
 *
 * Neither tsc nor per-module unit tests can catch this class of bug; only
 * running Nest's dependency scanner over the full AppModule graph does.
 * compile() runs that scanner without initializing the app, so no DB or
 * network connections are made.
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

import { Test } from '@nestjs/testing';

describe('AppModule boot', () => {
  it('compiles the full module graph without throwing', async () => {
    // Fake timers for the whole test: auth/redirect-tokens.ts starts a
    // module-level setInterval, and SsoAuthService starts one in its
    // constructor during compile(); real timers would keep Jest from exiting.
    // nextTick/setImmediate/queueMicrotask stay real so async plumbing works.
    jest.useFakeTimers({
      doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'],
    });
    try {
      // Deferred dynamic import: AppModule must load AFTER env setup so
      // config validation sees the test values. import() is evaluated
      // lazily at runtime (never hoisted like a static import).
      const { AppModule } = await import('./app.module');

      const moduleRef = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();

      expect(moduleRef).toBeDefined();
      // Intentionally NOT calling app.init() — that would open DB connections.
    } finally {
      jest.useRealTimers();
    }
  });
});
