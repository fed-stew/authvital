import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { AppWindow, Users, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
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

/**
 * ApplicationsPage - Shows all applications the tenant has access to
 */
export function ApplicationsPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { toast } = useToast();

  const [subscriptions, setSubscriptions] = useState<AppSubscription[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load subscriptions
  useEffect(() => {
    loadSubscriptions();
  }, [tenantId]);

  const loadSubscriptions = async () => {
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
  };

  // Get usage display based on licensing mode
  const getUsageDisplay = (sub: AppSubscription) => {
    switch (sub.licensingMode) {
      case 'FREE':
        return {
          text: 'All members have access',
          subtext: `${sub.quantityAssigned} members`,
          color: 'text-green-400',
        };
      case 'PER_SEAT': {
        const available = sub.quantityPurchased - sub.quantityAssigned;
        return {
          text: `${sub.quantityAssigned} / ${sub.quantityPurchased} seats used`,
          subtext: `${available} available`,
          color: available > 0 ? 'text-blue-400' : 'text-orange-400',
        };
      }
      case 'TENANT_WIDE':
        return {
          text: 'Organization-wide access',
          subtext: `${sub.quantityAssigned} members using`,
          color: 'text-purple-400',
        };
      default:
        return { text: '', subtext: '', color: '' };
    }
  };

  // Get licensing mode badge
  const getLicenseBadge = (mode: string, typeName: string) => {
    const colorMap: Record<string, string> = {
      FREE: 'bg-green-500/20 text-green-400 border-green-500/50',
      PER_SEAT: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
      TENANT_WIDE: 'bg-purple-500/20 text-purple-400 border-purple-500/50',
    };
    return <Badge className={colorMap[mode] || ''}>{typeName}</Badge>;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading applications...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Applications</h1>
        <p className="text-muted-foreground">
          Manage which members have access to each application
        </p>
      </div>

      {/* Applications Grid */}
      {subscriptions.length === 0 ? (
        <Card className="p-12 text-center">
          <AppWindow className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">
            No Applications
          </h3>
          <p className="text-muted-foreground">
            Your organization doesn't have access to any applications yet.
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {subscriptions.map((sub) => {
            const usage = getUsageDisplay(sub);

            return (
              <Card
                key={sub.id}
                className="hover:border-primary/50 transition-colors group"
              >
                <CardContent className="p-6">
                  {/* App Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/20">
                        <AppWindow className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-foreground">
                          {sub.applicationName}
                        </h3>
                        {getLicenseBadge(sub.licensingMode, sub.licenseTypeName)}
                      </div>
                    </div>
                  </div>

                  {/* Usage Stats */}
                  <div className="mb-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span className={`text-sm font-medium ${usage.color}`}>
                        {usage.text}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground ml-6">
                      {usage.subtext}
                    </p>
                  </div>

                  {/* Progress bar for PER_SEAT */}
                  {sub.licensingMode === 'PER_SEAT' && (
                    <div className="mb-4">
                      <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary transition-all"
                          style={{
                            width: `${Math.min((sub.quantityAssigned / sub.quantityPurchased) * 100, 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Manage Button */}
                  <Link
                    to={`/tenant/${tenantId}/applications/${sub.applicationId}`}
                    className="block"
                  >
                    <Button
                      variant="outline"
                      className="w-full group-hover:border-primary/50"
                    >
                      Manage Users
                      <ChevronRight className="h-4 w-4 ml-2" />
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
