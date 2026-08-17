import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LicensePoolService } from './license-pool.service';

/**
 * Result of a single lifecycle sweep. Returned so the job entrypoint (or a
 * manual admin trigger) can log/alert on what happened.
 */
export interface LifecycleSweepResult {
  startedAt: Date;
  finishedAt: Date;
  expiredSubscriptionIds: string[];
  reconciled: { subscriptionId: string; from: number; to: number }[];
  subscriptionsChecked: number;
  snapshotsWritten: number;
}

/**
 * LicenseLifecycleService — the "housekeeping" logic for subscriptions. ⏰
 *
 * DELIBERATELY has NO scheduling decorators (@Cron/@Interval). It is pure,
 * idempotent business logic. Triggering is the caller's job — see
 * `src/jobs/license-lifecycle.job.ts`, which is meant to run as a standalone
 * process invoked by an external scheduler (Cloud Scheduler → Cloud Run Job /
 * k8s CronJob), NOT baked into the API request path.
 *
 * Why separate? An in-process @Cron fires once per API replica, so scaling the
 * web tier silently multiplies (or races) the job. Keeping it external means:
 * one run per tick, independent scaling, and a clean idempotent command you can
 * also invoke by hand during incidents.
 */
@Injectable()
export class LicenseLifecycleService {
  private readonly logger = new Logger(LicenseLifecycleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly licensePoolService: LicensePoolService,
  ) {}

  /**
   * Run the full sweep: expire overdue subscriptions, then reconcile the
   * cached `quantityAssigned` counters against reality. Idempotent — safe to
   * run as often as you like.
   */
  async runSweep(now: Date = new Date()): Promise<LifecycleSweepResult> {
    const startedAt = new Date();
    this.logger.log(`License lifecycle sweep starting (asOf=${now.toISOString()})`);

    const expiredSubscriptionIds = await this.expireOverdueSubscriptions(now);
    const reconcile = await this.reconcileAssignedCounts();
    // Capture the daily usage snapshot AFTER reconciliation so the numbers we
    // record are the corrected, authoritative seat counts.
    const snapshotsWritten = await this.captureUsageSnapshots(now);

    const finishedAt = new Date();
    this.logger.log(
      `Lifecycle sweep done: expired=${expiredSubscriptionIds.length}, ` +
        `reconciled=${reconcile.corrected.length}/${reconcile.checked}, ` +
        `snapshots=${snapshotsWritten} in ` +
        `${finishedAt.getTime() - startedAt.getTime()}ms`,
    );

    return {
      startedAt,
      finishedAt,
      expiredSubscriptionIds,
      reconciled: reconcile.corrected,
      subscriptionsChecked: reconcile.checked,
      snapshotsWritten,
    };
  }

  /**
   * Write one usage snapshot per live subscription for the current UTC day.
   *
   * Idempotent: keyed on (tenantId, applicationId, licenseTypeId, date) and
   * upserted, so running the sweep multiple times a day just refreshes the
   * day's datapoint rather than duplicating it. This is what powers the
   * `usage-trends` endpoint; history accrues one row per key per day.
   *
   * Only "live" inventory (ACTIVE/TRIALING/PAST_DUE) is snapshotted — expired
   * and canceled subscriptions no longer represent seats in play.
   */
  async captureUsageSnapshots(now: Date = new Date()): Promise<number> {
    // Normalise to UTC midnight so all of a day's runs collapse to one row.
    const date = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );

    const subscriptions = await this.prisma.appSubscription.findMany({
      where: { status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] } },
      include: {
        application: { select: { name: true } },
        licenseType: { select: { name: true } },
      },
    });

    let written = 0;
    for (const sub of subscriptions) {
      try {
        await this.prisma.tenantLicenseUsageSnapshot.upsert({
          where: {
            tenantId_applicationId_licenseTypeId_date: {
              tenantId: sub.tenantId,
              applicationId: sub.applicationId,
              licenseTypeId: sub.licenseTypeId,
              date,
            },
          },
          create: {
            tenantId: sub.tenantId,
            applicationId: sub.applicationId,
            licenseTypeId: sub.licenseTypeId,
            applicationName: sub.application.name,
            licenseTypeName: sub.licenseType.name,
            totalSeats: sub.quantityPurchased,
            seatsAssigned: sub.quantityAssigned,
            date,
          },
          update: {
            applicationName: sub.application.name,
            licenseTypeName: sub.licenseType.name,
            totalSeats: sub.quantityPurchased,
            seatsAssigned: sub.quantityAssigned,
          },
        });
        written++;
      } catch (err) {
        this.logger.error(
          `Failed to snapshot subscription ${sub.id}: ${(err as Error).message}`,
        );
      }
    }

    return written;
  }

  /**
   * Transition subscriptions whose paid period has ended into EXPIRED,
   * revoking the entitlements they were funding.
   *
   * NOTE: renewal (Stripe / control-plane) is expected to push
   * `currentPeriodEnd` forward BEFORE this job runs; anything still past-due at
   * sweep time is genuinely lapsed. `autoRenew` is intentionally NOT consulted
   * here — a true auto-renew extends the period upstream; it does not grant
   * indefinite free access.
   */
  async expireOverdueSubscriptions(now: Date = new Date()): Promise<string[]> {
    const overdue = await this.prisma.appSubscription.findMany({
      where: {
        status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] },
        currentPeriodEnd: { lte: now },
      },
      select: { id: true },
    });

    const expiredIds: string[] = [];
    for (const sub of overdue) {
      try {
        // Reuse the audited, transactional expiry (also revokes AppAccess).
        await this.licensePoolService.expireSubscription(sub.id);
        expiredIds.push(sub.id);
      } catch (err) {
        // One bad subscription shouldn't sink the whole sweep.
        this.logger.error(
          `Failed to expire subscription ${sub.id}: ${(err as Error).message}`,
        );
      }
    }

    return expiredIds;
  }

  /**
   * Recompute the cached `quantityAssigned` on every subscription from the
   * actual LicenseAssignment rows, fixing any drift. Drift can accumulate from
   * non-atomic cross-aggregate failures, so this is the safety net.
   */
  async reconcileAssignedCounts(): Promise<{
    checked: number;
    corrected: { subscriptionId: string; from: number; to: number }[];
  }> {
    const subscriptions = await this.prisma.appSubscription.findMany({
      select: { id: true, quantityAssigned: true },
    });

    const grouped = await this.prisma.licenseAssignment.groupBy({
      by: ['subscriptionId'],
      _count: { _all: true },
    });
    const actualCounts = new Map(
      grouped.map((g) => [g.subscriptionId, g._count._all]),
    );

    const corrected: { subscriptionId: string; from: number; to: number }[] = [];
    for (const sub of subscriptions) {
      const actual = actualCounts.get(sub.id) ?? 0;
      if (actual !== sub.quantityAssigned) {
        await this.prisma.appSubscription.update({
          where: { id: sub.id },
          data: { quantityAssigned: actual },
        });
        corrected.push({ subscriptionId: sub.id, from: sub.quantityAssigned, to: actual });
        this.logger.warn(
          `Reconciled subscription ${sub.id}: quantityAssigned ${sub.quantityAssigned} → ${actual}`,
        );
      }
    }

    return { checked: subscriptions.length, corrected };
  }
}
