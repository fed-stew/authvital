import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Building2, AppWindow, Key, ArrowRight } from 'lucide-react';
import { useAdmin } from '@/contexts/AdminContext';
import { superAdminApi } from '@/lib/api';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { StatsCard } from '@/components/ui/StatsCard';
import { Button } from '@/components/ui/Button';

// =============================================================================
// TYPES
// =============================================================================

interface SystemStats {
  totalUsers: number;
  totalTenants: number;
  totalApplications: number;
  activeLicenses: number;
  [key: string]: any;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function Dashboard() {
  const { admin } = useAdmin();
  const navigate = useNavigate();
  const [stats, setStats] = React.useState<SystemStats | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Fetch stats on mount
  React.useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await superAdminApi.getSystemStats();
      setStats(data);
    } catch (err: any) {
      const errorMessage =
        err?.response?.data?.message || err?.message || 'Failed to load stats';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const adminName = admin?.displayName || admin?.email || 'Admin';

  return (
    <AdminLayout title="Dashboard">
      <div className="space-y-6">
        {/* Welcome Message */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Welcome back, {adminName}!
          </h1>
          <p className="text-muted-foreground">
            Here's what's happening with your AuthVader instance today.
          </p>
        </div>

        {/* Stats Cards */}
        {/* Loading State */}
        {isLoading && (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <StatsCard key={i} title="Loading" value="---" isLoading />
            ))}
          </div>
        )}

        {/* Error State */}
        {!isLoading && error && (
          <div className="rounded-md border border-red-500/50 bg-red-500/10 p-4 text-red-50">
            <p className="text-sm">{error}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={loadStats}
              className="mt-2"
            >
              Retry
            </Button>
          </div>
        )}

        {/* Stats Cards */}
        {!isLoading && !error && stats && (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {/* Total Users */}
            <StatsCard
              title="Total Users"
              value={stats.totalUsers || 0}
              icon={<Users className="h-6 w-6 text-blue-400" />}
              trend={{ value: 0, isPositive: true }}
              subtitle="Registered users"
            />

            {/* Total Tenants */}
            <StatsCard
              title="Total Tenants"
              value={stats.totalTenants || 0}
              icon={<Building2 className="h-6 w-6 text-green-400" />}
              trend={{ value: 0, isPositive: true }}
              subtitle="Active organizations"
            />

            {/* Total Applications */}
            <StatsCard
              title="Total Applications"
              value={stats.totalApplications || 0}
              icon={<AppWindow className="h-6 w-6 text-purple-400" />}
              trend={{ value: 0, isPositive: true }}
              subtitle="Connected apps"
            />

            {/* Active Licenses */}
            <StatsCard
              title="Active Licenses"
              value={stats.activeLicenses || 0}
              icon={<Key className="h-6 w-6 text-orange-400" />}
              trend={{ value: 0, isPositive: true }}
              subtitle="In-use licenses"
            />
          </div>
        )}

        {/* Quick Actions */}
        <div>
          <h2 className="mb-4 text-lg font-semibold text-foreground">
            Quick Actions
          </h2>
          <div className="grid gap-4 md:grid-cols-3">
            {/* Create User */}
            <Button
              variant="outline"
              className="h-auto flex-col items-start justify-start gap-2 p-4 border-white/20 bg-card hover:bg-white/5"
              onClick={() => navigate('/admin/users')}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/20">
                <Users className="h-5 w-5 text-blue-400" />
              </div>
              <div className="flex flex-1 flex-col items-start">
                <span className="font-medium text-foreground">Create User</span>
                <span className="text-sm text-muted-foreground">
                  Add a new user to the system
                </span>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </Button>

            {/* Create Tenant */}
            <Button
              variant="outline"
              className="h-auto flex-col items-start justify-start gap-2 p-4 border-white/20 bg-card hover:bg-white/5"
              onClick={() => navigate('/admin/tenants')}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/20">
                <Building2 className="h-5 w-5 text-green-400" />
              </div>
              <div className="flex flex-1 flex-col items-start">
                <span className="font-medium text-foreground">Create Tenant</span>
                <span className="text-sm text-muted-foreground">
                  Create a new organization
                </span>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </Button>

            {/* Create Application */}
            <Button
              variant="outline"
              className="h-auto flex-col items-start justify-start gap-2 p-4 border-white/20 bg-card hover:bg-white/5"
              onClick={() => navigate('/admin/applications')}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/20">
                <AppWindow className="h-5 w-5 text-purple-400" />
              </div>
              <div className="flex flex-1 flex-col items-start">
                <span className="font-medium text-foreground">Create Application</span>
                <span className="text-sm text-muted-foreground">
                  Add a new OAuth application
                </span>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </Button>
          </div>
        </div>

        {/* Recent Activity Placeholder (for future enhancement) */}
        <div className="rounded-lg border border-white/10 bg-card p-6">
          <h2 className="mb-4 text-lg font-semibold text-foreground">
            Recent Activity
          </h2>
          <p className="text-sm text-muted-foreground">
            Recent activity feed will appear here in future updates.
          </p>
        </div>
      </div>
    </AdminLayout>
  );
}
