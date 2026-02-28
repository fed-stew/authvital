import * as React from 'react';
import { superAdminApi } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Checkbox } from '@/components/ui/Checkbox';
import { useToast } from '@/components/ui/Toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Eye, EyeOff, Copy, ExternalLink } from 'lucide-react';

// =============================================================================
// TYPES
// =============================================================================

interface SsoProviderConfig {
  id?: string;
  provider: string;
  enabled: boolean;
  clientId: string;
  hasSecret: boolean;
  scopes: string[];
  allowedDomains: string[];
  autoCreateUser: boolean;
  autoLinkExisting: boolean;
  createdAt?: string;
  updatedAt?: string;
}

interface ProviderFormState {
  clientId: string;
  clientSecret: string;
  enabled: boolean;
  allowedDomains: string;
  autoCreateUser: boolean;
  autoLinkExisting: boolean;
}

// =============================================================================
// PROVIDER INFO
// =============================================================================

const PROVIDER_INFO = {
  GOOGLE: {
    name: 'Google',
    icon: '🔵',
    color: 'bg-blue-500',
    docsUrl: 'https://console.cloud.google.com/apis/credentials',
    callbackPath: '/api/auth/sso/google/callback',
  },
  MICROSOFT: {
    name: 'Microsoft',
    icon: '🟦',
    color: 'bg-cyan-600',
    docsUrl: 'https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade',
    callbackPath: '/api/auth/sso/microsoft/callback',
  },
} as const;

type ProviderType = keyof typeof PROVIDER_INFO;

// =============================================================================
// PROVIDER CARD COMPONENT
// =============================================================================

interface ProviderCardProps {
  provider: ProviderType;
  config: SsoProviderConfig | null;
  onSave: (provider: string, config: ProviderFormState) => Promise<void>;
  onDelete: (provider: string) => Promise<void>;
  onTest: (provider: string) => Promise<void>;
}

function ProviderCard({ provider, config, onSave, onDelete, onTest }: ProviderCardProps) {
  const [isEditing, setIsEditing] = React.useState(!config);
  const [showSecret, setShowSecret] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [isTesting, setIsTesting] = React.useState(false);
  const [formState, setFormState] = React.useState<ProviderFormState>(() => ({
    clientId: config?.clientId || '',
    clientSecret: '',
    enabled: config?.enabled ?? false,
    allowedDomains: config?.allowedDomains?.join(', ') || '',
    autoCreateUser: config?.autoCreateUser ?? true,
    autoLinkExisting: config?.autoLinkExisting ?? true,
  }));

  const providerInfo = PROVIDER_INFO[provider];
  const callbackUrl = `${window.location.origin}${providerInfo.callbackPath}`;

  // Reset form when config changes (e.g., after save/delete)
  React.useEffect(() => {
    setFormState({
      clientId: config?.clientId || '',
      clientSecret: '',
      enabled: config?.enabled ?? false,
      allowedDomains: config?.allowedDomains?.join(', ') || '',
      autoCreateUser: config?.autoCreateUser ?? true,
      autoLinkExisting: config?.autoLinkExisting ?? true,
    });
    setIsEditing(!config);
  }, [config]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(provider, formState);
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    setIsTesting(true);
    try {
      await onTest(provider);
    } finally {
      setIsTesting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <Card className="relative">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 ${providerInfo.color} rounded-lg flex items-center justify-center text-white text-xl`}>
            {providerInfo.icon}
          </div>
          <div>
            <CardTitle className="text-lg">{providerInfo.name}</CardTitle>
            <p className="text-sm text-muted-foreground">OAuth 2.0 / OpenID Connect</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {config ? (
            <Badge variant={config.enabled ? 'success' : 'secondary'}>
              {config.enabled ? 'Enabled' : 'Disabled'}
            </Badge>
          ) : (
            <Badge variant="outline">Not Configured</Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Callback URL (always visible) */}
        <div className="bg-muted/50 p-3 rounded-lg">
          <label className="text-xs font-medium text-muted-foreground">
            Callback URL (add to {providerInfo.name})
          </label>
          <div className="flex items-center gap-2 mt-1">
            <code className="text-xs bg-background px-2 py-1 rounded flex-1 overflow-x-auto">
              {callbackUrl}
            </code>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => copyToClipboard(callbackUrl)}
              title="Copy to clipboard"
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {isEditing ? (
          <EditModeForm
            formState={formState}
            setFormState={setFormState}
            showSecret={showSecret}
            setShowSecret={setShowSecret}
            hasExistingSecret={config?.hasSecret ?? false}
            providerName={providerInfo.name}
            isSaving={isSaving}
            hasConfig={!!config}
            onSave={handleSave}
            onCancel={() => setIsEditing(false)}
          />
        ) : (
          <ViewModeContent
            config={config!}
            providerInfo={providerInfo}
            isTesting={isTesting}
            onEdit={() => setIsEditing(true)}
            onTest={handleTest}
            onDelete={() => onDelete(provider)}
          />
        )}
      </CardContent>
    </Card>
  );
}

// =============================================================================
// EDIT MODE FORM
// =============================================================================

interface EditModeFormProps {
  formState: ProviderFormState;
  setFormState: React.Dispatch<React.SetStateAction<ProviderFormState>>;
  showSecret: boolean;
  setShowSecret: (show: boolean) => void;
  hasExistingSecret: boolean;
  providerName: string;
  isSaving: boolean;
  hasConfig: boolean;
  onSave: () => void;
  onCancel: () => void;
}

function EditModeForm({
  formState,
  setFormState,
  showSecret,
  setShowSecret,
  hasExistingSecret,
  providerName,
  isSaving,
  hasConfig,
  onSave,
  onCancel,
}: EditModeFormProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium">Client ID</label>
        <Input
          value={formState.clientId}
          onChange={(e) => setFormState((prev) => ({ ...prev, clientId: e.target.value }))}
          placeholder="Enter Client ID from OAuth console"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Client Secret</label>
        <div className="relative">
          <Input
            type={showSecret ? 'text' : 'password'}
            value={formState.clientSecret}
            onChange={(e) => setFormState((prev) => ({ ...prev, clientSecret: e.target.value }))}
            placeholder={hasExistingSecret ? '••••••••••••••••' : 'Enter Client Secret'}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="absolute right-2 top-1/2 -translate-y-1/2"
            onClick={() => setShowSecret(!showSecret)}
          >
            {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
        </div>
        {hasExistingSecret && (
          <p className="text-xs text-muted-foreground">
            Leave blank to keep existing secret
          </p>
        )}
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Allowed Email Domains (optional)</label>
        <Input
          value={formState.allowedDomains}
          onChange={(e) => setFormState((prev) => ({ ...prev, allowedDomains: e.target.value }))}
          placeholder="example.com, acme.org (comma-separated, empty = all)"
        />
        <p className="text-xs text-muted-foreground">
          Restrict SSO to specific email domains. Leave empty to allow all.
        </p>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-medium">Enable SSO</h4>
          <p className="text-xs text-muted-foreground">Allow users to sign in with {providerName}</p>
        </div>
        <Checkbox
          checked={formState.enabled}
          onCheckedChange={(checked) => setFormState((prev) => ({ ...prev, enabled: checked as boolean }))}
        />
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-medium">Auto-create Users</h4>
          <p className="text-xs text-muted-foreground">Create accounts for new SSO users</p>
        </div>
        <Checkbox
          checked={formState.autoCreateUser}
          onCheckedChange={(checked) => setFormState((prev) => ({ ...prev, autoCreateUser: checked as boolean }))}
        />
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-medium">Auto-link Existing</h4>
          <p className="text-xs text-muted-foreground">Link SSO to existing accounts with matching email</p>
        </div>
        <Checkbox
          checked={formState.autoLinkExisting}
          onCheckedChange={(checked) => setFormState((prev) => ({ ...prev, autoLinkExisting: checked as boolean }))}
        />
      </div>

      <div className="flex gap-2 pt-2">
        <Button onClick={onSave} disabled={isSaving || !formState.clientId}>
          {isSaving ? 'Saving...' : 'Save Configuration'}
        </Button>
        {hasConfig && (
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// VIEW MODE CONTENT
// =============================================================================

interface ViewModeContentProps {
  config: SsoProviderConfig;
  providerInfo: typeof PROVIDER_INFO[ProviderType];
  isTesting: boolean;
  onEdit: () => void;
  onTest: () => void;
  onDelete: () => void;
}

function ViewModeContent({
  config,
  providerInfo,
  isTesting,
  onEdit,
  onTest,
  onDelete,
}: ViewModeContentProps) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <span className="text-muted-foreground">Client ID:</span>
          <p className="font-mono truncate">{config.clientId || 'Not set'}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Secret:</span>
          <p>{config.hasSecret ? '••••••••••••••••' : 'Not set'}</p>
        </div>
      </div>

      {config.allowedDomains && config.allowedDomains.length > 0 && (
        <div className="text-sm">
          <span className="text-muted-foreground">Allowed Domains:</span>
          <p>{config.allowedDomains.join(', ')}</p>
        </div>
      )}

      <div className="flex flex-wrap gap-2 text-xs">
        <Badge variant={config.autoCreateUser ? 'default' : 'secondary'}>
          {config.autoCreateUser ? '✓' : '✗'} Auto-create users
        </Badge>
        <Badge variant={config.autoLinkExisting ? 'default' : 'secondary'}>
          {config.autoLinkExisting ? '✓' : '✗'} Auto-link existing
        </Badge>
      </div>

      <div className="flex gap-2 pt-2">
        <Button variant="outline" size="sm" onClick={onEdit}>
          Edit
        </Button>
        {config.enabled && (
          <Button variant="outline" size="sm" onClick={onTest} disabled={isTesting}>
            {isTesting ? 'Testing...' : 'Test Connection'}
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          onClick={onDelete}
        >
          Remove
        </Button>
        <a
          href={providerInfo.docsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto"
        >
          <Button variant="ghost" size="sm">
            <ExternalLink className="h-4 w-4 mr-1" />
            OAuth Console
          </Button>
        </a>
      </div>
    </div>
  );
}

// =============================================================================
// SETUP INSTRUCTIONS
// =============================================================================

function SetupInstructions() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Setup Instructions</CardTitle>
      </CardHeader>
      <CardContent className="prose prose-sm dark:prose-invert max-w-none">
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <h4 className="font-medium text-foreground">Google OAuth Setup</h4>
            <ol className="text-muted-foreground list-decimal list-inside space-y-1">
              <li>
                Go to{' '}
                <a
                  href="https://console.cloud.google.com/apis/credentials"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Google Cloud Console
                </a>
              </li>
              <li>Create a new project or select existing</li>
              <li>Go to "Credentials" → "Create Credentials" → "OAuth client ID"</li>
              <li>Select "Web application"</li>
              <li>Add the callback URL shown above</li>
              <li>Copy Client ID and Secret here</li>
            </ol>
          </div>
          <div>
            <h4 className="font-medium text-foreground">Microsoft OAuth Setup</h4>
            <ol className="text-muted-foreground list-decimal list-inside space-y-1">
              <li>
                Go to{' '}
                <a
                  href="https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Azure Portal
                </a>
              </li>
              <li>Register a new application</li>
              <li>Under "Authentication", add a Web platform</li>
              <li>Add the callback URL shown above</li>
              <li>Under "Certificates & secrets", create a new client secret</li>
              <li>Copy Application (client) ID and Secret here</li>
            </ol>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function SsoTab() {
  const { toast } = useToast();
  const [providers, setProviders] = React.useState<SsoProviderConfig[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  // Load SSO providers
  const loadProviders = React.useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await superAdminApi.getSsoProviders();
      setProviders(data);
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        || 'Failed to load SSO providers';
      toast({ variant: 'error', title: 'Error', message });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  const getProviderConfig = (provider: string): SsoProviderConfig | null => {
    return providers.find((p) => p.provider === provider) || null;
  };

  const handleSave = async (provider: string, formState: ProviderFormState) => {
    try {
      const config: Parameters<typeof superAdminApi.upsertSsoProvider>[0] = {
        provider,
        clientId: formState.clientId,
        clientSecret: formState.clientSecret || '', // API will handle empty string
        enabled: formState.enabled,
        autoCreateUser: formState.autoCreateUser,
        autoLinkExisting: formState.autoLinkExisting,
        allowedDomains: formState.allowedDomains
          ? formState.allowedDomains.split(',').map((d) => d.trim()).filter(Boolean)
          : [],
      };

      await superAdminApi.upsertSsoProvider(config);
      toast({ variant: 'success', title: 'Success', message: `${provider} SSO configuration saved` });
      await loadProviders();
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        || 'Failed to save SSO configuration';
      toast({ variant: 'error', title: 'Error', message });
      throw err;
    }
  };

  const handleDelete = async (provider: string) => {
    if (!confirm(`Are you sure you want to remove ${provider} SSO configuration?`)) {
      return;
    }

    try {
      await superAdminApi.deleteSsoProvider(provider);
      toast({ variant: 'success', title: 'Success', message: `${provider} SSO configuration removed` });
      await loadProviders();
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        || 'Failed to remove SSO configuration';
      toast({ variant: 'error', title: 'Error', message });
    }
  };

  const handleTest = async (provider: string) => {
    try {
      const result = await superAdminApi.testSsoProvider(provider);
      if (result.success) {
        toast({ variant: 'success', title: 'Configuration Valid', message: result.message });
      } else {
        toast({ variant: 'error', title: 'Configuration Error', message: result.error });
      }
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        || 'Failed to test SSO configuration';
      toast({ variant: 'error', title: 'Test Failed', message });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Single Sign-On (SSO)</h2>
        <p className="text-sm text-muted-foreground">
          Configure OAuth providers to allow users to sign in with their existing accounts.
          These settings apply instance-wide as defaults. Tenants can override with their own credentials.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <ProviderCard
          provider="GOOGLE"
          config={getProviderConfig('GOOGLE')}
          onSave={handleSave}
          onDelete={handleDelete}
          onTest={handleTest}
        />
        <ProviderCard
          provider="MICROSOFT"
          config={getProviderConfig('MICROSOFT')}
          onSave={handleSave}
          onDelete={handleDelete}
          onTest={handleTest}
        />
      </div>

      <SetupInstructions />
    </div>
  );
}
