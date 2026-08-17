import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { AppWindow, Users, ChevronRight, LayoutGrid, Armchair } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge, type BadgeProps } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Progress } from '@/components/ui/Progress';
import { StatsCard } from '@/components/ui/StatsCard';
import { useToast } from '@/components/ui/Toast';
import { tenantApi } from '@/lib/api';

interface AppSubscription {
  id: string;
  applicationId: string;
  applicationName: string;
  applicationSlug: string;
  licenseTypeName: string;
  licensingMode: 'FREE' | 'PER_SEAT' | 'TENANT_WIDE';
  quantityPurchased: number;
  quantityAssigned: number;
  status: 'ACTIVE' | 'CANCELED' | 'EXPIRED';
}

const MODE_VARIANT: Record<string, BadgeProps['variant']> = {
  FREE: 'success',
  PER_SEAT: 'default',
  TENANT_WIDE: 'secondary',
};

/**
 * ApplicationsPage - Shows all applications the tenant has access to
 */
export function ApplicationsPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { toast } = useToast();

  const [subscriptions, setSubscriptions] = useState<AppSubscription[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadSubscriptions = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await tenantApi.getApplications(tenantId!);
      setSubscriptions(data);
    } catch (err: any) {
      toast({
        variant: 'error',
        title: 'Error',
        message: err?.message || 'Failed to load applications',
      });
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, toast]);

  useEffect(() => {
    loadSubscriptions();
  }, [loadSubscriptions]);

  const perSeatCount = subscriptions.filter((s) => s.licensingMode === 'PER_SEAT').length;
  const seatsInUse = subscriptions
    .filter((s) => s.licensingMode === 'PER_SEAT')
    .reduce((n, s) => n + s.quantityAssigned, 0);

  // Usage summary per licensing mode.
  const getUsageDisplay = (sub: AppSubscription) => {
    switch (sub.licensingMode) {
      case 'FREE':
        return { text: 'All members have access', subtext: `${sub.quantityAssigned} members`, color: 'text-green-400' };
      case 'PER_SEAT': {
        const available = sub.quantityPurchased - sub.quantityAssigned;
        return {
          text: `${sub.quantityAssigned} / ${sub.quantityPurchased} seats used`,
          subtext: `${available} available`,
          color: available > 0 ? 'text-blue-400' : 'text-orange-400',
        };
      }
      case 'TENANT_WIDE':
        return { text: 'Organization-wide access', subtext: `${sub.quantityAssigned} members using`, color: 'text-purple-400' };
      default:
        return { text: '', subtext: '', color: '' };
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Applications</h1>
        <p className="text-muted-foreground">
          Manage which members have access to each application.
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatsCard
          title="Applications"
          value={subscriptions.length}
          isLoading={isLoading}
          subtitle="your org can access"
          icon={<LayoutGrid className="h-5 w-5 text-primary" />}
        />
        <StatsCard
          title="Per-seat apps"
          value={perSeatCount}
          isLoading={isLoading}
          subtitle="metered by seats"
          icon={<AppWindow className="h-5 w-5 text-blue-400" />}
        />
        <StatsCard
          title="Seats in use"
          value={seatsInUse}
          isLoading={isLoading}
          subtitle="across per-seat apps"
          icon={<Armchair className="h-5 w-5 text-green-400" />}
        />
      </div>

      {/* Applications Grid */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-52 animate-pulse rounded-lg border border-white/10 bg-card" />
          ))}
        </div>
      ) : subscriptions.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <AppWindow className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h3 className="font-medium text-foreground">No applications yet</h3>
              <p className="text-sm text-muted-foreground">
                Your organization doesn't have access to any applications yet.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {subscriptions.map((sub) => {
            const usage = getUsageDisplay(sub);
            const full =
              sub.licensingMode === 'PER_SEAT' &&
              sub.quantityPurchased > 0 &&
              sub.quantityAssigned >= sub.quantityPurchased;
            const pct =
              sub.quantityPurchased > 0
                ? Math.min(100, Math.round((sub.quantityAssigned / sub.quantityPurchased) * 100))
                : 0;

            return (
              <Card key={sub.id} className="group transition-colors hover:border-primary/50">
                <CardContent className="p-6">
                  {/* App Header */}
                  <div className="mb-4 flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/15">
                      <AppWindow className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold text-foreground">{sub.applicationName}</h3>
                      <Badge variant={MODE_VARIANT[sub.licensingMode] ?? 'outline'} className="mt-1">
                        {sub.licenseTypeName}
                      </Badge>
                    </div>
                  </div>

                  {/* Usage Stats */}
                  <div className="mb-4">
                    <div className="mb-1 flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span className={`text-sm font-medium ${usage.color}`}>{usage.text}</span>
                    </div>
                    <p className="ml-6 text-xs text-muted-foreground">{usage.subtext}</p>
                  </div>

                  {/* Progress bar for PER_SEAT */}
                  {sub.licensingMode === 'PER_SEAT' && (
                    <Progress
                      value={pct}
                      className="mb-4 h-1.5"
                      indicatorClassName={full ? 'bg-warning' : 'bg-primary'}
                    />
                  )}

                  {/* Manage Button */}
                  <Link to={`/tenant/${tenantId}/applications/${sub.applicationId}`} className="block">
                    <Button variant="outline" className="w-full group-hover:border-primary/50">
                      Manage Users
                      <ChevronRight className="ml-2 h-4 w-4" />
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
