
import { Users, Building2, Shield, Settings } from 'lucide-react';
import { StatsCard } from '@/components/ui/StatsCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';

// =============================================================================
// TYPES
// =============================================================================

interface TenantInfo {
  id: string;
  name: string;
  slug: string;
  memberCount?: number;
  createdAt: string;
  updatedAt: string;
  settings?: Record<string, any>;
  [key: string]: any;
}

interface OverviewTabProps {
  tenant: TenantInfo;
  tenantId: string;
  onRefresh: () => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function OverviewTab({ tenant, tenantId: _tenantId, onRefresh: _onRefresh }: OverviewTabProps) {
  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return dateString;
    }
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Total Members"
          value={tenant.memberCount || 0}
          icon={<Users className="h-6 w-6 text-blue-400" />}
          subtitle="Active users in tenant"
        />
        
        {/* Placeholder stats for future implementation */}
        <StatsCard
          title="Service Accounts"
          value="-"
          icon={<Shield className="h-6 w-6 text-purple-400" />}
          subtitle="API keys and service accounts"
        />
        
        <StatsCard
          title="Verified Domains"
          value="-"
          icon={<Building2 className="h-6 w-6 text-green-400" />}
          subtitle="Verified domain names"
        />
        
        <StatsCard
          title="Settings"
          value="-"
          icon={<Settings className="h-6 w-6 text-orange-400" />}
          subtitle="Configuration options"
        />
      </div>

      {/* Tenant Information */}
      <Card>
        <CardHeader>
          <CardTitle>Tenant Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Tenant Name</p>
              <p className="text-foreground">{tenant.name}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Slug (Subdomain)</p>
              <p className="text-foreground font-mono">{tenant.slug}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Tenant ID</p>
              <p className="text-sm text-foreground font-mono">{tenant.id}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Created At</p>
              <p className="text-foreground">{formatDate(tenant.createdAt)}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Last Updated</p>
              <p className="text-foreground">{formatDate(tenant.updatedAt)}</p>
            </div>
            {tenant.initiateLoginUri && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Initiate Login URI</p>
                <p className="text-sm text-foreground font-mono truncate">{tenant.initiateLoginUri}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Settings (if available) */}
      {tenant.settings && Object.keys(tenant.settings).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Settings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(tenant.settings).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                  <p className="text-sm font-medium text-foreground">{key}</p>
                  <p className="text-sm text-muted-foreground font-mono">
                    {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
