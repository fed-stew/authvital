import * as React from 'react';
import { Link } from 'react-router-dom';
import {
  CreditCard,
  KeyRound,
  UserCheck,
  Ticket,
  Settings2,
  Receipt,
  CheckCircle2,
} from 'lucide-react';
import { tenantApi } from '@/lib/api';
import { useTenant } from '@/contexts/TenantContext';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { StatsCard } from '@/components/ui/StatsCard';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { useToast } from '@/components/ui/Toast';
import { UsageTrendsSection } from './UsageTrendsSection';

/**
 * Composes the tenant's billing picture from EXISTING endpoints only:
 * - /licenses/overview  -> subscriptions + seat totals
 * The `features` flag map + displayPrice (when the API exposes it) come from the
 * subscription's licenseType.
 *
 * We do NOT build invoices/payments (Phase 4a confirmed there is no invoice or
 * payment model) - that's a clearly-labelled placeholder. Provisioning/resizing
 * lives on the Licenses page; here we just link to it (gated billing:manage).
 */
interface BillingSubscription {
  id: string;
  applicationId: string;
  applicationName: string;
  licenseTypeName: string;
  licenseTypeSlug: string;
  quantityPurchased: number;
  quantityAssigned: number;
  quantityAvailable: number;
  status: string;
  currentPeriodEnd: string | null;
  licensingMode: 'FREE' | 'PER_SEAT' | 'TENANT_WIDE';
  // Optional: only present if the API is extended to surface it (see report).
  displayPrice?: string | null;
  features?: Record<string, boolean>;
}

type BadgeVariant = 'default' | 'secondary' | 'success' | 'warning' | 'outline';
const STATUS_VARIANT: Record<string, BadgeVariant> = {
  ACTIVE: 'success',
  TRIALING: 'default',
  PAST_DUE: 'warning',
  CANCELED: 'outline',
};

const MODE_LABEL: Record<BillingSubscription['licensingMode'], string> = {
  PER_SEAT: 'Per seat',
  TENANT_WIDE: 'Org-wide',
  FREE: 'Free',
};

const errMessage = (err: any, fallback: string) =>
  err?.response?.data?.message || err?.message || fallback;

const formatDate = (value: string | null) => {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

const enabledFeatures = (features?: Record<string, boolean>) =>
  Object.entries(features ?? {})
    .filter(([, on]) => on)
    .map(([name]) => name);

export function BillingPage() {
  const { tenantId, can } = useTenant();
  const { toast } = useToast();

  const canManage = can('billing:manage');

  const [subscriptions, setSubscriptions] = React.useState<BillingSubscription[]>([]);
  const [totals, setTotals] = React.useState({ owned: 0, assigned: 0 });
  const [isLoading, setIsLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    try {
      setIsLoading(true);
      const overview = await tenantApi.getLicenseOverview(tenantId);
      setSubscriptions(overview?.subscriptions ?? []);
      setTotals({
        owned: overview?.totalSeatsOwned ?? 0,
        assigned: overview?.totalSeatsAssigned ?? 0,
      });
    } catch (err: any) {
      toast({ variant: 'error', title: 'Error', message: errMessage(err, 'Failed to load billing') });
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, toast]);

  React.useEffect(() => {
    load();
  }, [load]);

  const available = Math.max(0, totals.owned - totals.assigned);
  const activeCount = subscriptions.filter((s) => s.status === 'ACTIVE').length;
  const showEmpty = !isLoading && subscriptions.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Billing</h1>
          <p className="text-muted-foreground">
            Your subscriptions, seats, and usage at a glance.
          </p>
        </div>
        {canManage && (
          <Link to={`/tenant/${tenantId}/licenses`}>
            <Button className="gap-2">
              <Settings2 className="h-4 w-4" />
              Manage subscriptions
            </Button>
          </Link>
        )}
      </div>

      {/* Seat totals */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatsCard
          title="Active subscriptions"
          value={activeCount}
          isLoading={isLoading}
          subtitle={`${subscriptions.length} total`}
          icon={<CreditCard className="h-5 w-5 text-primary" />}
        />
        <StatsCard
          title="Seats owned"
          value={totals.owned}
          isLoading={isLoading}
          subtitle={`${totals.assigned} assigned`}
          icon={<KeyRound className="h-5 w-5 text-blue-400" />}
        />
        <StatsCard
          title="Seats available"
          value={available}
          isLoading={isLoading}
          subtitle="ready to assign"
          icon={<Ticket className="h-5 w-5 text-green-400" />}
        />
      </div>

      {/* Current subscriptions composition */}
      <Card>
        <CardHeader className="border-b border-white/10">
          <CardTitle className="text-lg">Current plan</CardTitle>
          <CardDescription>What your organization is subscribed to.</CardDescription>
        </CardHeader>
        <CardContent className="p-6">
          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-2">
              {[0, 1].map((i) => (
                <div key={i} className="h-40 animate-pulse rounded-lg border border-white/10 bg-white/5" />
              ))}
            </div>
          ) : showEmpty ? (
            <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <CreditCard className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="font-medium text-foreground">No subscriptions yet</p>
                <p className="text-sm text-muted-foreground">
                  {canManage
                    ? 'Provision licenses on the Licenses page to get started.'
                    : 'Ask an owner or billing admin to provision licenses.'}
                </p>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {subscriptions.map((sub) => {
                const feats = enabledFeatures(sub.features);
                return (
                  <div key={sub.id} className="rounded-lg border border-white/10 bg-white/5 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-foreground">{sub.applicationName}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <span className="text-sm text-muted-foreground">{sub.licenseTypeName}</span>
                          <Badge variant="secondary" className="px-1.5 py-0 text-[10px] uppercase tracking-wide">
                            {MODE_LABEL[sub.licensingMode]}
                          </Badge>
                          <Badge variant={STATUS_VARIANT[sub.status] ?? 'outline'}>
                            {sub.status.replace('_', ' ')}
                          </Badge>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-semibold text-foreground">
                          {sub.displayPrice || (sub.licensingMode === 'FREE' ? 'Free' : '—')}
                        </p>
                        <p className="text-xs text-muted-foreground">per seat</p>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-md bg-white/5 py-2">
                        <p className="text-sm font-semibold text-foreground">{sub.quantityPurchased}</p>
                        <p className="text-[10px] uppercase text-muted-foreground">Owned</p>
                      </div>
                      <div className="rounded-md bg-white/5 py-2">
                        <p className="text-sm font-semibold text-foreground">{sub.quantityAssigned}</p>
                        <p className="text-[10px] uppercase text-muted-foreground">Assigned</p>
                      </div>
                      <div className="rounded-md bg-white/5 py-2">
                        <p className="text-sm font-semibold text-foreground">{sub.quantityAvailable}</p>
                        <p className="text-[10px] uppercase text-muted-foreground">Free</p>
                      </div>
                    </div>

                    <p className="mt-3 text-xs text-muted-foreground">Renews {formatDate(sub.currentPeriodEnd)}</p>

                    {feats.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {feats.map((f) => (
                          <span
                            key={f}
                            className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-muted-foreground"
                          >
                            <CheckCircle2 className="h-3 w-3 text-green-400" />
                            {f}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Usage trends (task 5) */}
      <UsageTrendsSection tenantId={tenantId} />

      {/* Seat management stats mirror */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatsCard
          title="Seats assigned"
          value={totals.assigned}
          isLoading={isLoading}
          subtitle={totals.owned > 0 ? `${Math.round((totals.assigned / totals.owned) * 100)}% utilization` : '—'}
          icon={<UserCheck className="h-5 w-5 text-green-400" />}
        />
      </div>

      {/* Invoices & payments placeholder */}
      <Card>
        <CardHeader className="border-b border-white/10">
          <CardTitle className="text-lg">Invoices &amp; payment methods</CardTitle>
          <CardDescription>Billing documents and payment details.</CardDescription>
        </CardHeader>
        <CardContent className="p-6">
          <div className="flex items-start gap-3 rounded-lg border border-dashed border-white/15 bg-white/5 p-4">
            <Receipt className="mt-0.5 h-5 w-5 text-muted-foreground" />
            <div>
              <p className="font-medium text-foreground">Coming soon / managed externally</p>
              <p className="text-sm text-muted-foreground">
                Invoices and payment methods aren't managed in this console yet. Reach out to your
                account team for billing documents.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
