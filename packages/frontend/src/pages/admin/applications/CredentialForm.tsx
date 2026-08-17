import * as React from 'react';
import { Plus, Trash2, Globe, Server } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Label } from '@/components/ui/Label';
import { Switch } from '@/components/ui/Switch';
import type {
  ApplicationClient,
  ClientType,
  AddClientInput,
  UpdateClientInput,
} from '@/types';

// =============================================================================
// SHARED CREDENTIAL FORM
// =============================================================================
// A credential (ApplicationClient) is a property OF an app container, not the
// app itself. This component is the single source of truth for editing one
// credential's fields, reused by the create-app modal AND the detail page's
// "add / edit credential" flows so the SPA-vs-MACHINE rules live in ONE place.
// =============================================================================

/** Scopes a MACHINE client_credentials token may carry. */
export const M2M_SCOPES = ['integration:read', 'integration:write'] as const;

/** UI-side working state for a single credential (arrays instead of CSV). */
export interface CredentialFormState {
  type: ClientType;
  // SPA-only
  redirectUris: string[];
  postLogoutRedirectUris: string[];
  allowedWebOrigins: string[];
  initiateLoginUri: string;
  // MACHINE-only
  m2mTrustedAllTenants: boolean;
  m2mAllowedScopes: string[];
}

export function emptyCredentialState(type: ClientType = 'SPA'): CredentialFormState {
  return {
    type,
    redirectUris: [],
    postLogoutRedirectUris: [],
    allowedWebOrigins: [],
    initiateLoginUri: '',
    m2mTrustedAllTenants: false,
    m2mAllowedScopes: [],
  };
}

/** Hydrate the working state from an existing credential (for edit flows). */
export function credentialStateFromClient(client: ApplicationClient): CredentialFormState {
  return {
    type: client.type,
    redirectUris: client.redirectUris ?? [],
    postLogoutRedirectUris: client.postLogoutRedirectUris ?? [],
    allowedWebOrigins: client.allowedWebOrigins ?? [],
    initiateLoginUri: client.initiateLoginUri ?? '',
    m2mTrustedAllTenants: client.m2mTrustedAllTenants ?? false,
    m2mAllowedScopes: client.m2mAllowedScopes ?? [],
  };
}

/**
 * Validate a credential. Returns an error message or null. The ONLY
 * type-conditional invariant: a SPA needs at least one redirect URI; a MACHINE
 * never takes redirect URIs.
 */
export function validateCredential(state: CredentialFormState): string | null {
  if (state.type === 'SPA' && state.redirectUris.filter(Boolean).length === 0) {
    return 'A SPA credential requires at least one redirect URI.';
  }
  return null;
}

/** Convert working state → discriminated AddClientInput for the API. */
export function credentialStateToInput(state: CredentialFormState): AddClientInput {
  if (state.type === 'SPA') {
    return {
      type: 'SPA',
      redirectUris: state.redirectUris.filter(Boolean),
      postLogoutRedirectUris: state.postLogoutRedirectUris.filter(Boolean),
      allowedWebOrigins: state.allowedWebOrigins.filter(Boolean),
      initiateLoginUri: state.initiateLoginUri || undefined,
    };
  }
  return {
    type: 'MACHINE',
    m2mTrustedAllTenants: state.m2mTrustedAllTenants,
    m2mAllowedScopes: state.m2mAllowedScopes,
  };
}

/** Convert working state → PATCH body for an existing credential. */
export function credentialStateToUpdate(state: CredentialFormState): UpdateClientInput {
  if (state.type === 'SPA') {
    return {
      redirectUris: state.redirectUris.filter(Boolean),
      postLogoutRedirectUris: state.postLogoutRedirectUris.filter(Boolean),
      allowedWebOrigins: state.allowedWebOrigins.filter(Boolean),
      initiateLoginUri: state.initiateLoginUri || null,
    };
  }
  return {
    m2mTrustedAllTenants: state.m2mTrustedAllTenants,
    m2mAllowedScopes: state.m2mAllowedScopes,
  };
}

// =============================================================================
// StringListEditor — reusable add/remove list for URIs & origins (DRY)
// =============================================================================

interface StringListEditorProps {
  values: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  disabled?: boolean;
  emptyLabel?: string;
}

function StringListEditor({
  values,
  onChange,
  placeholder,
  disabled,
  emptyLabel = 'None configured',
}: StringListEditorProps) {
  const [draft, setDraft] = React.useState('');

  const add = () => {
    const v = draft.trim();
    if (v && !values.includes(v)) {
      onChange([...values, v]);
      setDraft('');
    }
  };

  return (
    <div className="rounded-lg border border-white/10 overflow-hidden">
      {values.length > 0 ? (
        <div className="divide-y divide-white/10">
          {values.map((uri, index) => (
            <div key={index} className="flex items-center gap-2 p-3 bg-card hover:bg-white/5 transition-colors">
              <code className="flex-1 text-sm font-mono text-foreground/90 truncate" title={uri}>
                {uri}
              </code>
              <Button
                size="sm"
                variant="ghost"
                disabled={disabled}
                onClick={() => onChange(values.filter((u) => u !== uri))}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <div className="p-4 text-center text-sm text-muted-foreground">{emptyLabel}</div>
      )}

      <div className="flex items-center gap-2 p-3 bg-secondary/30 border-t border-white/10">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className="flex-1 bg-card font-mono text-sm"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button size="sm" onClick={add} disabled={disabled || !draft.trim()} className="gap-1">
          <Plus className="h-4 w-4" />
          Add
        </Button>
      </div>
    </div>
  );
}

// =============================================================================
// TypeCard — the SPA vs MACHINE choice (only shown when selecting a new type)
// =============================================================================

interface TypeCardProps {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  bullets: string[];
}

function TypeCard({ active, disabled, onClick, icon, title, subtitle, bullets }: TypeCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex flex-col gap-2 rounded-lg border p-4 text-left transition-colors',
        active ? 'border-primary bg-primary/10' : 'border-white/10 hover:border-white/20',
        disabled && 'opacity-40 cursor-not-allowed',
      )}
    >
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/20 text-primary">
          {icon}
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground list-disc pl-5">
        {bullets.map((b) => (
          <li key={b}>{b}</li>
        ))}
      </ul>
    </button>
  );
}

// =============================================================================
// CredentialForm — type cards (optional) + type-conditional fields
// =============================================================================

export interface CredentialFormProps {
  value: CredentialFormState;
  onChange: (next: CredentialFormState) => void;
  /** Show the SPA/MACHINE chooser. Off when the type is fixed (edit / add of a known-missing type). */
  allowTypeSelection?: boolean;
  /** Disable a type card (e.g. the app already holds one of that type). */
  disabledTypes?: ClientType[];
  disabled?: boolean;
  /** Show a per-type error (e.g. missing SPA redirect URI). */
  error?: string | null;
}

export function CredentialForm({
  value,
  onChange,
  allowTypeSelection = false,
  disabledTypes = [],
  disabled,
  error,
}: CredentialFormProps) {
  const patch = (partial: Partial<CredentialFormState>) => onChange({ ...value, ...partial });

  const toggleScope = (scope: string) => (checked: boolean) =>
    patch({
      m2mAllowedScopes: checked
        ? [...value.m2mAllowedScopes, scope]
        : value.m2mAllowedScopes.filter((s) => s !== scope),
    });

  return (
    <div className="space-y-5">
      {allowTypeSelection && (
        <div className="space-y-2">
          <Label>Credential type <span className="text-destructive">*</span></Label>
          <div className="grid gap-3 sm:grid-cols-2">
            <TypeCard
              active={value.type === 'SPA'}
              disabled={disabled || disabledTypes.includes('SPA')}
              onClick={() => patch({ type: 'SPA' })}
              icon={<Globe className="h-4 w-4" />}
              title="Single-Page / Web App (SPA)"
              subtitle="Public client · PKCE · no secret"
              bullets={['User login in a browser', 'Needs redirect URI(s)', 'No client secret']}
            />
            <TypeCard
              active={value.type === 'MACHINE'}
              disabled={disabled || disabledTypes.includes('MACHINE')}
              onClick={() => patch({ type: 'MACHINE' })}
              icon={<Server className="h-4 w-4" />}
              title="Machine / Backend Service (MACHINE)"
              subtitle="Confidential client · client_credentials · has a secret"
              bullets={['Server-to-server calls', 'Issues a one-time secret', 'No redirect URIs']}
            />
          </div>
        </div>
      )}

      {/* SPA fields ------------------------------------------------------- */}
      {value.type === 'SPA' && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>
              Redirect URI(s) <span className="text-destructive">*</span>
            </Label>
            <StringListEditor
              values={value.redirectUris}
              onChange={(next) => patch({ redirectUris: next })}
              placeholder="https://example.com/callback"
              disabled={disabled}
              emptyLabel="At least one redirect URI is required"
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <p className="text-xs text-muted-foreground">
              Supports wildcards (<code className="text-purple-400">*</code>) and tenant placeholders
              (<code className="text-purple-400">{'{tenant}'}</code>).
            </p>
          </div>

          <div className="space-y-2">
            <Label>Post-logout redirect URI(s)</Label>
            <StringListEditor
              values={value.postLogoutRedirectUris}
              onChange={(next) => patch({ postLogoutRedirectUris: next })}
              placeholder="https://example.com/logout"
              disabled={disabled}
            />
          </div>

          <div className="space-y-2">
            <Label>Allowed web origins</Label>
            <StringListEditor
              values={value.allowedWebOrigins}
              onChange={(next) => patch({ allowedWebOrigins: next })}
              placeholder="https://example.com"
              disabled={disabled}
            />
          </div>

          <div className="space-y-2">
            <Label>Initiate-login URI</Label>
            <Input
              value={value.initiateLoginUri}
              onChange={(e) => patch({ initiateLoginUri: e.target.value })}
              placeholder="https://example.com/login"
              disabled={disabled}
              className="bg-card"
            />
          </div>
        </div>
      )}

      {/* MACHINE fields --------------------------------------------------- */}
      {value.type === 'MACHINE' && (
        <div className="space-y-5">
          <div className="rounded-md border border-blue-500/30 bg-blue-500/10 p-3 text-xs text-blue-100">
            A one-time client secret is generated when this credential is created. Copy it immediately —
            it is never shown again (rotate it later if lost).
          </div>

          <div className="flex items-center justify-between">
            <div className="pr-4">
              <Label>Trusted for all tenants</Label>
              <p className="text-xs text-muted-foreground">
                When on, this client can access every tenant's data (first-party backend). When off, only the
                tenants you grant it (managed per-credential after creation) are allowed.
              </p>
            </div>
            <Switch
              checked={value.m2mTrustedAllTenants}
              disabled={disabled}
              onCheckedChange={(checked) => patch({ m2mTrustedAllTenants: checked })}
            />
          </div>

          <div className="space-y-3">
            <div>
              <Label>Allowed scopes</Label>
              <p className="text-xs text-muted-foreground">
                Scopes the client_credentials token may carry. Empty = the client gets empty-scope tokens and is
                denied everywhere.
              </p>
            </div>
            <div className="space-y-2">
              {M2M_SCOPES.map((scope) => (
                <div
                  key={scope}
                  className="flex items-center justify-between rounded-lg border border-white/10 bg-card px-3 py-2"
                >
                  <code className="text-sm font-mono text-foreground/90">{scope}</code>
                  <Switch
                    checked={value.m2mAllowedScopes.includes(scope)}
                    disabled={disabled}
                    onCheckedChange={toggleScope(scope)}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
