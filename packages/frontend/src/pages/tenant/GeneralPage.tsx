import * as React from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { tenantApi } from '@/lib/api';
import { useTenant } from '@/contexts/TenantContext';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { useToast } from '@/components/ui/Toast';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/Select';

type MfaPolicy = 'DISABLED' | 'OPTIONAL' | 'ENCOURAGED' | 'REQUIRED';

const MFA_OPTIONS: { value: MfaPolicy; label: string; description: string }[] = [
  { value: 'DISABLED', label: 'Disabled', description: 'Members cannot enable MFA.' },
  { value: 'OPTIONAL', label: 'Optional', description: 'Members may enable MFA if they choose.' },
  { value: 'ENCOURAGED', label: 'Encouraged', description: 'Members are prompted to enable MFA.' },
  { value: 'REQUIRED', label: 'Required', description: 'Members must set up MFA to keep access.' },
];

const errMessage = (err: any, fallback: string) =>
  err?.response?.data?.message || err?.message || fallback;

/**
 * GeneralPage - Core organization settings: name, slug, and MFA policy.
 * Uses the tenant-scoped, permission-guarded endpoints (tenant:manage).
 */
export function GeneralPage() {
  const { tenantId, refresh, can } = useTenant();
  const { toast } = useToast();

  const canManage = can('tenant:manage');

  const [isLoading, setIsLoading] = React.useState(true);

  // Organization details
  const [name, setName] = React.useState('');
  const [slug, setSlug] = React.useState('');
  const [savedName, setSavedName] = React.useState('');
  const [savedSlug, setSavedSlug] = React.useState('');
  const [savingOrg, setSavingOrg] = React.useState(false);

  // MFA policy
  const [policy, setPolicy] = React.useState<MfaPolicy>('OPTIONAL');
  const [gracePeriodDays, setGracePeriodDays] = React.useState(7);
  const [savedPolicy, setSavedPolicy] = React.useState<MfaPolicy>('OPTIONAL');
  const [savedGrace, setSavedGrace] = React.useState(7);
  const [savingMfa, setSavingMfa] = React.useState(false);
  // How many ACTIVE (human) members have no MFA — drives the REQUIRED-policy
  // warning so admins see the blast radius before saving. null = not loaded.
  const [unenrolledCount, setUnenrolledCount] = React.useState<number | null>(null);

  const load = React.useCallback(async () => {
    try {
      setIsLoading(true);
      const [tenant, mfa] = await Promise.all([
        tenantApi.getTenant(tenantId),
        tenantApi.getMfaPolicy(tenantId),
      ]);

      // Non-blocking: the warning is best-effort; the editor must still work
      // if the stats call fails.
      tenantApi
        .getMfaStats(tenantId)
        .then((stats) => setUnenrolledCount(stats.unenrolledActiveMemberCount))
        .catch(() => setUnenrolledCount(null));
      setName(tenant.name ?? '');
      setSlug(tenant.slug ?? '');
      setSavedName(tenant.name ?? '');
      setSavedSlug(tenant.slug ?? '');

      const p = (mfa.policy ?? 'OPTIONAL') as MfaPolicy;
      const g = mfa.gracePeriodDays ?? 7;
      setPolicy(p);
      setGracePeriodDays(g);
      setSavedPolicy(p);
      setSavedGrace(g);
    } catch (err: any) {
      toast({ variant: 'error', title: 'Error', message: errMessage(err, 'Failed to load settings') });
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, toast]);

  React.useEffect(() => {
    load();
  }, [load]);

  const orgDirty = name.trim() !== savedName || slug.trim() !== savedSlug;
  const mfaDirty = policy !== savedPolicy || (policy === 'REQUIRED' && gracePeriodDays !== savedGrace);

  const saveOrg = async () => {
    const trimmedName = name.trim();
    const trimmedSlug = slug.trim();
    if (trimmedName.length < 2) {
      toast({ variant: 'error', title: 'Invalid name', message: 'Name must be at least 2 characters.' });
      return;
    }
    if (!/^[a-z0-9-]+$/.test(trimmedSlug) || trimmedSlug.length < 2) {
      toast({ variant: 'error', title: 'Invalid slug', message: 'Use lowercase letters, numbers, and hyphens only.' });
      return;
    }
    try {
      setSavingOrg(true);
      await tenantApi.updateTenant(tenantId, { name: trimmedName, slug: trimmedSlug });
      setSavedName(trimmedName);
      setSavedSlug(trimmedSlug);
      await refresh(); // keep header/sidebar name in sync
      toast({ variant: 'success', title: 'Saved', message: 'Organization details updated.' });
    } catch (err: any) {
      toast({ variant: 'error', title: 'Error', message: errMessage(err, 'Failed to update organization') });
    } finally {
      setSavingOrg(false);
    }
  };

  const saveMfa = async () => {
    try {
      setSavingMfa(true);
      await tenantApi.updateMfaPolicy(tenantId, {
        policy,
        ...(policy === 'REQUIRED' ? { gracePeriodDays } : {}),
      });
      setSavedPolicy(policy);
      setSavedGrace(gracePeriodDays);
      toast({ variant: 'success', title: 'Saved', message: 'MFA policy updated.' });
    } catch (err: any) {
      toast({ variant: 'error', title: 'Error', message: errMessage(err, 'Failed to update MFA policy') });
    } finally {
      setSavingMfa(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">General</h1>
        <p className="text-muted-foreground">Manage your organization's identity and security policy.</p>
      </div>

      {/* Organization details */}
      <Card>
        <CardHeader>
          <CardTitle>Organization details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="org-name">Name</Label>
            <Input id="org-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Inc." disabled={!canManage} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="org-slug">Slug</Label>
            <Input
              id="org-slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
              placeholder="acme"
              disabled={!canManage}
            />
            <p className="text-xs text-muted-foreground">
              Lowercase letters, numbers, and hyphens. Used to identify your org (e.g. in URLs).
            </p>
          </div>
          {canManage && (
            <div className="flex justify-end">
              <Button onClick={saveOrg} disabled={!orgDirty || savingOrg}>
                {savingOrg ? 'Saving...' : 'Save changes'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* MFA policy */}
      <Card>
        <CardHeader>
          <CardTitle>Multi-factor authentication</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Policy</Label>
            <Select value={policy} onValueChange={(v) => setPolicy(v as MfaPolicy)} disabled={!canManage}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MFA_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {MFA_OPTIONS.find((o) => o.value === policy)?.description}
            </p>
          </div>

          {policy === 'REQUIRED' && (
            <div className="space-y-2">
              <Label htmlFor="grace">Grace period (days)</Label>
              <Input
                id="grace"
                type="number"
                min={0}
                max={90}
                value={gracePeriodDays}
                onChange={(e) => setGracePeriodDays(Math.max(0, Number(e.target.value) || 0))}
                className="max-w-[8rem]"
                disabled={!canManage}
              />
              <p className="text-xs text-muted-foreground">
                How long existing members have to set up MFA before losing access.
              </p>
            </div>
          )}

          {policy === 'REQUIRED' && unenrolledCount !== null && unenrolledCount > 0 && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800">
              <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <h4 className="text-sm font-medium text-amber-800 dark:text-amber-200">
                  {unenrolledCount} member{unenrolledCount === 1 ? ' is' : 's are'} not enrolled in MFA
                </h4>
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  {gracePeriodDays > 0
                    ? `They will be interrupted at next sign-in to set up MFA, and locked out after ${new Date(Date.now() + gracePeriodDays * 86400000).toLocaleDateString()} if they haven't enrolled.`
                    : 'They will be interrupted at next sign-in and must set up MFA before they can continue.'}
                </p>
              </div>
            </div>
          )}

          {canManage && (
            <div className="flex justify-end">
              <Button onClick={saveMfa} disabled={!mfaDirty || savingMfa}>
                {savingMfa ? 'Saving...' : 'Save policy'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
