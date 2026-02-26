import * as React from 'react';
import { Package, Plus, Check, ChevronDown, Users } from 'lucide-react';
import { superAdminApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';

// =============================================================================
// TYPES
// =============================================================================

interface AppsTabProps {
  tenantId: string;
  onRefresh?: () => void;
}

interface TenantApp {
  id: string;
  applicationId: string;
  applicationName: string;
  applicationSlug: string;
  status: string;
  licensingMode: string;
}

interface AvailableApp {
  id: string;
  name: string;
  slug: string;
  defaultLicenseTypeId?: string;
}

interface AppMember {
  userId: string;
  email: string;
  name: string;
  licenseType: string;
  status: string;
  assignedAt: string;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function AppsTab({ tenantId, onRefresh }: AppsTabProps) {
  const { toast } = useToast();
  const [apps, setApps] = React.useState<TenantApp[]>([]);
  const [availableApps, setAvailableApps] = React.useState<AvailableApp[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = React.useState(false);
  const [selectedAppId, setSelectedAppId] = React.useState<string>('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Drill-down state
  const [expandedAppId, setExpandedAppId] = React.useState<string | null>(null);
  const [appMembers, setAppMembers] = React.useState<AppMember[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = React.useState(false);

  const loadData = React.useCallback(async () => {
    try {
      setIsLoading(true);
      // Get tenant's current app subscriptions
      const overview = await superAdminApi.getTenantLicenseOverview(tenantId);
      const subscriptions = overview?.subscriptions || [];

      setApps(
        subscriptions.map((sub: any) => ({
          id: sub.id,
          applicationId: sub.applicationId,
          applicationName: sub.applicationName,
          applicationSlug:
            sub.applicationSlug || sub.applicationName.toLowerCase().replace(/\s+/g, '-'),
          status: sub.status,
          licensingMode: sub.licensingMode,
        }))
      );

      // Get all available apps (for adding new ones)
      const allApps = await superAdminApi.getAllApplications();
      const currentAppIds = new Set(subscriptions.map((s: any) => s.applicationId));
      setAvailableApps(
        allApps
          .filter((app: any) => !currentAppIds.has(app.id) && app.isActive)
          .map((app: any) => ({
            id: app.id,
            name: app.name,
            slug: app.slug,
            defaultLicenseTypeId: app.defaultLicenseTypeId,
          }))
      );
    } catch (err: any) {
      toast({
        variant: 'error',
        title: 'Error',
        message: err?.response?.data?.message || 'Failed to load apps',
      });
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, toast]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  // Load members with licenses for a specific app
  const loadAppMembers = React.useCallback(async (applicationId: string) => {
    try {
      setIsLoadingMembers(true);
      const membersData = await superAdminApi.getTenantMembersWithLicenses(tenantId);

      // Filter to members who have a license for this specific app
      const filtered = membersData
        .filter((m: any) => m.licenses?.some((l: any) => l.applicationId === applicationId))
        .map((m: any) => {
          const appLicense = m.licenses?.find((l: any) => l.applicationId === applicationId);
          return {
            userId: m.user.id,
            email: m.user.email,
            name: m.user.givenName
              ? `${m.user.givenName} ${m.user.familyName || ''}`.trim()
              : m.user.email,
            licenseType: appLicense?.licenseTypeName || 'Unknown',
            status: appLicense?.status || 'ACTIVE',
            assignedAt: appLicense?.assignedAt || '',
          };
        });

      setAppMembers(filtered);
    } catch (err) {
      console.error('Failed to load app members:', err);
      setAppMembers([]);
    } finally {
      setIsLoadingMembers(false);
    }
  }, [tenantId]);

  // Handle app row click (toggle expansion)
  const handleAppClick = (appId: string) => {
    if (expandedAppId === appId) {
      setExpandedAppId(null);
      setAppMembers([]);
    } else {
      setExpandedAppId(appId);
      const app = apps.find((a) => a.id === appId);
      if (app) {
        loadAppMembers(app.applicationId);
      }
    }
  };

  const handleAddApp = async () => {
    if (!selectedAppId) return;

    const selectedApp = availableApps.find((a) => a.id === selectedAppId);
    if (!selectedApp) return;

    try {
      setIsSubmitting(true);
      // Use provisionSubscription to add app access for tenant
      // Set a far-future date for the subscription period
      const farFuture = new Date();
      farFuture.setFullYear(farFuture.getFullYear() + 100);
      
      await superAdminApi.provisionSubscription({
        tenantId,
        applicationId: selectedAppId,
        licenseTypeId: selectedApp.defaultLicenseTypeId || '',
        quantityPurchased: 1,
        currentPeriodEnd: farFuture.toISOString(),
      });
      toast({ variant: 'success', title: 'Success', message: 'App added to tenant' });
      setIsAddModalOpen(false);
      setSelectedAppId('');
      loadData();
      onRefresh?.();
    } catch (err: any) {
      toast({
        variant: 'error',
        title: 'Error',
        message: err?.response?.data?.message || 'Failed to add app',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'bg-green-500/20 text-green-50 border-green-500/50';
      case 'TRIALING':
        return 'bg-blue-500/20 text-blue-50 border-blue-500/50';
      case 'CANCELED':
        return 'bg-gray-500/20 text-gray-50 border-gray-500/50';
      case 'PAST_DUE':
        return 'bg-orange-500/20 text-orange-50 border-orange-500/50';
      default:
        return 'bg-white/10 text-white border-white/20';
    }
  };

  const getLicensingModeLabel = (mode: string) => {
    switch (mode) {
      case 'FREE':
        return 'Free';
      case 'TENANT_WIDE':
        return 'Tenant-Wide';
      case 'PER_SEAT':
        return 'Per-Seat';
      default:
        return mode;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading applications...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Info Banner */}
      <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 p-4">
        <div className="flex items-start gap-3">
          <Package className="h-5 w-5 text-blue-400 mt-0.5" />
          <div>
            <h4 className="font-medium text-blue-400">Tenant Applications</h4>
            <p className="text-sm text-muted-foreground mt-1">
              These are the applications this tenant has access to. User licensing within each app
              is managed separately based on the app's licensing mode.
            </p>
          </div>
        </div>
      </div>

      {/* Apps List */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Applications ({apps.length})
          </CardTitle>
          {availableApps.length > 0 && (
            <Button size="sm" onClick={() => setIsAddModalOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add App
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {apps.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No applications assigned to this tenant</p>
              {availableApps.length > 0 && (
                <Button variant="outline" className="mt-4" onClick={() => setIsAddModalOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add First App
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {apps.map((app) => (
                <div key={app.id}>
                  <button
                    type="button"
                    onClick={() => handleAppClick(app.id)}
                    className="w-full flex items-center justify-between p-4 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/20">
                        <Package className="h-5 w-5 text-primary" />
                      </div>
                      <div className="text-left">
                        <p className="font-medium">{app.applicationName}</p>
                        <p className="text-sm text-muted-foreground">{app.applicationSlug}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge className={getStatusBadgeClass(app.status)}>
                        {app.status === 'ACTIVE' ? (
                          <>
                            <Check className="h-3 w-3 mr-1" /> Active
                          </>
                        ) : (
                          app.status
                        )}
                      </Badge>
                      <Badge variant="outline">{getLicensingModeLabel(app.licensingMode)}</Badge>
                      <ChevronDown
                        className={cn(
                          'h-4 w-4 text-muted-foreground transition-transform',
                          expandedAppId === app.id && 'rotate-180'
                        )}
                      />
                    </div>
                  </button>

                  {/* Expanded Section - Member Licenses */}
                  {expandedAppId === app.id && (
                    <div className="mt-2 ml-14 p-4 rounded-lg border border-white/5 bg-white/[0.02]">
                      <h4 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        Members with Licenses
                      </h4>

                      {isLoadingMembers ? (
                        <div className="flex items-center justify-center py-4">
                          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                        </div>
                      ) : appMembers.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-2">
                          No members have licenses for this app yet.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {appMembers.map((member) => (
                            <div
                              key={member.userId}
                              className="flex items-center justify-between p-2 rounded border border-white/5"
                            >
                              <div className="flex items-center gap-3">
                                <div className="h-8 w-8 rounded-full bg-white/10 flex items-center justify-center text-xs font-medium">
                                  {member.name.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                  <p className="text-sm font-medium">{member.name}</p>
                                  <p className="text-xs text-muted-foreground">{member.email}</p>
                                </div>
                              </div>
                              <Badge variant="outline" className="text-xs">
                                {member.licenseType}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add App Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => {
          setIsAddModalOpen(false);
          setSelectedAppId('');
        }}
        title="Add Application"
        size="sm"
        footer={
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={() => {
                setIsAddModalOpen(false);
                setSelectedAppId('');
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleAddApp} disabled={!selectedAppId || isSubmitting}>
              {isSubmitting ? 'Adding...' : 'Add App'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Select an application to give this tenant access to:
          </p>
          {availableApps.length === 0 ? (
            <div className="text-center py-4 text-muted-foreground">
              <p>No additional apps available</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {availableApps.map((app) => (
                <button
                  key={app.id}
                  type="button"
                  onClick={() => setSelectedAppId(app.id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                    selectedAppId === app.id
                      ? 'border-primary bg-primary/10'
                      : 'border-white/10 hover:border-white/20 hover:bg-white/5'
                  }`}
                >
                  <Package className="h-5 w-5 text-muted-foreground" />
                  <div className="text-left">
                    <p className="font-medium">{app.name}</p>
                    <p className="text-sm text-muted-foreground">{app.slug}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
