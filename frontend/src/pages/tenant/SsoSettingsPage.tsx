import * as React from 'react';
import { useParams } from 'react-router-dom';
import { tenantApi } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Checkbox } from '@/components/ui/Checkbox';
import { useToast } from '@/components/ui/Toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Eye, EyeOff, AlertTriangle, Shield } from 'lucide-react';

// =============================================================================
// TYPES
// =============================================================================

interface TenantSsoConfig {
  id?: string;
  provider: string;
  enabled: boolean;
  clientId?: string | null;
  hasCustomCredentials: boolean;
  enforced: boolean;
  allowedDomains: string[];
}

interface AvailableProvider {
  provider: string;
  enforced: boolean;
}

interface ProviderFormState {
  enabled: boolean;
  clientId: string;
  clientSecret: string;
  enforced: boolean;
  allowedDomains: string;
  useCustomCredentials: boolean;
}

// =============================================================================
// PROVIDER CARD
// =============================================================================

interface TenantProviderCardProps {
  provider: string;
  config: TenantSsoConfig | null;
  isAvailable: boolean;
  tenantId: string;
  onUpdate: () => void;
}

function TenantProviderCard({ provider, config, isAvailable, tenantId, onUpdate }: TenantProviderCardProps) {
  const { toast } = useToast();
  const [isEditing, setIsEditing] = React.useState(false);
  const [showSecret, setShowSecret] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [formState, setFormState] = React.useState<ProviderFormState>({
    enabled: config?.enabled ?? true,
    clientId: config?.clientId || '',
    clientSecret: '',
    enforced: config?.enforced ?? false,
    allowedDomains: config?.allowedDomains?.join(', ') || '',
    useCustomCredentials: config?.hasCustomCredentials ?? false,
  });

  const providerInfo: Record<string, { name: string; icon: string; color: string }> = {
    GOOGLE: { name: 'Google', icon: '🔵', color: 'bg-blue-500' },
    MICROSOFT: { name: 'Microsoft', icon: '🟦', color: 'bg-cyan-600' },
  };

  const info = providerInfo[provider] || { name: provider, icon: '🔒', color: 'bg-gray-500' };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await tenantApi.updateTenantSsoConfig(tenantId, provider, {
        enabled: formState.enabled,
        clientId: formState.useCustomCredentials ? formState.clientId : null,
        clientSecret: formState.useCustomCredentials && formState.clientSecret ? formState.clientSecret : null,
        enforced: formState.enforced,
        allowedDomains: formState.allowedDomains
          ? formState.allowedDomains.split(',').map(d => d.trim()).filter(Boolean)
          : [],
      });
      toast({
        variant: 'success',
        title: 'Success',
        message: `${info.name} SSO settings saved`,
      });
      setIsEditing(false);
      onUpdate();
    } catch (err: any) {
      toast({
        variant: 'error',
        title: 'Error',
        message: err?.response?.data?.message || 'Failed to save SSO settings',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm(`Reset ${info.name} SSO to instance defaults? Any custom settings will be removed.`)) {
      return;
    }

    try {
      await tenantApi.deleteTenantSsoConfig(tenantId, provider);
      toast({
        variant: 'success',
        title: 'Success',
        message: `${info.name} SSO reset to defaults`,
      });
      onUpdate();
    } catch (err: any) {
      toast({
        variant: 'error',
        title: 'Error',
        message: err?.response?.data?.message || 'Failed to reset SSO settings',
      });
    }
  };

  if (!isAvailable) {
    return (
      <Card className="opacity-60">
        <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
          <div className={`w-10 h-10 ${info.color} rounded-lg flex items-center justify-center text-white text-xl`}>
            {info.icon}
          </div>
          <div className="flex-1">
            <CardTitle className="text-lg">{info.name}</CardTitle>
            <p className="text-sm text-muted-foreground">Not available</p>
          </div>
          <Badge variant="secondary">Disabled by Admin</Badge>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            This SSO provider is not enabled at the instance level. Contact your system administrator to enable it.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
        <div className={`w-10 h-10 ${info.color} rounded-lg flex items-center justify-center text-white text-xl`}>
          {info.icon}
        </div>
        <div className="flex-1">
          <CardTitle className="text-lg">{info.name}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {config?.hasCustomCredentials ? 'Custom credentials' : 'Using instance defaults'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {config?.enforced && (
            <Badge variant="warning" className="flex items-center gap-1">
              <Shield className="w-3 h-3" />
              Enforced
            </Badge>
          )}
          <Badge variant={config?.enabled !== false ? 'success' : 'secondary'}>
            {config?.enabled !== false ? 'Enabled' : 'Disabled'}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {isEditing ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-medium">Enable for this tenant</h4>
                <p className="text-xs text-muted-foreground">Allow users to sign in with {info.name}</p>
              </div>
              <Checkbox
                checked={formState.enabled}
                onCheckedChange={(checked) => setFormState({ ...formState, enabled: checked as boolean })}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-medium">Use custom OAuth credentials</h4>
                <p className="text-xs text-muted-foreground">Configure your own {info.name} OAuth app</p>
              </div>
              <Checkbox
                checked={formState.useCustomCredentials}
                onCheckedChange={(checked) => setFormState({ ...formState, useCustomCredentials: checked as boolean })}
              />
            </div>

            {formState.useCustomCredentials && (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Client ID</label>
                  <Input
                    value={formState.clientId}
                    onChange={(e) => setFormState({ ...formState, clientId: e.target.value })}
                    placeholder="Your OAuth Client ID"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Client Secret</label>
                  <div className="relative">
                    <Input
                      type={showSecret ? 'text' : 'password'}
                      value={formState.clientSecret}
                      onChange={(e) => setFormState({ ...formState, clientSecret: e.target.value })}
                      placeholder={config?.hasCustomCredentials ? '••••••••••••' : 'Your OAuth Client Secret'}
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
                </div>
              </>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">Allowed Email Domains</label>
              <Input
                value={formState.allowedDomains}
                onChange={(e) => setFormState({ ...formState, allowedDomains: e.target.value })}
                placeholder="yourcompany.com, subsidiary.org (comma-separated)"
              />
              <p className="text-xs text-muted-foreground">
                Restrict SSO to specific email domains. Leave empty to allow all.
              </p>
            </div>

            <div className="flex items-center justify-between p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5" />
                <div>
                  <h4 className="text-sm font-medium text-amber-800 dark:text-amber-200">Enforce SSO Only</h4>
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    Disable password login for all users in this tenant
                  </p>
                </div>
              </div>
              <Checkbox
                checked={formState.enforced}
                onCheckedChange={(checked) => setFormState({ ...formState, enforced: checked as boolean })}
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save'}
              </Button>
              <Button variant="outline" onClick={() => setIsEditing(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {config?.allowedDomains && config.allowedDomains.length > 0 && (
              <div className="text-sm">
                <span className="text-muted-foreground">Allowed domains: </span>
                <span className="font-mono">{config.allowedDomains.join(', ')}</span>
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                Configure
              </Button>
              {config && (
                <Button variant="ghost" size="sm" onClick={handleReset}>
                  Reset to Defaults
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function SsoSettingsPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { toast } = useToast();
  const [configs, setConfigs] = React.useState<TenantSsoConfig[]>([]);
  const [availableProviders, setAvailableProviders] = React.useState<AvailableProvider[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  const loadConfig = React.useCallback(async () => {
    if (!tenantId) return;

    try {
      setIsLoading(true);
      const data = await tenantApi.getTenantSsoConfig(tenantId);
      setConfigs(data.configs || []);
      setAvailableProviders(data.availableProviders || []);
    } catch (err: any) {
      toast({
        variant: 'error',
        title: 'Error',
        message: err?.response?.data?.message || 'Failed to load SSO settings',
      });
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, toast]);

  React.useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const getConfig = (provider: string) => configs.find(c => c.provider === provider) || null;
  const isProviderAvailable = (provider: string) => availableProviders.some(p => p.provider === provider);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Single Sign-On</h2>
        <p className="text-muted-foreground">
          Configure SSO providers for your organization. Users can sign in with their existing accounts.
        </p>
      </div>

      {availableProviders.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">
              No SSO providers are currently available. Contact your system administrator to enable SSO.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6">
          {['GOOGLE', 'MICROSOFT'].map((provider) => (
            <TenantProviderCard
              key={provider}
              provider={provider}
              config={getConfig(provider)}
              isAvailable={isProviderAvailable(provider)}
              tenantId={tenantId!}
              onUpdate={loadConfig}
            />
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">About SSO Configuration</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            <strong>Using instance defaults:</strong> Your organization uses the SSO credentials configured by the system administrator. 
            This is the simplest setup and works for most organizations.
          </p>
          <p>
            <strong>Custom credentials:</strong> You can configure your own OAuth application for each provider. 
            This gives you control over branding and consent screens shown to your users.
          </p>
          <p>
            <strong>Enforced SSO:</strong> When enabled, password login is disabled for all users in your organization. 
            Users must sign in using SSO. Use with caution!
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default SsoSettingsPage;
