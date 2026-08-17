import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

interface UsagePoint {
  date: string; // YYYY-MM-DD (UTC)
  totalSeats: number;
  seatsAssigned: number;
}

export interface UsageTrendsResult {
  tenantId: string;
  days: number;
  /** Totals aggregated across all apps/license types, one point per day. */
  series: UsagePoint[];
  /** Per-application breakdown for stacked/grouped charts. */
  byApplication: Array<{
    applicationId: string;
    applicationName: string;
    series: UsagePoint[];
  }>;
}

/**
 * LicenseUsageService - reads the daily usage snapshots written by the license
 * lifecycle sweep (see LicenseLifecycleService.captureUsageSnapshots) and
 * shapes them into a time series ready for a chart.
 *
 * Read-only + tenant-scoped: the caller always supplies tenantId from the
 * authenticated context.
 */
@Injectable()
export class LicenseUsageService {
  constructor(private readonly prisma: PrismaService) {}

  async getUsageTrends(tenantId: string, days: number): Promise<UsageTrendsResult> {
    const now = new Date();
    const since = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    since.setUTCDate(since.getUTCDate() - (days - 1));

    const snapshots = await this.prisma.tenantLicenseUsageSnapshot.findMany({
      where: { tenantId, date: { gte: since } },
      orderBy: { date: 'asc' },
    });

    // Aggregate across all apps/types per day.
    const dayTotals = new Map<string, { totalSeats: number; seatsAssigned: number }>();
    // Per-application, per-day accumulation.
    const perApp = new Map<
      string,
      { applicationName: string; days: Map<string, { totalSeats: number; seatsAssigned: number }> }
    >();

    for (const snap of snapshots) {
      const key = snap.date.toISOString().slice(0, 10);

      const dayTotal = dayTotals.get(key) ?? { totalSeats: 0, seatsAssigned: 0 };
      dayTotal.totalSeats += snap.totalSeats;
      dayTotal.seatsAssigned += snap.seatsAssigned;
      dayTotals.set(key, dayTotal);

      const app =
        perApp.get(snap.applicationId) ??
        { applicationName: snap.applicationName, days: new Map() };
      const appDay = app.days.get(key) ?? { totalSeats: 0, seatsAssigned: 0 };
      appDay.totalSeats += snap.totalSeats;
      appDay.seatsAssigned += snap.seatsAssigned;
      app.days.set(key, appDay);
      perApp.set(snap.applicationId, app);
    }

    const toSeries = (m: Map<string, { totalSeats: number; seatsAssigned: number }>): UsagePoint[] =>
      [...m.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, v]) => ({ date, totalSeats: v.totalSeats, seatsAssigned: v.seatsAssigned }));

    return {
      tenantId,
      days,
      series: toSeries(dayTotals),
      byApplication: [...perApp.entries()].map(([applicationId, app]) => ({
        applicationId,
        applicationName: app.applicationName,
        series: toSeries(app.days),
      })),
    };
  }
}
