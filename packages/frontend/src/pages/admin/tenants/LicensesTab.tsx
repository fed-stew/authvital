import * as React from 'react';
import {
  Key,
  Users,
  Plus,
  RefreshCw,
  Package,
  Building2,
  X,
} from 'lucide-react';
import { superAdminApi } from '@/lib/api';
import { Table } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { StatsCard } from '@/components/ui/StatsCard';
import { Progress } from '@/components/ui/Progress';
import { useToast } from '@/components/ui/Toast';
import type {
  TenantLicenseOverview,
  MemberWithLicenses,
  AvailableLicenseType,
  GrantLicenseFormData,
  ProvisionSubscriptionFormData,
  SelectedLicenseForRevoke,
} from './LicensesTab.types';
import {
  defaultProvisionFormData,
  defaultGrantFormData,
} from './LicensesTab.types';
import {
  getUtilizationPercentage,
  getUtilizationColor,
} from './LicensesTab.helpers';
import {
  ProvisionSubscriptionModal,
  GrantLicenseModal,
  RevokeLicenseModal,
} from './LicensesTab.modals';
import {
  getSubscriptionStatusBadge,
  SubscriptionModeDetail,
  buildSubscriptionColumns,
  buildMemberColumns,
} from './LicensesTab.sections';

// =============================================================================
// TYPES
// =============================================================================

interface LicensesTabProps {
  tenantId: string;
  onRefresh?: () => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function LicensesTab({ tenantId, onRefresh }: LicensesTabProps) {
  const { toast } = useToast();



  // Modal states
  const [isProvisionModalOpen, setIsProvisionModalOpen] = React.useState(false);
  const [isGrantModalOpen, setIsGrantModalOpen] = React.useState(false);
  const [isRevokeModalOpen, setIsRevokeModalOpen] = React.useState(false);
  const [selectedMember, setSelectedMember] = React.useState<MemberWithLicenses | null>(null);
  const [selectedLicenseForRevoke, setSelectedLicenseForRevoke] = React.useState<SelectedLicenseForRevoke | null>(null);

  // Form states
  const [provisionFormData, setProvisionFormData] = React.useState<ProvisionSubscriptionFormData>(defaultProvisionFormData);
  const [grantFormData, setGrantFormData] = React.useState<GrantLicenseFormData>(defaultGrantFormData);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Data states
  const [isLoading, setIsLoading] = React.useState(false);
  const [overview, setOverview] = React.useState<TenantLicenseOverview | null>(null);
  const [membersWithLicenses, setMembersWithLicenses] = React.useState<MemberWithLicenses[]>([]);
  const [availableLicenseTypes, setAvailableLicenseTypes] = React.useState<AvailableLicenseType[]>([]);

  // Load all data
  const loadData = React.useCallback(async () => {
    if (!tenantId) return;

    try {
      setIsLoading(true);

      // Load overview data
      const overviewData = await superAdminApi.getTenantLicenseOverview(tenantId);
      setOverview(overviewData || null);

      // Load members with licenses
      const membersData = await superAdminApi.getTenantMembersWithLicenses(tenantId);
      setMembersWithLicenses(membersData || []);

      // Load available license types
      const licenseTypesData = await superAdminApi.getAvailableLicenseTypesForTenant(tenantId);
      setAvailableLicenseTypes(licenseTypesData || []);
    } catch (err: any) {
      const errorMessage =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to load license data';
      toast({
        variant: 'error',
        title: 'Error',
        message: errorMessage,
      });
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, toast]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  // Refresh handler
  const handleRefresh = () => {
    loadData();
    onRefresh?.();
  };

  // Handle provision subscription
  const handleProvisionSubscription = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!provisionFormData.applicationId || !provisionFormData.licenseTypeId) {
      toast({
        variant: 'error',
        title: 'Error',
        message: 'Application and license type are required',
      });
      return;
    }

    if (!provisionFormData.quantityPurchased || provisionFormData.quantityPurchased < 1) {
      toast({
        variant: 'error',
        title: 'Error',
        message: 'Quantity must be at least 1',
      });
      return;
    }

    try {
      setIsSubmitting(true);
      await superAdminApi.provisionSubscription({
        tenantId,
        ...provisionFormData,
      });

      setIsProvisionModalOpen(false);
      setProvisionFormData(defaultProvisionFormData);
      loadData();

      toast({
        variant: 'success',
        title: 'Success',
        message: 'Subscription provisioned successfully',
      });
    } catch (err: any) {
      const errorMessage =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to provision subscription';
      toast({
        variant: 'error',
        title: 'Error',
        message: errorMessage,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle grant license
  const handleGrantLicense = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedMember) {
      toast({
        variant: 'error',
        title: 'Error',
        message: 'No member selected',
      });
      return;
    }

    if (!grantFormData.applicationId || !grantFormData.licenseTypeId) {
      toast({
        variant: 'error',
        title: 'Error',
        message: 'Application and license type are required',
      });
      return;
    }

    try {
      setIsSubmitting(true);
      await superAdminApi.grantLicense({
        tenantId,
        userId: selectedMember.user.id,
        applicationId: grantFormData.applicationId,
        licenseTypeId: grantFormData.licenseTypeId,
      });
      setIsGrantModalOpen(false);
      setGrantFormData(defaultGrantFormData);
      setSelectedMember(null);
      loadData();

      toast({
        variant: 'success',
        title: 'Success',
        message: 'License granted successfully',
      });
    } catch (err: any) {
      const errorMessage =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to grant license';
      toast({
        variant: 'error',
        title: 'Error',
        message: errorMessage,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle revoke license
  const handleRevokeLicense = async () => {
    if (!selectedLicenseForRevoke) return;

    try {
      await superAdminApi.revokeLicense({
        tenantId,
        userId: selectedLicenseForRevoke.userId,
        applicationId: selectedLicenseForRevoke.applicationId,
      });

      setIsRevokeModalOpen(false);
      setSelectedLicenseForRevoke(null);
      loadData();

      toast({
        variant: 'success',
        title: 'Success',
        message: 'License revoked successfully',
      });
    } catch (err: any) {
      const errorMessage =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to revoke license';
      toast({
        variant: 'error',
        title: 'Error',
        message: errorMessage,
      });
    }
  };

  // Table columns (built via factories to keep this orchestrator focused)
  const subscriptionColumns = buildSubscriptionColumns(membersWithLicenses);

  const memberColumns = buildMemberColumns({
    onSelectLicenseForRevoke: setSelectedLicenseForRevoke,
    onGrant: (member) => {
      setSelectedMember(member);
      setIsGrantModalOpen(true);
    },
  });

  // Get the proper subscription item to render (moved here to access all state)


  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Licenses</h2>
          <p className="text-sm text-muted-foreground">
            Manage tenant licenses and member access
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleRefresh} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
          <Button
            onClick={() => setIsProvisionModalOpen(true)}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            Add Subscription
          </Button>
        </div>
      </div>

      {/* Section 1: Overview Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <StatsCard
          icon={<Key className="h-5 w-5 text-blue-400" />}
          title="Total Seats Owned"
          value={overview?.totalSeatsOwned ?? 0}
          isLoading={isLoading}
        />
        <StatsCard
          icon={<Users className="h-5 w-5 text-green-400" />}
          title="Seats Assigned"
          value={overview?.totalSeatsAssigned ?? 0}
          isLoading={isLoading}
        />
        <StatsCard
          icon={<Package className="h-5 w-5 text-purple-400" />}
          title="Seats Available"
          value={
            overview
              ? overview.totalSeatsOwned - overview.totalSeatsAssigned
              : 0
          }
          isLoading={isLoading}
        />
      </div>

      {/* Utilization Progress */}
      {overview && !isLoading && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Overall Utilization</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {overview.totalSeatsAssigned} / {overview.totalSeatsOwned} seats used
                </span>
                <span className="text-sm font-medium text-foreground">
                  {getUtilizationPercentage(
                    overview.totalSeatsAssigned,
                    overview.totalSeatsOwned
                  )}
                  %
                </span>
              </div>
              <Progress
                value={getUtilizationPercentage(
                  overview.totalSeatsAssigned,
                  overview.totalSeatsOwned
                )}
                className="h-3"
                indicatorClassName={getUtilizationColor(
                  getUtilizationPercentage(
                    overview.totalSeatsAssigned,
                    overview.totalSeatsOwned
                  )
                )}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Section 2: Subscriptions Table */}
      <div>
        <h3 className="mb-4 text-base font-semibold text-foreground">Subscriptions</h3>
        {overview?.subscriptions && overview.subscriptions.length > 0 ? (
          <div className="space-y-4">
            {overview.subscriptions.map((subscription) => {
              if (subscription.licensingMode === 'FREE' || subscription.licensingMode === 'TENANT_WIDE') {
                // Render detailed view for FREE and TENANT_WIDE
                return (
                  <div key={subscription.id} className="rounded-lg border border-white/10 bg-card">
                    <div className="p-4 border-b border-white/10">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/20">
                            <Building2 className="h-5 w-5 text-blue-400" />
                          </div>
                          <div>
                            <h4 className="font-medium text-foreground">{subscription.applicationName}</h4>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge variant="outline" className={`text-xs ${
                                subscription.licensingMode === 'FREE' ? 'border-gray-500/30 text-gray-50' :
                                'border-blue-500/30 text-blue-50'
                              }`}>
                                {subscription.licensingMode === 'FREE' ? 'Free' : 'Tenant-Wide'}
                              </Badge>
                              {getSubscriptionStatusBadge(subscription.status)}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {subscription.licensingMode !== 'FREE' && (
                            <Button variant="ghost" size="sm" title="Manage subscription">
                              <Package className="h-4 w-4" />
                            </Button>
                          )}
                          {subscription.status === 'ACTIVE' && subscription.licensingMode !== 'FREE' && (
                            <Button variant="ghost" size="sm" title="Cancel subscription">
                              <X className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="p-6">
                      <SubscriptionModeDetail
                        subscription={subscription}
                        membersWithLicenses={membersWithLicenses}
                        onRevoke={(payload) => {
                          setSelectedLicenseForRevoke(payload);
                          setIsRevokeModalOpen(true);
                        }}
                      />
                    </div>
                  </div>
                );
              } else {
                // For PER_SEAT mode, include in the regular table
                return null;
              }
            })}
            
            {/* Table for PER_SEAT subscriptions */}
            {overview.subscriptions.filter(s => s.licensingMode === 'PER_SEAT').length > 0 && (
              <div className="rounded-lg border border-white/10 bg-card">
                <div className="px-4 py-3 border-b border-white/10">
                  <h5 className="text-sm font-medium text-foreground">Per-Seat Applications</h5>
                </div>
                <Table
                  data={overview.subscriptions.filter(s => s.licensingMode === 'PER_SEAT')}
                  columns={subscriptionColumns}
                  isLoading={isLoading}
                  emptyMessage=""
                />
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-lg border border-white/10 bg-card">
            <Table
              data={overview?.subscriptions || []}
              columns={subscriptionColumns}
              isLoading={isLoading}
              emptyMessage="No subscriptions found. Add a subscription to get started."
            />
          </div>
        )}
      </div>

      {/* Section 3: License Holders Table */}
      <div>
        <h3 className="mb-4 text-base font-semibold text-foreground">License Holders</h3>
        <div className="rounded-lg border border-white/10 bg-card">
          <Table
            data={membersWithLicenses}
            columns={memberColumns}
            isLoading={isLoading}
            emptyMessage="No members found"
          />
        </div>
      </div>


      {/* Provision Subscription Modal */}
      <ProvisionSubscriptionModal
        isOpen={isProvisionModalOpen}
        onClose={() => setIsProvisionModalOpen(false)}
        onSubmit={handleProvisionSubscription}
        isSubmitting={isSubmitting}
        availableLicenseTypes={availableLicenseTypes}
        provisionFormData={provisionFormData}
        setProvisionFormData={setProvisionFormData}
      />

      {/* Grant License Modal */}
      <GrantLicenseModal
        isOpen={isGrantModalOpen}
        onClose={() => {
          setIsGrantModalOpen(false);
          setSelectedMember(null);
          setGrantFormData(defaultGrantFormData);
        }}
        onSubmit={handleGrantLicense}
        isSubmitting={isSubmitting}
        selectedMember={selectedMember}
        overview={overview}
        grantFormData={grantFormData}
        setGrantFormData={setGrantFormData}
      />

      {/* Revoke License Confirmation Modal */}
      <RevokeLicenseModal
        isOpen={isRevokeModalOpen}
        onClose={() => {
          setIsRevokeModalOpen(false);
          setSelectedLicenseForRevoke(null);
        }}
        onConfirm={handleRevokeLicense}
        selectedLicenseForRevoke={selectedLicenseForRevoke}
      />
    </div>
  );
}