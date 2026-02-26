import * as React from 'react';
import {
  Key,
  Users,
  Plus,
  RefreshCw,
  Package,
  ArrowUpRight,
  Building2,
  Trash2,
  CheckCircle,
  X,
  Info,
} from 'lucide-react';
import { superAdminApi } from '@/lib/api';
import { Table, type Column } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { StatsCard } from '@/components/ui/StatsCard';
import { Progress } from '@/components/ui/Progress';
import { useToast } from '@/components/ui/Toast';
import type {
  TenantLicenseOverview,
  TenantSubscription,
  MemberWithLicenses,
  AvailableLicenseType,
  GrantLicenseFormData,
  ProvisionSubscriptionFormData,
} from './LicensesTab.types';
import {
  subscriptionStatusVariants,
  subscriptionStatusLabels,
  membershipStatusVariants,
  defaultProvisionFormData,
  defaultGrantFormData,
} from './LicensesTab.types';

// =============================================================================
// TYPES
// =============================================================================

interface LicensesTabProps {
  tenantId: string;
  onRefresh?: () => void;
}

interface SelectedLicenseForRevoke {
  userId: string;
  userDisplayName: string;
  applicationId: string;
  applicationName: string;
  licenseTypeName: string;
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

  // Helper functions
  const getUserName = (member: MemberWithLicenses): string => {
    const user = member.user;
    if (user.givenName && user.familyName) {
      return `${user.givenName} ${user.familyName}`;
    }
    if (user.givenName) return user.givenName;
    return user.email || 'Unknown';
  };

  const formatDate = (dateString: string | null): string => {
    if (!dateString) return 'Never';
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return dateString || 'Never';
    }
  };

  const getUtilizationPercentage = (assigned: number, total: number): number => {
    if (total === 0) return 0;
    return Math.round((assigned / total) * 100);
  };

  const getUtilizationColor = (percentage: number): string => {
    if (percentage >= 90) return 'bg-red-500';
    if (percentage >= 75) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const getMembershipStatusBadge = (status: string) => {
    const variant = membershipStatusVariants[status] || membershipStatusVariants.ACTIVE;
    return <Badge className={variant}>{status}</Badge>;
  };

  const getSubscriptionStatusBadge = (status: string) => {
    const variant = subscriptionStatusVariants[status] || subscriptionStatusVariants.ACTIVE;
    const label = subscriptionStatusLabels[status] || status;
    return <Badge className={variant}>{label}</Badge>;
  };

  // Get the proper subscription item display based on licensing mode
  const getSubscriptionItemByMode = (subscription: TenantSubscription) => {
    const memberCount = membersWithLicenses.length;
    
    // FREE mode: Show "Free tier"
    if (subscription.licensingMode === 'FREE') {
      return (
        <div className="p-4 rounded-lg bg-muted/50 text-center border border-white/10">
          <CheckCircle className="h-8 w-8 mx-auto text-green-400 mb-2" />
          <p className="text-sm text-foreground font-medium">Free Tier</p>
          <p className="text-xs text-muted-foreground mt-1">
            All members have access — auto-provisioned
          </p>
        </div>
      );
    }
    
    // TENANT_WIDE mode: Show subscription tier info, member count, and features
    if (subscription.licensingMode === 'TENANT_WIDE') {
      const isNearLimit = subscription.maxMembers && memberCount >= subscription.maxMembers * 0.9;
      const isAtLimit = subscription.maxMembers && memberCount >= subscription.maxMembers;
      
      return (
        <div className="space-y-4">
          {/* Subscription tier info */}
          <div className={`flex items-center justify-between p-4 rounded-lg border ${
            isAtLimit ? 'border-red-500/50 bg-red-500/10' :
            isNearLimit ? 'border-yellow-500/50 bg-yellow-500/10' :
            'border-primary/50 bg-primary/10'
          }`}>
            <div className="flex-1">
              <h4 className="font-medium text-foreground">
                {subscription.licenseTypeName} Plan
              </h4>
              <p className="text-sm text-muted-foreground">
                {memberCount} members have access
                {subscription.maxMembers && (
                  <span className={
                    isAtLimit ? ' text-red-400' :
                    isNearLimit ? ' text-yellow-400' :
                    ' text-foreground'
                  }>
                    {` (max ${subscription.maxMembers})`}
                  </span>
                )}
              </p>
            </div>
            <Button variant="outline" size="sm">
              Change Plan
            </Button>
          </div>
          
          {/* Warning if near/at limit */}
          {subscription.maxMembers && (isNearLimit || isAtLimit) && (
            <div className={`flex items-start gap-2 p-3 rounded-lg border ${
              isAtLimit ? 'border-red-500/50 bg-red-500/10' :
              'border-yellow-500/50 bg-yellow-500/10'
            }`}>
              <Info className={`h-4 w-4 mt-0.5 shrink-0 ${
                isAtLimit ? 'text-red-400' : 'text-yellow-400'
              }`} />
              <div className="flex-1">
                <p className={`text-sm font-medium ${
                  isAtLimit ? 'text-red-50' : 'text-yellow-50'
                }`}>
                  {isAtLimit ? 'Member limit reached' : 'Approaching member limit'}
                </p>
                <p className={`text-xs ${
                  isAtLimit ? 'text-red-50/80' : 'text-yellow-50/80'
                }`}>
                  {isAtLimit 
                    ? 'You cannot add more members. Upgrade your plan to increase the limit.'
                    : `${memberCount} of ${subscription.maxMembers} members used. Consider upgrading soon.`
                  }
                </p>
              </div>
            </div>
          )}
          
          {/* Features badge list */}
          {Object.keys(subscription.features).length > 0 && (
            <div className="space-y-2">
              <h5 className="text-sm font-medium text-foreground">Included Features</h5>
              <div className="flex flex-wrap gap-2">
                {Object.entries(subscription.features)
                  .filter(([_, enabled]) => enabled)
                  .map(([feature]) => (
                    <Badge key={feature} variant="outline" className="text-xs">
                      {feature.replace(/_/g, ' ')}
                    </Badge>
                  ))}
              </div>
            </div>
          )}
        </div>
      );
    }
    
    // PER_SEAT mode: Show current seat management UI (default behavior)
    return (
      <div className="space-y-4">
        {/* Seat usage */}
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <p className="font-medium text-foreground">
              {subscription.quantityAssigned} / {subscription.quantityPurchased} seats assigned
            </p>
            <Progress 
              value={getUtilizationPercentage(subscription.quantityAssigned, subscription.quantityPurchased)} 
              className="h-2 mt-1"
              indicatorClassName={getUtilizationColor(
                getUtilizationPercentage(subscription.quantityAssigned, subscription.quantityPurchased)
              )}
            />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-2">
              <ArrowUpRight className="h-4 w-4" />
              Add Seats
            </Button>
            <Button size="sm">
              Grant License
            </Button>
          </div>
        </div>
        
        {/* Show list of members with licenses for this app */}
        <div className="rounded-lg border border-white/10 bg-card">
          <div className="px-4 py-3 border-b border-white/10">
            <h5 className="text-sm font-medium text-foreground">
              License Holders ({subscription.quantityAssigned})
            </h5>
          </div>
          <div className="divide-y divide-white/10">
            {membersWithLicenses.filter(m => 
              m.licenses.some(l => l.applicationId === subscription.applicationId)
            ).length > 0 ? (
              membersWithLicenses
                .filter(m => m.licenses.some(l => l.applicationId === subscription.applicationId))
                .map((member) => {
                  return (
                    <div key={member.user.id} className="px-4 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20">
                          <Users className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {getUserName(member)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {member.user.email}
                          </p>
                        </div>

                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedLicenseForRevoke({
                            userId: member.user.id,
                            userDisplayName: getUserName(member),
                            applicationId: subscription.applicationId,
                            applicationName: subscription.applicationName,
                            licenseTypeName: subscription.licenseTypeName,
                          });
                          setIsRevokeModalOpen(true);
                        }}
                        title="Revoke license"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  );
                })
            ) : (
              <div className="px-4 py-8 text-center">
                <Users className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">
                  No licenses assigned yet
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // =============================================================================
  // SUBSCRIPTIONS TABLE COLUMNS
  // =============================================================================

  const subscriptionColumns: Column<TenantSubscription>[] = [
    {
      header: 'Application',
      accessor: 'applicationName',
      cell: (_, row) => (
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/20">
            <Building2 className="h-4 w-4 text-blue-400" />
          </div>
          <div>
            <p className="font-medium text-foreground">{row.applicationName}</p>
            <Badge variant="outline" className={`text-xs mt-1 ${
              row.licensingMode === 'FREE' ? 'border-gray-500/30 text-gray-50' :
              row.licensingMode === 'TENANT_WIDE' ? 'border-blue-500/30 text-blue-50' :
              'border-green-500/30 text-green-50'
            }`}>
              {row.licensingMode === 'FREE' ? 'Free' :
               row.licensingMode === 'TENANT_WIDE' ? 'Tenant-Wide' :
               'Per-Seat'}
            </Badge>
          </div>
        </div>
      ),
    },
    {
      header: 'License Type',
      accessor: 'licenseTypeName',
      cell: (_, row) => (
        <div className="flex items-center gap-2">
          <Key className="h-4 w-4 text-muted-foreground" />
          <span className="text-foreground">{row.licenseTypeName}</span>
          {row.maxMembers && row.licensingMode === 'TENANT_WIDE' && (
            <span className="text-xs text-muted-foreground">
              (max {row.maxMembers} members)
            </span>
          )}
        </div>
      ),
    },
    {
      header: 'Usage',
      accessor: 'quantityPurchased',
      cell: (_, row) => {
        if (row.licensingMode === 'FREE') {
          return (
            <span className="text-sm text-muted-foreground">
              Unlimited access
            </span>
          );
        }
        
        if (row.licensingMode === 'TENANT_WIDE') {
          const memberCount = membersWithLicenses.length;
          if (row.maxMembers) {
            const percentage = Math.round((memberCount / row.maxMembers) * 100);
            return (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {memberCount} / {row.maxMembers} members
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {row.maxMembers - memberCount} available
                  </span>
                </div>
                <Progress
                  value={percentage}
                  className="h-2"
                  indicatorClassName={getUtilizationColor(percentage)}
                />
              </div>
            );
          } else {
            return (
              <span className="text-sm text-muted-foreground">
                {memberCount} members (unlimited)
              </span>
            );
          }
        }
        
        // PER_SEAT mode (default behavior)
        return (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {row.quantityAssigned} / {row.quantityPurchased} seats
              </span>
              <span className="text-xs text-muted-foreground">
                {row.quantityAvailable} available
              </span>
            </div>
            <Progress
              value={getUtilizationPercentage(row.quantityAssigned, row.quantityPurchased)}
              className="h-2"
              indicatorClassName={getUtilizationColor(
                getUtilizationPercentage(row.quantityAssigned, row.quantityPurchased)
              )}
            />
          </div>
        );
      },
    },
    {
      header: 'Status',
      accessor: 'status',
      cell: (value) => getSubscriptionStatusBadge(value),
    },
    {
      header: 'Expires',
      accessor: 'currentPeriodEnd',
      cell: (value) => formatDate(value),
    },
    {
      header: 'Actions',
      accessor: 'id',
      cell: (_, row) => (
        <div className="flex items-center gap-2 justify-end">
          {row.licensingMode !== 'FREE' && (
            <Button variant="ghost" size="sm" title="View subscription">
              <Package className="h-4 w-4" />
            </Button>
          )}
          {row.status === 'ACTIVE' && row.licensingMode !== 'FREE' && (
            <Button variant="ghost" size="sm" title="Cancel subscription">
              <X className="h-4 w-4 text-destructive" />
            </Button>
          )}
        </div>
      ),
      className: 'text-right',
    },
  ];

  // =============================================================================
  // LICENSE HOLDERS TABLE COLUMNS
  // =============================================================================

  const memberColumns: Column<MemberWithLicenses>[] = [
    {
      header: 'Member',
      accessor: 'user',
      cell: (_, row) => (
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20">
            <Users className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="font-medium text-foreground">{getUserName(row)}</p>
            <p className="text-sm text-muted-foreground">{row.user.email}</p>
          </div>

        </div>
      ),
    },
    {
      header: 'Status',
      accessor: 'membership',
      cell: (_, row) => getMembershipStatusBadge(row.membership.status),
    },
    {
      header: 'Licenses',
      accessor: 'licenses',
      cell: (_, row) => (
        <div className="flex flex-wrap gap-1">
          {row.licenses.map((license) => (
            <Badge
              key={license.id}
              variant="outline"
              className="text-xs"
              title={`${license.applicationName} - ${license.licenseTypeName}`}
            >
              {license.applicationName}
            </Badge>
          ))}
          {row.licenses.length === 0 && (
            <span className="text-sm text-muted-foreground">No licenses</span>
          )}
        </div>
      ),
    },
    {
      header: 'Actions',
      accessor: 'id',
      cell: (_, row) => (
        <div className="flex items-center gap-2 justify-end">
          {row.licenses.length > 0 ? (
            <>
              {row.licenses.map((license) => (
                <Button
                  key={license.id}
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setSelectedLicenseForRevoke({
                      userId: row.user.id,
                      userDisplayName: getUserName(row),
                      applicationId: license.applicationId,
                      applicationName: license.applicationName,
                      licenseTypeName: license.licenseTypeName,
                    })
                  }
                  title={`Revoke ${license.applicationName} license`}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              ))}
            </>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelectedMember(row);
                setIsGrantModalOpen(true);
              }}
              title="Grant license"
            >
              <ArrowUpRight className="h-4 w-4 text-green-400" />
            </Button>
          )}
        </div>
      ),
      className: 'text-right',
    },
  ];

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
                      {getSubscriptionItemByMode(subscription)}
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
      <Modal
        isOpen={isProvisionModalOpen}
        onClose={() => setIsProvisionModalOpen(false)}
        title="Add Subscription"
        size="lg"
        footer={
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setIsProvisionModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleProvisionSubscription}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Adding...' : 'Add Subscription'}
            </Button>
          </div>
        }
      >
        <form onSubmit={handleProvisionSubscription} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Application <span className="text-destructive">*</span>
              </label>
              <div className="space-y-2">
                {availableLicenseTypes
                  .filter((lt, index, self) =>
                    index === self.findIndex((t) => t.applicationId === lt.applicationId)
                  )
                  .map((lt) => (
                    <button
                      key={lt.applicationId}
                      type="button"
                      onClick={() =>
                        setProvisionFormData((prev) => ({
                          ...prev,
                          applicationId: lt.applicationId,
                          licenseTypeId: '', // Reset license type when app changes
                        }))
                      }
                      className={`w-full rounded-lg border p-3 text-left transition-all ${
                        provisionFormData.applicationId === lt.applicationId
                          ? 'border-primary bg-primary/10'
                          : 'border-white/10 hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-foreground">{lt.applicationName}</p>
                          <p className="text-xs text-muted-foreground">
                            {lt.description}
                          </p>
                        </div>
                        {provisionFormData.applicationId === lt.applicationId && (
                          <CheckCircle className="h-5 w-5 text-primary" />
                        )}
                      </div>
                    </button>
                  ))}
              </div>
            </div>

            {provisionFormData.applicationId && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  License Type <span className="text-destructive">*</span>
                </label>
                <div className="space-y-2">
                  {availableLicenseTypes
                    .filter((lt) => lt.applicationId === provisionFormData.applicationId)
                    .map((lt) => (
                      <button
                        key={lt.id}
                        type="button"
                        onClick={() =>
                          setProvisionFormData((prev) => ({
                            ...prev,
                            licenseTypeId: lt.id,
                          }))
                        }
                        className={`w-full rounded-lg border p-3 text-left transition-all ${
                          provisionFormData.licenseTypeId === lt.id
                            ? 'border-primary bg-primary/10'
                            : 'border-white/10 hover:border-white/20'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <p className="font-medium text-foreground">{lt.name}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {lt.description}
                            </p>
                            {Object.keys(lt.features).length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {Object.entries(lt.features)
                                  .filter(([_, enabled]) => enabled)
                                  .slice(0, 3)
                                  .map(([key]) => (
                                    <Badge key={key} variant="outline" className="text-xs">
                                      {key}
                                    </Badge>
                                  ))}
                              </div>
                            )}
                          </div>
                          {provisionFormData.licenseTypeId === lt.id && (
                            <CheckCircle className="h-5 w-5 text-primary shrink-0" />
                          )}
                        </div>
                      </button>
                    ))}
                </div>
              </div>
            )}
          </div>

          {provisionFormData.applicationId && provisionFormData.licenseTypeId && (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Quantity <span className="text-destructive">*</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="1"
                    max="1000"
                    value={provisionFormData.quantityPurchased}
                    onChange={(e) =>
                      setProvisionFormData((prev) => ({
                        ...prev,
                        quantityPurchased: parseInt(e.target.value) || 1,
                      }))
                    }
                    className="flex-1 rounded-md border border-white/10 bg-card px-3 py-2 text-foreground focus:border-primary focus:outline-none"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Period End <span className="text-destructive">*</span>
                </label>
                <input
                  type="date"
                  value={provisionFormData.currentPeriodEnd}
                  onChange={(e) =>
                    setProvisionFormData((prev) => ({
                      ...prev,
                      currentPeriodEnd: e.target.value,
                    }))
                  }
                  className="w-full rounded-md border border-white/10 bg-card px-3 py-2 text-foreground focus:border-primary focus:outline-none"
                  required
                />
              </div>
            </div>
          )}
        </form>
      </Modal>

      {/* Grant License Modal */}
      <Modal
        isOpen={isGrantModalOpen}
        onClose={() => {
          setIsGrantModalOpen(false);
          setSelectedMember(null);
          setGrantFormData(defaultGrantFormData);
        }}
        title="Grant License"
        size="md"
        footer={
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={() => {
                setIsGrantModalOpen(false);
                setSelectedMember(null);
                setGrantFormData(defaultGrantFormData);
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleGrantLicense} disabled={isSubmitting}>
              {isSubmitting ? 'Granting...' : 'Grant License'}
            </Button>
          </div>
        }
      >
        <form onSubmit={handleGrantLicense} className="space-y-4">
          {selectedMember && (
            <div className="rounded-md border border-white/10 bg-white/5 p-4">
              <p className="font-medium text-foreground">{getUserName(selectedMember)}</p>
              <p className="text-sm text-muted-foreground">{selectedMember.user.email}</p>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Application <span className="text-destructive">*</span>
            </label>
            <div className="space-y-2">
              {overview?.subscriptions
                .filter((sub) => sub.quantityAvailable > 0)
                .map((sub) => {
                  const isSelected = grantFormData.applicationId === sub.applicationId;
                  return (
                    <button
                      key={sub.applicationId}
                      type="button"
                      onClick={() =>
                        setGrantFormData((prev) => ({
                          ...prev,
                          applicationId: sub.applicationId,
                          licenseTypeId: sub.licenseTypeId, // Set to subscription's type by default
                        }))
                      }
                      disabled={sub.quantityAvailable <= 0}
                      className={`w-full rounded-lg border p-3 text-left transition-all disabled:opacity-50 ${
                        isSelected
                          ? 'border-primary bg-primary/10'
                          : 'border-white/10 hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-foreground">{sub.applicationName}</p>
                          <p className="text-xs text-muted-foreground">
                            {sub.licenseTypeName} - {sub.quantityAvailable} seats available
                          </p>
                        </div>
                        {isSelected && (
                          <CheckCircle className="h-5 w-5 text-primary" />
                        )}
                      </div>
                    </button>
                  );
                })}
            </div>
          </div>
        </form>
      </Modal>

      {/* Revoke License Confirmation Modal */}
      <Modal
        isOpen={isRevokeModalOpen}
        onClose={() => {
          setIsRevokeModalOpen(false);
          setSelectedLicenseForRevoke(null);
        }}
        title="Revoke License"
        size="sm"
        footer={
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={() => {
                setIsRevokeModalOpen(false);
                setSelectedLicenseForRevoke(null);
              }}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleRevokeLicense}>
              Revoke License
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-muted-foreground">
            Are you sure you want to revoke this license? The user will lose access to
            the application.
          </p>
          {selectedLicenseForRevoke && (
            <div className="rounded-md border border-white/10 bg-white/5 p-4 space-y-2">
              <div>
                <p className="text-xs text-muted-foreground">User</p>
                <p className="font-medium text-foreground">
                  {selectedLicenseForRevoke.userDisplayName}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">License</p>
                <p className="font-medium text-foreground">
                  {selectedLicenseForRevoke.applicationName} -{' '}
                  {selectedLicenseForRevoke.licenseTypeName}
                </p>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}