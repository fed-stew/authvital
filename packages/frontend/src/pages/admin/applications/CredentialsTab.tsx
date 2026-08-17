import * as React from 'react';
import { Plus } from 'lucide-react';
import { superAdminApi } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { useToast } from '@/components/ui/Toast';
import type { AppWithClients, ClientType } from '@/types';
import {
  emptyCredentialState,
  credentialStateToInput,
  validateCredential,
  type CredentialFormState,
} from './CredentialForm';
import type { TenantOption } from './CredentialsTab.shared';
import { CredentialCard, CredentialsEmptyState } from './CredentialCard';
import { CredentialFormModal } from './CredentialsTab.modals';

// =============================================================================
// CREDENTIALS TAB
// =============================================================================
// Surfaces the container's credentials[]. Enforces the <=1 SPA + <=1 MACHINE
// invariant in the UI: "Add credential" only offers a type the app lacks.
// =============================================================================

interface CredentialsTabProps {
  app: AppWithClients;
  appId: string;
  onRefresh: () => void;
}

export function CredentialsTab({ app, appId, onRefresh }: CredentialsTabProps) {
  const { toast } = useToast();
  const clients = app.clients ?? [];

  const hasSpa = clients.some((c) => c.type === 'SPA');
  const hasMachine = clients.some((c) => c.type === 'MACHINE');
  const bothExist = hasSpa && hasMachine;
  const missingType: ClientType | null = !hasSpa ? 'SPA' : !hasMachine ? 'MACHINE' : null;

  // Tenants for MACHINE grant pickers (loaded once, shared across cards).
  const [tenantOptions, setTenantOptions] = React.useState<TenantOption[]>([]);
  React.useEffect(() => {
    if (!hasMachine) return;
    superAdminApi
      .getAllTenants()
      .then((data) => setTenantOptions(data?.tenants ?? []))
      .catch((err: any) => console.error('Failed to load tenants:', err));
  }, [hasMachine]);

  // --- Add-credential modal --------------------------------------------------
  const [isAddOpen, setIsAddOpen] = React.useState(false);
  const [addType, setAddType] = React.useState<ClientType>('SPA');
  const [addState, setAddState] = React.useState<CredentialFormState>(emptyCredentialState('SPA'));
  const [addError, setAddError] = React.useState<string | null>(null);
  const [isAdding, setIsAdding] = React.useState(false);

  // Open the add-credential form locked to a specific type. When no type is
  // passed we fall back to whichever type the app is still missing (header CTA).
  const openAdd = (type?: ClientType) => {
    const resolved = type ?? missingType;
    if (!resolved) return;
    setAddType(resolved);
    setAddState(emptyCredentialState(resolved));
    setAddError(null);
    setIsAddOpen(true);
  };

  const submitAdd = async () => {
    const err = validateCredential(addState);
    if (err) {
      setAddError(err);
      return;
    }
    try {
      setIsAdding(true);
      await superAdminApi.addClient(appId, credentialStateToInput(addState));
      toast({ variant: 'success', title: 'Credential added', message: `${addState.type} credential created.` });
      setIsAddOpen(false);
      onRefresh();
    } catch (e: any) {
      toast({
        variant: 'error',
        title: 'Error',
        message: e?.response?.data?.message || e?.message || 'Failed to add credential',
      });
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Credentials</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              An app is a container; each OAuth credential below is a property of it. An app may hold at most
              one SPA and one MACHINE credential -- e.g. a full-stack app registers a SPA credential for user
              login AND a MACHINE credential for server-to-server calls.
            </p>
          </div>
          <div title={bothExist ? 'This app already has one SPA and one MACHINE credential.' : undefined}>
            <Button onClick={() => openAdd()} disabled={bothExist} className="gap-2 whitespace-nowrap">
              <Plus className="h-4 w-4" />
              Add credential
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {clients.length === 0 ? (
            <CredentialsEmptyState onAdd={openAdd} />
          ) : (
            clients.map((client) => (
              <CredentialCard
                key={client.id}
                appId={appId}
                client={client}
                tenantOptions={tenantOptions}
                onChanged={onRefresh}
              />
            ))
          )}
        </CardContent>
      </Card>

      {/* Add-credential modal */}
      <CredentialFormModal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        title={`Add ${addType} credential`}
        submitLabel="Add credential"
        submittingLabel="Adding..."
        isSubmitting={isAdding}
        onSubmit={submitAdd}
        value={addState}
        onChange={(next) => {
          setAddState(next);
          if (addError) setAddError(null);
        }}
        error={addError}
      />
    </div>
  );
}
