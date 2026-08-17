import * as React from 'react';
import { Plus, KeyRound, Users2, UserCheck, Ticket, Pencil, XCircle, Ban } from 'lucide-react';
import { tenantApi } from '@/lib/api';
import { useTenant } from '@/contexts/TenantContext';
import { Table, type Column } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { StatsCard } from '@/components/ui/StatsCard';
import { Progress } from '@/components/ui/Progress';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { useToast } from '@/components/ui/Toast';
import { ManageSeatsModal } from './ManageSeatsModal';
import { ProvisionLicenseModal } from './ProvisionLicenseModal';

// =============================================================================
// SHARED TYPES (consumed by the license modals too)
// =============================================================================

export interface TenantSubscription {
  id: string;
  applicationId: string;
  applicationName: string;
  licenseTypeId: string;
  licenseTypeName: string;
  licenseTypeSlug: string;
  quantityPurchased: number;
  quantityAssigned: number;
  quantityAvailable: number;
  status: string;
  currentPeriodEnd: string | null;
  licensingMode: 'FREE' | 'PER_SEAT' | 'TENANT_WIDE';
  maxMembers: number | null;
}

export interface MemberLicense {
  id: string;
  applicationId: string;
  applicationName: string;
  licenseTypeId: string;
  licenseTypeName: string;
  licenseTypeSlug: string;
  assignedAt: string;
}

export interface MemberWithLicenses {
  user: { id: string; email: string; givenName: string | null; familyName: string | null };
  membership: { id: string; status: 'ACTIVE' | 'INVITED' | 'SUSPENDED' };
  licenses: MemberLicense[];
}

export interface AvailableLicenseType {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  applicationId: string;
  applicationName: string;
  hasSubscription: boolean;
  existingSubscription?: { id: string; quantityPurchased: number; quantityAssigned: number };
}

export const errMessage = (err: any, fallback: string) =>
  err?.response?.data?.message || err?.message || fallback;

const MODE_LABEL: Record<TenantSubscription['licensingMode'], string> = {
  PER_SEAT: 'Per seat',
  TENANT_WIDE: 'Org-wide',
  FREE: 'Free',
};

type BadgeVariant = 'default' | 'secondary' | 'success' | 'warning' | 'outline';
const STATUS_VARIANT: Record<string, BadgeVariant> = {
  ACTIVE: 'success',
  TRIALING: 'default',
  PAST_DUE: 'warning',
  CANCELED: 'outline',
};

// =============================================================================
// PAGE
// =============================================================================

/**
 * LicensesPage - Self-serve licensing for tenant admins.
 *
 * - view (everyone with licenses:view): seat totals + subscription inventory.
 * - manage (licenses:manage): assign/revoke/change seats per subscription.
 * - provision (licenses:provision, owner + billing-admin): buy/resize/cancel.
 *
 * Talks to the tenant-scoped /tenants/:tenantId/licenses API - never the
 * super-admin license routes.
 */
export function LicensesPage() {
  const { tenantId, can } = useTenant();
  const { toast } = useToast();

  const canManage = can('licenses:manage');
  const canProvision = can('licenses:provision');

  const [subscriptions, setSubscriptions] = React.useState<TenantSubscription[]>([]);
  const [members, setMembers] = React.useState<MemberWithLicenses[]>([]);
  const [availableTypes, setAvailableTypes] = React.useState<AvailableLicenseType[]>([]);
  const [totals, setTotals] = React.useState({ owned: 0, assigned: 0 });
  const [isLoading, setIsLoading] = React.useState(true);

  const [manageSub, setManageSub] = React.useState<TenantSubscription | null>(null);
  const [provisionOpen, setProvisionOpen] = React.useState(false);
  const [resizeSub, setResizeSub] = React.useState<TenantSubscription | null>(null);
  const [cancelSub, setCancelSub] = React.useState<TenantSubscription | null>(null);
  const [isCancelling, setIsCancelling] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      setIsLoading(true);
      const [overview, memberData, types] = await Promise.all([
        tenantApi.getLicenseOverview(tenantId),
        canManage ? tenantApi.getMembersWithLicenses(tenantId) : Promise.resolve([]),
        canProvision ? tenantApi.getAvailableLicenseTypes(tenantId) : Promise.resolve([]),
      ]);
      setSubscriptions(overview?.subscriptions ?? []);
      setTotals({
        owned: overview?.totalSeatsOwned ?? 0,
        assigned: overview?.totalSeatsAssigned ?? 0,
      });
      setMembers(memberData ?? []);
      setAvailableTypes(types ?? []);
    } catch (err: any) {
      toast({ variant: 'error', title: 'Error', message: errMessage(err, 'Failed to load licenses') });
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, canManage, canProvision, toast]);

  React.useEffect(() => {
    load();
  }, [load]);

  const handleCancel = async () => {
    if (!cancelSub) return;
    try {
      setIsCancelling(true);
      await tenantApi.cancelSubscription(tenantId, cancelSub.id);
      setCancelSub(null);
      await load();
      toast({ variant: 'success', title: 'Subscription canceled', message: 'The subscription was canceled.' });
    } catch (err: any) {
      toast({ variant: 'error', title: 'Error', message: errMessage(err, 'Failed to cancel subscription') });
    } finally {
      setIsCancelling(false);
    }
  };

  const formatDate = (value: string | null) => {
    if (!value) return '—';
    const d = new Date(value);
    return Number.isNaN(d.getTime())
      ? '—'
      : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const available = Math.max(0, totals.owned - totals.assigned);
  const utilization = totals.owned > 0 ? Math.round((totals.assigned / totals.owned) * 100) : 0;

  const seatCell = (sub: TenantSubscription) => {
    const pct = sub.quantityPurchased > 0
      ? Math.min(100, Math.round((sub.quantityAssigned / sub.quantityPurchased) * 100))
      : 0;
    const full = sub.quantityPurchased > 0 && sub.quantityAssigned >= sub.quantityPurchased;
    return (
      <div className="min-w-[9rem] space-y-1.5">
        <div className="flex items-baseline justify-between text-xs">
          <span className="font-medium text-foreground">
            {sub.quantityAssigned}/{sub.quantityPurchased}
          </span>
          <span className="text-muted-foreground">{sub.quantityAvailable} free</span>
        </div>
        <Progress
          value={pct}
          className="h-1.5"
          indicatorClassName={full ? 'bg-warning' : 'bg-primary'}
        />
      </div>
    );
  };

  const columns: Column<TenantSubscription>[] = [
    {
      header: 'Application',
      accessor: 'applicationName',
      cell: (value, row) => (
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15">
            <KeyRound className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="font-medium text-foreground">{value}</p>
            <div className="mt-0.5 flex items-center gap-2">
              <span className="truncate text-xs text-muted-foreground">{row.licenseTypeName}</span>
              <Badge variant="secondary" className="px-1.5 py-0 text-[10px] uppercase tracking-wide">
                {MODE_LABEL[row.licensingMode]}
              </Badge>
            </div>
          </div>
        </div>
      ),
    },
    { header: 'Seats', accessor: 'id', cell: (_v, row) => seatCell(row) },
    {
      header: 'Status',
      accessor: 'status',
      cell: (value) => (
        <Badge variant={STATUS_VARIANT[value] ?? 'outline'}>{value.replace('_', ' ')}</Badge>
      ),
    },
    { header: 'Renews', accessor: 'currentPeriodEnd', cell: (value) => formatDate(value) },
    {
      header: '',
      accessor: 'id',
      className: 'text-right',
      cell: (_v, row) => (
        <div className="flex items-center justify-end gap-1">
          {canManage && (
            <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setManageSub(row)}>
              <Users2 className="h-4 w-4" />
              Seats
            </Button>
          )}
          {canProvision && (
            <>
              <Button variant="ghost" size="sm" title="Resize seats" onClick={() => setResizeSub(row)}>
                <Pencil className="h-4 w-4 text-blue-400" />
              </Button>
              {row.status !== 'CANCELED' && (
                <Button variant="ghost" size="sm" title="Cancel subscription" onClick={() => setCancelSub(row)}>
                  <Ban className="h-4 w-4 text-destructive" />
                </Button>
              )}
            </>
          )}
        </div>
      ),
    },
  ];

  const showEmpty = !isLoading && subscriptions.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Licenses</h1>
          <p className="text-muted-foreground">
            Manage subscriptions and assign seats to your members.
          </p>
        </div>
        {canProvision && (
          <Button onClick={() => setProvisionOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Provision licenses
          </Button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatsCard
          title="Seats owned"
          value={totals.owned}
          isLoading={isLoading}
          subtitle="across all subscriptions"
          icon={<KeyRound className="h-5 w-5 text-primary" />}
        />
        <StatsCard
          title="Seats assigned"
          value={totals.assigned}
          isLoading={isLoading}
          subtitle={`${utilization}% utilization`}
          icon={<UserCheck className="h-5 w-5 text-green-400" />}
        />
        <StatsCard
          title="Seats available"
          value={available}
          isLoading={isLoading}
          subtitle="ready to assign"
          icon={<Ticket className="h-5 w-5 text-blue-400" />}
        />
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 border-b border-white/10">
          <div>
            <CardTitle className="text-lg">Subscriptions</CardTitle>
            <CardDescription>Your organization's license inventory.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {showEmpty ? (
            <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <KeyRound className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="font-medium text-foreground">No subscriptions yet</p>
                <p className="text-sm text-muted-foreground">
                  {canProvision
                    ? 'Provision licenses to start assigning seats to members.'
                    : 'Ask an owner or billing admin to provision licenses.'}
                </p>
              </div>
              {canProvision && (
                <Button onClick={() => setProvisionOpen(true)} className="mt-1 gap-2">
                  <Plus className="h-4 w-4" />
                  Provision licenses
                </Button>
              )}
            </div>
          ) : (
            <Table data={subscriptions} columns={columns} isLoading={isLoading} />
          )}
        </CardContent>
      </Card>

      {manageSub && (
        <ManageSeatsModal
          tenantId={tenantId}
          subscription={manageSub}
          members={members}
          onClose={() => setManageSub(null)}
          onChanged={load}
        />
      )}

      {(provisionOpen || resizeSub) && (
        <ProvisionLicenseModal
          tenantId={tenantId}
          availableTypes={availableTypes}
          resizeSubscription={resizeSub}
          onClose={() => {
            setProvisionOpen(false);
            setResizeSub(null);
          }}
          onSaved={load}
        />
      )}

      <Modal
        isOpen={!!cancelSub}
        onClose={() => setCancelSub(null)}
        title="Cancel subscription"
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCancelSub(null)}>
              Keep it
            </Button>
            <Button variant="destructive" disabled={isCancelling} onClick={handleCancel}>
              {isCancelling ? 'Cancelling...' : 'Cancel subscription'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-muted-foreground">
            This releases all assigned seats and revokes access for its holders. This cannot be undone.
          </p>
          {cancelSub && (
            <div className="flex items-center gap-2 rounded-md border border-white/10 bg-white/5 p-4">
              <XCircle className="h-4 w-4 text-destructive" />
              <span className="font-medium text-foreground">
                {cancelSub.applicationName} — {cancelSub.licenseTypeName}
              </span>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
