import {
  Key,
  Users,
  Package,
  ArrowUpRight,
  Building2,
  Trash2,
  CheckCircle,
  X,
  Info,
} from 'lucide-react';
import { type Column } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Progress } from '@/components/ui/Progress';
import type {
  TenantSubscription,
  MemberWithLicenses,
  SelectedLicenseForRevoke,
} from './LicensesTab.types';
import {
  subscriptionStatusVariants,
  subscriptionStatusLabels,
  membershipStatusVariants,
} from './LicensesTab.types';
import {
  getUserName,
  formatDate,
  getUtilizationPercentage,
  getUtilizationColor,
} from './LicensesTab.helpers';

// =============================================================================
// STATUS BADGES
// =============================================================================

export const getMembershipStatusBadge = (status: string) => {
  const variant = membershipStatusVariants[status] || membershipStatusVariants.ACTIVE;
  return <Badge className={variant}>{status}</Badge>;
};

export const getSubscriptionStatusBadge = (status: string) => {
  const variant = subscriptionStatusVariants[status] || subscriptionStatusVariants.ACTIVE;
  const label = subscriptionStatusLabels[status] || status;
  return <Badge className={variant}>{label}</Badge>;
};

// =============================================================================
// SUBSCRIPTION MODE DETAIL (FREE / TENANT_WIDE / PER_SEAT)
// =============================================================================

interface SubscriptionModeDetailProps {
  subscription: TenantSubscription;
  membersWithLicenses: MemberWithLicenses[];
  onRevoke: (payload: SelectedLicenseForRevoke) => void;
}

// Get the proper subscription item display based on licensing mode
export function SubscriptionModeDetail({
  subscription,
  membersWithLicenses,
  onRevoke,
}: SubscriptionModeDetailProps) {
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
                        onRevoke({
                          userId: member.user.id,
                          userDisplayName: getUserName(member),
                          applicationId: subscription.applicationId,
                          applicationName: subscription.applicationName,
                          licenseTypeName: subscription.licenseTypeName,
                        });
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
}

// =============================================================================
// SUBSCRIPTIONS TABLE COLUMNS
// =============================================================================

export function buildSubscriptionColumns(
  membersWithLicenses: MemberWithLicenses[]
): Column<TenantSubscription>[] {
  return [
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
}

// =============================================================================
// LICENSE HOLDERS TABLE COLUMNS
// =============================================================================

interface MemberColumnsDeps {
  onSelectLicenseForRevoke: (payload: SelectedLicenseForRevoke) => void;
  onGrant: (member: MemberWithLicenses) => void;
}

export function buildMemberColumns({
  onSelectLicenseForRevoke,
  onGrant,
}: MemberColumnsDeps): Column<MemberWithLicenses>[] {
  return [
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
                    onSelectLicenseForRevoke({
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
              onClick={() => onGrant(row)}
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
}
