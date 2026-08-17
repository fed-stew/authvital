/**
 * license-lifecycle.job — standalone entrypoint for subscription housekeeping.
 *
 * Run as a one-shot process, NOT inside the API. Intended to be invoked by an
 * external scheduler:
 *
 *   node dist/jobs/license-lifecycle.job          # (after `nest build`)
 *   npm run job:license-lifecycle                 # convenience wrapper
 *
 * In prod this is a Cloud Run Job / k8s CronJob triggered by Cloud Scheduler
 * (e.g. every 15 min). It is idempotent: expires overdue subscriptions and
 * reconciles cached seat counters, then exits 0 (success) or 1 (failure) so the
 * scheduler can alert/retry.
 */
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { JobsModule } from './jobs.module';
import { LicenseLifecycleService } from '../licensing/services/license-lifecycle.service';

async function main() {
  const logger = new Logger('LicenseLifecycleJob');

  // Application *context* only — no HTTP server, no cron wiring.
  const app = await NestFactory.createApplicationContext(JobsModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const lifecycle = app.get(LicenseLifecycleService);
    const result = await lifecycle.runSweep();

    logger.log(
      `Sweep complete: expired=${result.expiredSubscriptionIds.length}, ` +
        `reconciled=${result.reconciled.length}, checked=${result.subscriptionsChecked}`,
    );
    if (result.expiredSubscriptionIds.length > 0) {
      logger.log(`Expired: ${result.expiredSubscriptionIds.join(', ')}`);
    }
    if (result.reconciled.length > 0) {
      logger.warn(`Reconciled drift: ${JSON.stringify(result.reconciled)}`);
    }

    await app.close();
    process.exit(0);
  } catch (err) {
    logger.error(`License lifecycle sweep failed: ${(err as Error).message}`, (err as Error).stack);
    await app.close();
    process.exit(1);
  }
}

void main();
