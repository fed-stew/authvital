import * as React from 'react';
import { KeyRound, Trash2, Plus } from 'lucide-react';
import { superAdminApi } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import type { ApplicationClient, M2mTenantGrant } from '@/types';
import type { TenantOption } from './CredentialsTab.shared';

// =============================================================================
// TenantGrantsManager -- M2M authz glance + per-credential tenant grant mgmt
// =============================================================================
// Renders a MACHINE credential's client-secret/scope glance plus the authorized
// tenant list with add/revoke controls.
// =============================================================================

export function TenantGrantsManager({
  appId,
  client,
  tenantOptions,
}: {
  appId: string;
  client: ApplicationClient;
  tenantOptions: TenantOption[];
}) {
  const { toast } = useToast();
  const [grants, setGrants] = React.useState<M2mTenantGrant[]>([]);
  const [selectedTenantId, setSelectedTenantId] = React.useState('');
  const [isBusy, setIsBusy] = React.useState(false);
  const trustedAll = client.m2mTrustedAllTenants;

  const loadGrants = React.useCallback(async () => {
    try {
      const data = await superAdminApi.listClientTenantGrants(appId, client.clientId);
      setGrants(data);
    } catch (e: any) {
      toast({
        variant: 'error',
        title: 'Error',
        message: e?.response?.data?.message || e?.message || 'Failed to load tenant grants',
      });
    }
  }, [appId, client.clientId, toast]);

  React.useEffect(() => {
    loadGrants();
  }, [loadGrants]);

  const addGrant = async () => {
    if (!selectedTenantId) return;
    try {
      setIsBusy(true);
      await superAdminApi.addClientTenantGrant(appId, client.clientId, selectedTenantId);
      setSelectedTenantId('');
      await loadGrants();
      toast({ variant: 'success', title: 'Granted', message: 'Tenant access granted' });
    } catch (e: any) {
      toast({
        variant: 'error',
        title: 'Error',
        message: e?.response?.data?.message || e?.message || 'Failed to grant tenant access',
      });
    } finally {
      setIsBusy(false);
    }
  };

  const removeGrant = async (tenantId: string) => {
    try {
      await superAdminApi.removeClientTenantGrant(appId, client.clientId, tenantId);
      await loadGrants();
      toast({ variant: 'success', title: 'Revoked', message: 'Tenant access revoked' });
    } catch (e: any) {
      toast({
        variant: 'error',
        title: 'Error',
        message: e?.response?.data?.message || e?.message || 'Failed to revoke tenant access',
      });
    }
  };

  const grantableTenants = tenantOptions.filter((t) => !grants.some((g) => g.tenantId === t.id));

  return (
    <div className="space-y-4">
      {/* Authz glance */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-white/10 bg-white/5 p-3">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <KeyRound className="h-3.5 w-3.5" />
            Client secret
          </div>
          <p className="mt-1 text-sm text-foreground">
            {client.hasClientSecret ? 'Set (rotate to reveal a new one)' : 'Not set'}
          </p>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 p-3">
          <div className="text-xs font-medium text-muted-foreground">Tenant access</div>
          <p className="mt-1 text-sm text-foreground">
            {trustedAll ? 'Trusted for all tenants' : `${grants.length} tenant grant(s)`}
          </p>
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Allowed scopes</label>
        {client.m2mAllowedScopes.length === 0 ? (
          <p className="text-sm text-muted-foreground">None (empty-scope tokens - denied everywhere).</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {client.m2mAllowedScopes.map((s) => (
              <code key={s} className="rounded bg-white/10 px-2 py-1 text-xs font-mono text-foreground/90">
                {s}
              </code>
            ))}
          </div>
        )}
      </div>

      {/* Tenant grants */}
      <div className={`space-y-2 ${trustedAll ? 'opacity-50' : ''}`}>
        <label className="text-xs font-medium text-muted-foreground">Authorized tenants</label>
        {trustedAll && (
          <p className="text-xs text-yellow-300/90">
            Ignored while "Trusted for all tenants" is on (edit the credential to change).
          </p>
        )}
        <div className="rounded-lg border border-white/10 overflow-hidden">
          {grants.length > 0 ? (
            <div className="divide-y divide-white/10">
              {grants.map((grant) => (
                <div key={grant.id} className="flex items-center gap-2 p-3 bg-card hover:bg-white/5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-foreground">{grant.tenant.name}</p>
                    <p className="truncate font-mono text-xs text-muted-foreground">{grant.tenant.slug}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => removeGrant(grant.tenantId)}
                    disabled={trustedAll}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4 text-center text-sm text-muted-foreground">No tenants granted yet</div>
          )}

          <div className="flex items-center gap-2 border-t border-white/10 bg-secondary/30 p-3">
            <select
              value={selectedTenantId}
              onChange={(e) => setSelectedTenantId(e.target.value)}
              disabled={trustedAll || grantableTenants.length === 0}
              className="flex-1 rounded-md border border-white/10 bg-card px-3 py-2 text-sm text-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/50 disabled:opacity-50"
            >
              <option value="">
                {grantableTenants.length === 0 ? 'No tenants available' : 'Select a tenant...'}
              </option>
              {grantableTenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.slug})
                </option>
              ))}
            </select>
            <Button
              size="sm"
              onClick={addGrant}
              disabled={!selectedTenantId || isBusy || trustedAll}
              className="gap-1"
            >
              <Plus className="h-4 w-4" />
              Add
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
