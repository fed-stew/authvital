import * as React from 'react';
import { Plus, X, Pencil, Trash2, Check, RefreshCw, Copy } from 'lucide-react';
import { superAdminApi, syncApi } from '@/lib/api';
import { WebhookEventPicker, type EventCategory } from '@/components/WebhookEventPicker';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { Switch } from '@/components/ui/Switch';

import type { ApplicationInfo } from './AppDetailPage';

// =============================================================================
// TYPES
// =============================================================================

interface SettingsTabProps {
  app: ApplicationInfo;
  appId: string;
  onRefresh: () => void;
}

interface ApplicationFormState extends ApplicationInfo {
  clientSecret?: string;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function SettingsTab({ app, appId, onRefresh }: SettingsTabProps) {
  const { toast } = useToast();
  
  const [formData, setFormData] = React.useState<{
    name: string;
    slug: string;
    description?: string;
    redirectUris: string[];
    postLogoutRedirectUri?: string;
    initiateLoginUri?: string;
    accessTokenTtl?: number;
    refreshTokenTtl?: number;
    isActive: boolean;
    clientId: string;
    clientSecret?: string;
    // Webhooks
    webhookUrl?: string | null;
    webhookEnabled?: boolean;
    webhookEvents?: string[];
  }>({
    name: app.name,
    slug: app.slug,
    description: app.description,
    redirectUris: app.redirectUris || [],
    postLogoutRedirectUri: app.postLogoutRedirectUri,
    initiateLoginUri: app.initiateLoginUri,
    accessTokenTtl: app.accessTokenTtl,
    refreshTokenTtl: app.refreshTokenTtl,
    isActive: app.isActive,
    clientId: app.clientId,
    // Webhooks
    webhookUrl: app.webhookUrl || '',
    webhookEnabled: app.webhookEnabled || false,
    webhookEvents: app.webhookEvents || [],
  });
  
  const [isSaving, setIsSaving] = React.useState(false);
  const [isRegeneratingSecret, setIsRegeneratingSecret] = React.useState(false);
  const [showSecretModal, setShowSecretModal] = React.useState(false);
  const [newClientSecret, setNewClientSecret] = React.useState<string | null>(null);
  
  // Input state for adding URIs
  const [newRedirectUri, setNewRedirectUri] = React.useState('');
  
  // Edit state for URIs
  const [editingUriIndex, setEditingUriIndex] = React.useState<number | null>(null);
  const [editingUriValue, setEditingUriValue] = React.useState('');
  
  // Event types for webhook picker
  const [eventTypes, setEventTypes] = React.useState<{ categories: EventCategory[] } | null>(null);
  
  // Fetch available event types on mount
  React.useEffect(() => {
    syncApi.getEventTypes()
      .then(data => setEventTypes(data))
      .catch(err => console.error('Failed to load event types:', err));
  }, []);



  // Handle form changes
  const handleChange = (field: keyof ApplicationFormState) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, [field]: e.target.value }));
  };

  // Add redirect URI
  const addRedirectUri = () => {
    if (newRedirectUri && !formData.redirectUris?.includes(newRedirectUri)) {
      setFormData((prev) => ({
        ...prev,
        redirectUris: [...(prev.redirectUris || []), newRedirectUri],
      }));
      setNewRedirectUri('');
    }
  };

  // Remove redirect URI
  const removeRedirectUri = (uri: string) => {
    setFormData((prev) => ({
      ...prev,
      redirectUris: prev.redirectUris?.filter((u) => u !== uri) || [],
    }));
  };

  // Start editing a URI
  const startEditUri = (index: number) => {
    setEditingUriIndex(index);
    setEditingUriValue(formData.redirectUris[index]);
  };

  // Save edited URI
  const saveEditedUri = () => {
    if (editingUriIndex !== null && editingUriValue.trim()) {
      setFormData((prev) => ({
        ...prev,
        redirectUris: prev.redirectUris.map((uri, i) => 
          i === editingUriIndex ? editingUriValue.trim() : uri
        ),
      }));
      setEditingUriIndex(null);
      setEditingUriValue('');
    }
  };

  // Cancel editing
  const cancelEditUri = () => {
    setEditingUriIndex(null);
    setEditingUriValue('');
  };

  // Save settings
  const handleSave = async () => {
    try {
      setIsSaving(true);
      await superAdminApi.updateApplication(appId, {
        name: formData.name,
        description: formData.description,
        redirectUris: formData.redirectUris,
        postLogoutRedirectUri: formData.postLogoutRedirectUri,
        initiateLoginUri: formData.initiateLoginUri,
        accessTokenTtl: formData.accessTokenTtl,
        refreshTokenTtl: formData.refreshTokenTtl,
        isActive: formData.isActive,
        // Webhooks
        webhookUrl: formData.webhookUrl || null,
        webhookEnabled: formData.webhookEnabled,
        webhookEvents: formData.webhookEvents,
      });

      onRefresh();
      toast({
        variant: 'success',
        title: 'Success',
        message: 'Settings saved successfully',
      });
    } catch (err: any) {
      const errorMessage =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to save settings';
      toast({
        variant: 'error',
        title: 'Error',
        message: errorMessage,
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Regenerate client secret
  const handleRegenerateSecret = async () => {
    if (!confirm('Are you sure? This will invalidate the existing client secret and cannot be undone.')) {
      return;
    }
    
    try {
      setIsRegeneratingSecret(true);
      const result = await superAdminApi.regenerateClientSecret(appId);
      setNewClientSecret(result.clientSecret);
      setShowSecretModal(true);
      // Don't update formData.clientSecret - it will be hidden forever
      
      toast({
        variant: 'success',
        title: 'Secret Regenerated',
        message: 'Copy the new secret from the modal. You won\'t see it again!',
      });
    } catch (err: any) {
      const errorMessage =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to regenerate client secret';
      toast({
        variant: 'error',
        title: 'Error',
        message: errorMessage,
      });
    } finally {
      setIsRegeneratingSecret(false);
    }
  };

  // Copy new client secret from modal
  const handleCopyNewSecret = () => {
    if (newClientSecret) {
      navigator.clipboard.writeText(newClientSecret);
      toast({
        variant: 'success',
        title: 'Copied',
        message: 'Client secret copied to clipboard',
      });
    }
  };
  
  // Close secret modal
  const handleCloseSecretModal = () => {
    setShowSecretModal(false);
    setNewClientSecret(null); // Clear secret - it's gone forever now
  };

  return (
    <div className="space-y-6">
      {/* Basic Info */}
      <Card>
        <CardHeader>
          <CardTitle>Basic Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Name
              </label>
              <Input
                value={formData.name}
                onChange={handleChange('name')}
                placeholder="My Application"
                className="bg-card"
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Slug
              </label>
              <Input
                value={formData.slug}
                readOnly
                disabled
                placeholder="Auto-generated from name"
                className="bg-white/5"
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Description
            </label>
            <Input
              value={formData.description || ''}
              onChange={handleChange('description')}
              placeholder="Application description"
              className="bg-card"
            />
          </div>
        </CardContent>
      </Card>

      {/* Client Credentials */}
      <Card>
        <CardHeader>
          <CardTitle>Client Credentials</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Client ID
            </label>
            <div className="flex gap-2">
              <Input
                value={formData.clientId}
                readOnly
                className="bg-white/5 font-mono"
              />
              <Button
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(formData.clientId);
                  toast({
                    variant: 'success',
                    title: 'Copied',
                    message: 'Client ID copied to clipboard',
                  });
                }}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Client Secret
            </label>
            <div className="flex gap-2">
              <Input
                type="password"
                value="••••••••••••••••••••••••"
                readOnly
                className="bg-white/5 font-mono"
              />
              <Button
                variant="outline"
                onClick={handleRegenerateSecret}
                disabled={isRegeneratingSecret}
              >
                <RefreshCw className={`h-4 w-4 ${isRegeneratingSecret ? 'animate-spin' : ''}`} />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              For security, the client secret is only shown when regenerated. Click regenerate to create a new secret.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* OAuth Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>OAuth Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Redirect URIs */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-foreground">
                Redirect URIs
              </label>
            </div>
            
            {/* URI List */}
            <div className="rounded-lg border border-white/10 overflow-hidden">
              {formData.redirectUris && formData.redirectUris.length > 0 ? (
                <div className="divide-y divide-white/10">
                  {formData.redirectUris.map((uri, index) => (
                    <div key={index} className="flex items-center gap-2 p-3 bg-card hover:bg-white/5 transition-colors">
                      {editingUriIndex === index ? (
                        // Edit mode
                        <>
                          <Input
                            value={editingUriValue}
                            onChange={(e) => setEditingUriValue(e.target.value)}
                            className="flex-1 bg-secondary font-mono text-sm"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveEditedUri();
                              if (e.key === 'Escape') cancelEditUri();
                            }}
                          />
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={saveEditedUri}
                            className="text-green-500 hover:text-green-400 hover:bg-green-500/10"
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={cancelEditUri}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </>
                      ) : (
                        // View mode
                        <>
                          <code className="flex-1 text-sm font-mono text-foreground/90 truncate" title={uri}>
                            {uri}
                          </code>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => startEditUri(index)}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => removeRedirectUri(uri)}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  No redirect URIs configured
                </div>
              )}
              
              {/* Add new URI row */}
              <div className="flex items-center gap-2 p-3 bg-secondary/30 border-t border-white/10">
                <Input
                  value={newRedirectUri}
                  onChange={(e) => setNewRedirectUri(e.target.value)}
                  placeholder="https://example.com/callback"
                  className="flex-1 bg-card font-mono text-sm"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newRedirectUri) {
                      addRedirectUri();
                    }
                  }}
                />
                <Button
                  size="sm"
                  onClick={addRedirectUri}
                  disabled={!newRedirectUri}
                  className="gap-1"
                >
                  <Plus className="h-4 w-4" />
                  Add
                </Button>
              </div>
            </div>
            
            {/* Helper text */}
            <p className="text-xs text-muted-foreground">
              Supports wildcards (<code className="text-purple-400">*</code>) and tenant placeholders (<code className="text-purple-400">{'{tenant}'}</code>).
              Examples: <code className="text-muted-foreground/70">https://*.myapp.com/callback</code> or <code className="text-muted-foreground/70">https://{'{tenant}'}.myapp.com/callback</code>
            </p>
          </div>

          {/* Post Logout Redirect URI */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Post Logout Redirect URI
            </label>
            <Input
              value={formData.postLogoutRedirectUri || ''}
              onChange={(e) => setFormData((prev) => ({ ...prev, postLogoutRedirectUri: e.target.value }))}
              placeholder="https://example.com/logout"
              className="bg-card"
            />
            <p className="text-xs text-muted-foreground">
              The URL users are redirected to after logout. Use &lcub;tenant&rcub; as a placeholder for tenant ID.
            </p>
          </div>



          {/* Initiate Login URI */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Initiate Login URI
            </label>
            <Input
              value={formData.initiateLoginUri || ''}
              onChange={handleChange('initiateLoginUri')}
              placeholder="https://example.com/login"
              className="bg-card"
            />
          </div>


        </CardContent>
      </Card>



      {/* Token Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Token Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Access Token TTL (seconds)
              </label>
              <Input
                type="number"
                value={formData.accessTokenTtl || ''}
                onChange={handleChange('accessTokenTtl')}
                placeholder="3600"
                className="bg-card"
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Refresh Token TTL (seconds)
              </label>
              <Input
                type="number"
                value={formData.refreshTokenTtl || ''}
                onChange={handleChange('refreshTokenTtl')}
                placeholder="2592000"
                className="bg-card"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Webhook Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Webhooks</CardTitle>
          <p className="text-sm text-muted-foreground">
            Configure webhook notifications for sync events
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Webhook URL */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Webhook URL
            </label>
            <Input
              id="webhookUrl"
              type="url"
              placeholder="https://your-app.com/webhooks/authvader"
              value={formData.webhookUrl || ''}
              onChange={handleChange('webhookUrl')}
              className="bg-card"
            />
            <p className="text-xs text-muted-foreground">
              AuthVader will POST events to this URL. Events are signed using RSA-SHA256.
            </p>
          </div>

          {/* Enable Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium text-foreground">
                Enable Webhooks
              </label>
              <p className="text-xs text-muted-foreground">
                When enabled, events will be sent to the webhook URL
              </p>
            </div>
            <Switch
              checked={formData.webhookEnabled || false}
              onCheckedChange={(checked) => setFormData(prev => ({ ...prev, webhookEnabled: checked }))}
            />
          </div>

          {/* Event Filter */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Event Filter
            </label>
            {eventTypes ? (
              <WebhookEventPicker
                value={formData.webhookEvents || []}
                onChange={(events) => setFormData(prev => ({ ...prev, webhookEvents: events }))}
                categories={eventTypes.categories}
              />
            ) : (
              <div className="text-sm text-muted-foreground p-4 border border-white/10 rounded-lg">
                Loading event types...
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Save Settings'}
        </Button>
      </div>
      
      {/* Client Secret Modal */}
      {showSecretModal && newClientSecret && (
        <Modal isOpen={showSecretModal} onClose={handleCloseSecretModal} title="New Client Secret">
          <div className="space-y-4">
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
              <p className="text-sm text-yellow-300">
                <strong>Security Warning:</strong> Copy this secret now. You won't be able to see it again after closing this modal.
              </p>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Your New Client Secret
              </label>
              <div className="flex gap-2">
                <Input
                  type="text"
                  value={newClientSecret}
                  readOnly
                  className="bg-white/5 font-mono text-sm"
                />
                <Button
                  variant="outline"
                  onClick={handleCopyNewSecret}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
            
            <div className="flex justify-end gap-2">
              <Button onClick={handleCloseSecretModal}>
                I've Copied It
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
