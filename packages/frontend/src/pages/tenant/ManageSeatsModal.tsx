import * as React from 'react';
import { Check, Search } from 'lucide-react';
import { tenantApi } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Progress } from '@/components/ui/Progress';
import { useToast } from '@/components/ui/Toast';
import type { TenantSubscription, MemberWithLicenses } from './LicensesPage';
import { errMessage } from './LicensesPage';

interface ManageSeatsModalProps {
  tenantId: string;
  subscription: TenantSubscription;
  members: MemberWithLicenses[];
  onClose: () => void;
  onChanged: () => Promise<void> | void;
}

const memberName = (m: MemberWithLicenses) => {
  const full = [m.user.givenName, m.user.familyName].filter(Boolean).join(' ').trim();
  return full || m.user.email;
};

const initials = (m: MemberWithLicenses) => {
  const combined = `${m.user.givenName?.[0] ?? ''}${m.user.familyName?.[0] ?? ''}`.trim();
  return (combined || m.user.email[0] || '?').toUpperCase();
};

/**
 * ManageSeatsModal - assign/revoke/switch seats for ONE subscription
 * (a specific application + license type). Each member row reflects whether
 * they already hold this app's license and offers the right action.
 */
export function ManageSeatsModal({
  tenantId,
  subscription,
  members,
  onClose,
  onChanged,
}: ManageSeatsModalProps) {
  const { toast } = useToast();
  const [query, setQuery] = React.useState('');
  const [busyUserId, setBusyUserId] = React.useState<string | null>(null);

  const noSeatsLeft = subscription.quantityAvailable <= 0;
  const seatPct = subscription.quantityPurchased > 0
    ? Math.min(100, Math.round((subscription.quantityAssigned / subscription.quantityPurchased) * 100))
    : 0;

  const filtered = members.filter((m) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      m.user.email.toLowerCase().includes(q) ||
      memberName(m).toLowerCase().includes(q)
    );
  });

  // The license (if any) this member holds for THIS subscription's application.
  const appLicense = (m: MemberWithLicenses) =>
    m.licenses.find((l) => l.applicationId === subscription.applicationId);

  const run = async (userId: string, action: () => Promise<unknown>, success: string) => {
    try {
      setBusyUserId(userId);
      await action();
      await onChanged();
      toast({ variant: 'success', title: 'Done', message: success });
    } catch (err: any) {
      toast({ variant: 'error', title: 'Error', message: errMessage(err, 'Action failed') });
    } finally {
      setBusyUserId(null);
    }
  };

  const grant = (m: MemberWithLicenses) =>
    run(
      m.user.id,
      () =>
        tenantApi.grantLicense(tenantId, {
          userId: m.user.id,
          applicationId: subscription.applicationId,
          licenseTypeId: subscription.licenseTypeId,
        }),
      `Granted ${subscription.licenseTypeName} to ${memberName(m)}`,
    );

  const revoke = (m: MemberWithLicenses) =>
    run(
      m.user.id,
      () =>
        tenantApi.revokeLicense(tenantId, {
          userId: m.user.id,
          applicationId: subscription.applicationId,
        }),
      `Revoked license from ${memberName(m)}`,
    );

  const switchType = (m: MemberWithLicenses) =>
    run(
      m.user.id,
      () =>
        tenantApi.changeLicense(tenantId, {
          userId: m.user.id,
          applicationId: subscription.applicationId,
          newLicenseTypeId: subscription.licenseTypeId,
        }),
      `Switched ${memberName(m)} to ${subscription.licenseTypeName}`,
    );

  const rowAction = (m: MemberWithLicenses) => {
    const held = appLicense(m);
    const busy = busyUserId === m.user.id;

    if (held?.licenseTypeId === subscription.licenseTypeId) {
      return (
        <div className="flex items-center gap-2">
          <Badge className="border-green-500/50 bg-green-500/20 text-green-400">
            <Check className="mr-1 h-3 w-3" />
            Assigned
          </Badge>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => revoke(m)}>
            {busy ? '...' : 'Revoke'}
          </Button>
        </div>
      );
    }

    if (held) {
      return (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">On {held.licenseTypeName}</span>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => switchType(m)}>
            {busy ? '...' : 'Switch here'}
          </Button>
        </div>
      );
    }

    return (
      <Button
        variant="outline"
        size="sm"
        disabled={busy || noSeatsLeft}
        title={noSeatsLeft ? 'No seats available - resize the subscription first' : undefined}
        onClick={() => grant(m)}
      >
        {busy ? '...' : 'Assign'}
      </Button>
    );
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Manage seats — ${subscription.applicationName}`}
      size="lg"
      footer={
        <div className="flex justify-end">
          <Button variant="outline" onClick={onClose}>
            Done
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="space-y-2 rounded-lg border border-white/10 bg-white/5 p-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-foreground">{subscription.licenseTypeName}</span>
            {noSeatsLeft ? (
              <Badge variant="warning" className="px-1.5 py-0 text-[10px]">Fully allocated</Badge>
            ) : (
              <span className="text-xs text-muted-foreground">
                {subscription.quantityAvailable} of {subscription.quantityPurchased} free
              </span>
            )}
          </div>
          <Progress
            value={seatPct}
            className="h-1.5"
            indicatorClassName={noSeatsLeft ? 'bg-warning' : 'bg-primary'}
          />
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search members..."
            className="bg-card pl-9"
          />
        </div>

        <div className="max-h-80 space-y-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No members found</p>
          ) : (
            filtered.map((m) => (
              <div
                key={m.user.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 transition-colors hover:border-white/20"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                    {initials(m)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-foreground">{memberName(m)}</p>
                      {m.membership.status !== 'ACTIVE' && (
                        <Badge
                          variant={m.membership.status === 'SUSPENDED' ? 'destructive' : 'warning'}
                          className="px-1.5 py-0 text-[10px]"
                        >
                          {m.membership.status}
                        </Badge>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{m.user.email}</p>
                  </div>
                </div>
                {rowAction(m)}
              </div>
            ))
          )}
        </div>
      </div>
    </Modal>
  );
}
