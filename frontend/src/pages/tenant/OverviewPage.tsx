import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Users, AppWindow, Mail, ArrowRight } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { useToast } from '@/components/ui/Toast';
import { tenantApi } from '@/lib/api';

interface Stats {
  memberCount: number;
  pendingInvites: number;
  appCount: number;
}

/**
 * OverviewPage - Tenant dashboard showing stats and quick actions
 */
export function OverviewPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { toast } = useToast();

  const [stats, setStats] = useState<Stats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, [tenantId]);

  const loadStats = async () => {
    try {
      setIsLoading(true);
      const data = await tenantApi.getOverview(tenantId!);
      setStats(data);
    } catch (err: any) {
      toast({
        variant: 'error',
        title: 'Error',
        message: err?.message || 'Failed to load overview',
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading overview...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Overview</h1>
        <p className="text-muted-foreground">
          Manage your organization's members and application access.
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Members
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {stats?.memberCount ?? 0}
            </div>
            {(stats?.pendingInvites ?? 0) > 0 && (
              <p className="text-xs text-muted-foreground">
                +{stats?.pendingInvites} pending invites
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Applications
            </CardTitle>
            <AppWindow className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {stats?.appCount ?? 0}
            </div>
            <p className="text-xs text-muted-foreground">with active access</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Pending Invites
            </CardTitle>
            <Mail className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {stats?.pendingInvites ?? 0}
            </div>
            <p className="text-xs text-muted-foreground">awaiting response</p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="hover:border-primary/50 transition-colors">
          <Link to={`/tenant/${tenantId}/members`} className="block p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/20">
                  <Users className="h-5 w-5 text-blue-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">
                    Manage Members
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Invite users, manage roles, and control access
                  </p>
                </div>
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground" />
            </div>
          </Link>
        </Card>

        <Card className="hover:border-primary/50 transition-colors">
          <Link to={`/tenant/${tenantId}/applications`} className="block p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/20">
                  <AppWindow className="h-5 w-5 text-purple-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">
                    Manage Applications
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Control which members can access each application
                  </p>
                </div>
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground" />
            </div>
          </Link>
        </Card>
      </div>
    </div>
  );
}
