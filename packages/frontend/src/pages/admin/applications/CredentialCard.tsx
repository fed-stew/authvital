import * as React from 'react';
import { Copy, Trash2, RefreshCw, Pencil, Globe, Server, KeyRound } from 'lucide-react';
import { superAdminApi } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/Toast';
import type { ApplicationClient, ClientType } from '@/types';
import {
  credentialStateFromClient,
  credentialStateToUpdate,
  validateCredential,
  type CredentialFormState,
} from './CredentialForm';
import { useCopy, type TenantOption } from './CredentialsTab.shared';
import {
  CredentialFormModal,
  RotatedSecretModal,
  DeleteCredentialModal,
} from './CredentialsTab.modals';
import { TenantGrantsManager } from './TenantGrantsManager';

// =============================================================================
// CredentialsEmptyState -- guided first-run state for a zero-credential app
// =============================================================================
// Rendered when clients[] is empty (e.g. right after minimal app creation).
// Offers the two normal add-credential CTAs -- one per credential type -- each
// opening the existing add form locked to that type. NO BFF one-click here.
// =============================================================================

export function CredentialsEmptyState({ onAdd }: { onAdd: (type: ClientType) => void }) {
  return (
    <div className="flex flex-col items-center gap-5 rounded-lg border border-dashed border-white/15 bg-white/[0.02] px-6 py-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-primary">
        <KeyRound className="h-6 w-6" />
      </div>
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-foreground">This app has no credentials yet.</h3>
        <p className="text-sm text-muted-foreground">Add one to start using it.</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button onClick={() => onAdd('SPA')} className="gap-2">
          <Globe className="h-4 w-4" />
          + User login (SPA)
        </Button>
        <Button onClick={() => onAdd('MACHINE')} variant="outline" className="gap-2">
          <Server className="h-4 w-4" />
          + Server-to-server (MACHINE)
        </Button>
      </div>

      <p className="max-w-md text-xs text-muted-foreground">
        Full-stack app? Add both -- a SPA credential for login and a MACHINE credential for backend calls
        (the BFF pattern).
      </p>
    </div>
  );
}

// =============================================================================
// CredentialCard -- one credential row with its type-relevant actions
// =============================================================================

interface CredentialCardProps {
  appId: string;
  client: ApplicationClient;
  tenantOptions: TenantOption[];
  onChanged: () => void;
}

export function CredentialCard({ appId, client, tenantOptions, onChanged }: CredentialCardProps) {
  const { toast } = useToast();
  const copy = useCopy();
  const isMachine = client.type === 'MACHINE';

  // Edit modal
  const [isEditOpen, setIsEditOpen] = React.useState(false);
  const [editState, setEditState] = React.useState<CredentialFormState>(credentialStateFromClient(client));
  const [editError, setEditError] = React.useState<string | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);

  // Rotate-secret modal (one-time plaintext)
  const [rotatedSecret, setRotatedSecret] = React.useState<string | null>(null);
  const [isRotating, setIsRotating] = React.useState(false);

  // Delete modal
  const [isDeleteOpen, setIsDeleteOpen] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);

  const openEdit = () => {
    setEditState(credentialStateFromClient(client));
    setEditError(null);
    setIsEditOpen(true);
  };

  const saveEdit = async () => {
    const err = validateCredential(editState);
    if (err) {
      setEditError(err);
      return;
    }
    try {
      setIsSaving(true);
      await superAdminApi.updateClient(appId, client.clientId, credentialStateToUpdate(editState));
      toast({ variant: 'success', title: 'Saved', message: 'Credential updated.' });
      setIsEditOpen(false);
      onChanged();
    } catch (e: any) {
      toast({
        variant: 'error',
        title: 'Error',
        message: e?.response?.data?.message || e?.message || 'Failed to update credential',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const rotate = async () => {
    if (!confirm('Rotate this secret? The current secret is invalidated immediately and cannot be recovered.')) {
      return;
    }
    try {
      setIsRotating(true);
      const result = await superAdminApi.rotateClientSecret(appId, client.clientId);
      setRotatedSecret(result.clientSecret);
    } catch (e: any) {
      toast({
        variant: 'error',
        title: 'Error',
        message: e?.response?.data?.message || e?.message || 'Failed to rotate secret',
      });
    } finally {
      setIsRotating(false);
    }
  };

  const remove = async () => {
    try {
      setIsDeleting(true);
      await superAdminApi.deleteClient(appId, client.clientId);
      toast({ variant: 'success', title: 'Deleted', message: 'Credential removed.' });
      setIsDeleteOpen(false);
      onChanged();
    } catch (e: any) {
      toast({
        variant: 'error',
        title: 'Error',
        message: e?.response?.data?.message || e?.message || 'Failed to delete credential',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="rounded-lg border border-white/10 bg-card">
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
            {isMachine ? <Server className="h-4 w-4" /> : <Globe className="h-4 w-4" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <Badge
                className={
                  isMachine
                    ? 'bg-blue-500/20 text-blue-100 border-blue-500/40'
                    : 'bg-purple-500/20 text-purple-100 border-purple-500/40'
                }
              >
                {client.type}
              </Badge>
              {!client.isActive && (
                <Badge className="bg-gray-500/20 text-gray-100 border-gray-500/40">Inactive</Badge>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {isMachine
                ? 'Confidential client - client_credentials flow'
                : 'Public client - PKCE, no secret'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={openEdit} className="gap-1">
            <Pencil className="h-4 w-4" />
            Edit
          </Button>
          {isMachine && (
            <Button variant="ghost" size="sm" onClick={rotate} disabled={isRotating} className="gap-1">
              <RefreshCw className={`h-4 w-4 ${isRotating ? 'animate-spin' : ''}`} />
              Rotate secret
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsDeleteOpen(true)}
            className="gap-1 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="space-y-4 p-4">
        {/* Client ID */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Client ID</label>
          <div className="flex gap-2">
            <Input value={client.clientId} readOnly className="bg-white/5 font-mono text-sm" />
            <Button variant="outline" size="sm" onClick={() => copy('Client ID', client.clientId)}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Type-relevant summary */}
        {isMachine ? (
          <TenantGrantsManager appId={appId} client={client} tenantOptions={tenantOptions} />
        ) : (
          <SpaSummary client={client} />
        )}
      </div>

      {/* Edit modal */}
      <CredentialFormModal
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        title={`Edit ${client.type} credential`}
        submitLabel="Save changes"
        submittingLabel="Saving..."
        isSubmitting={isSaving}
        onSubmit={saveEdit}
        value={editState}
        onChange={(next) => {
          setEditState(next);
          if (editError) setEditError(null);
        }}
        error={editError}
      />

      {/* Rotate-secret one-time modal */}
      <RotatedSecretModal
        secret={rotatedSecret}
        onClose={() => setRotatedSecret(null)}
        onCopy={(value) => copy('Client secret', value)}
      />

      {/* Delete confirm modal */}
      <DeleteCredentialModal
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        onConfirm={remove}
        isDeleting={isDeleting}
        clientType={client.type}
        clientId={client.clientId}
      />
    </div>
  );
}

// =============================================================================
// SpaSummary -- read-only glance at a SPA credential's URIs
// =============================================================================

export function SpaSummary({ client }: { client: ApplicationClient }) {
  const uris = client.redirectUris ?? [];
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">Redirect URIs</label>
      {uris.length === 0 ? (
        <p className="text-sm text-muted-foreground">None configured. Use Edit to add at least one.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {uris.map((u) => (
            <code
              key={u}
              className="rounded bg-white/10 px-2 py-1 text-xs font-mono text-foreground/90"
              title={u}
            >
              {u}
            </code>
          ))}
        </div>
      )}
    </div>
  );
}
