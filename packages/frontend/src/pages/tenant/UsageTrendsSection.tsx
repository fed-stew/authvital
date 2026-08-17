import * as React from 'react';
import { TrendingUp, Loader2 } from 'lucide-react';
import { tenantApi } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Sparkline, type SparklineSeries } from '@/components/ui/Sparkline';
import { Badge } from '@/components/ui/Badge';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/Select';
import { useToast } from '@/components/ui/Toast';
import type { UsageTrendsResult } from '@/types';

const APP_COLORS = [
  'rgb(147, 51, 234)', // primary purple
  'rgb(59, 130, 246)', // blue
  'rgb(34, 197, 94)', // green
  'rgb(234, 179, 8)', // yellow
  'rgb(236, 72, 153)', // pink
  'rgb(14, 165, 233)', // sky
];

const errMessage = (err: any, fallback: string) =>
  err?.response?.data?.message || err?.message || fallback;

/**
 * UsageTrendsSection - seats-assigned-vs-total time series from the daily usage
 * snapshots (GET /licenses/usage-trends). Rendered on the Billing page.
 *
 * Gated by the caller (billing:view). Shows a friendly empty state until the
 * first snapshot lands, since Phase 4a did NOT backfill history.
 */
export function UsageTrendsSection({ tenantId }: { tenantId: string }) {
  const { toast } = useToast();
  const [days, setDays] = React.useState(30);
  const [data, setData] = React.useState<UsageTrendsResult | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    try {
      setIsLoading(true);
      const result = await tenantApi.getUsageTrends(tenantId, days);
      setData(result);
    } catch (err: any) {
      toast({ variant: 'error', title: 'Error', message: errMessage(err, 'Failed to load usage trends') });
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, days, toast]);

  React.useEffect(() => {
    load();
  }, [load]);

  const hasData = !!data && data.series.length > 0;

  const aggregatedSeries: SparklineSeries[] = data
    ? [
        { values: data.series.map((p) => p.totalSeats), color: 'rgb(148, 163, 184)', area: false, label: 'Seats owned' },
        { values: data.series.map((p) => p.seatsAssigned), color: 'rgb(147, 51, 234)', area: true, label: 'Seats assigned' },
      ]
    : [];

  const latest = hasData ? data!.series[data!.series.length - 1] : null;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 border-b border-white/10">
        <div>
          <CardTitle className="text-lg">Seat usage trends</CardTitle>
          <CardDescription>Assigned vs. owned seats over time.</CardDescription>
        </div>
        <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="p-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : !hasData ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <TrendingUp className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="font-medium text-foreground">No usage history yet</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Trends will populate after the next daily usage snapshot. Historical data isn't
                backfilled, so give it a day to start charting.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Aggregated */}
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-4">
                <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="h-2 w-4 rounded-full" style={{ backgroundColor: 'rgb(147, 51, 234)' }} />
                  Assigned {latest ? `(${latest.seatsAssigned})` : ''}
                </span>
                <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="h-2 w-4 rounded-full" style={{ backgroundColor: 'rgb(148, 163, 184)' }} />
                  Owned {latest ? `(${latest.totalSeats})` : ''}
                </span>
              </div>
              <Sparkline series={aggregatedSeries} height={180} />
            </div>

            {/* Per-application breakdown */}
            {data!.byApplication.length > 0 && (
              <div className="space-y-4 border-t border-white/10 pt-4">
                <p className="text-sm font-medium text-foreground">By application</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  {data!.byApplication.map((app, idx) => {
                    const color = APP_COLORS[idx % APP_COLORS.length];
                    const last = app.series[app.series.length - 1];
                    return (
                      <div key={app.applicationId} className="rounded-lg border border-white/10 bg-white/5 p-4">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="truncate text-sm font-medium text-foreground">
                            {app.applicationName}
                          </span>
                          {last && (
                            <Badge variant="secondary" className="text-[10px]">
                              {last.seatsAssigned}/{last.totalSeats} seats
                            </Badge>
                          )}
                        </div>
                        <Sparkline
                          series={[{ values: app.series.map((p) => p.seatsAssigned), color, area: true }]}
                          height={70}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
