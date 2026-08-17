import * as React from 'react';
import { superAdminApi } from '@/lib/api';
import { WebhookEventPicker, type EventCategory } from '@/components/WebhookEventPicker';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Switch } from '@/components/ui/Switch';

import type { ApplicationInfo } from './AppDetailPage';

// =============================================================================
// SETTINGS TAB
// =============================================================================
// Container-level settings ONLY. OAuth credential settings (client secret,
// redirect URIs, token TTLs, M2M authz) live per-credential in CredentialsTab,
// because those are properties of a credential, not the app container.
// =============================================================================

interface SettingsTabProps {
  app: ApplicationInfo;
  appId: string;
  onRefresh: () => void;
}

export function SettingsTab({ app, appId, onRefresh }: SettingsTabProps) {
  const { toast } = useToast();

  const [formData, setFormData] = React.useState<{
    name: string;
    slug: string;
    description?: string;
    webhookUrl?: string | null;
    webhookEnabled?: boolean;
    webhookEvents?: string[];
  }>({
    name: app.name,
    slug: app.slug,
    description: app.description ?? undefined,
    webhookUrl: app.webhookUrl || '',
    webhookEnabled: app.webhookEnabled || false,
    webhookEvents: app.webhookEvents || [],
  });

  const [isSaving, setIsSaving] = React.useState(false);
  const [eventTypes, setEventTypes] = React.useState<{ categories: EventCategory[] } | null>(null);

  React.useEffect(() => {
    superAdminApi
      .getSyncEventTypes()
      .then((data) => setEventTypes(data))
      .catch((err) => console.error('Failed to load event types:', err));
  }, []);

  const handleChange =
    (field: 'name' | 'description' | 'webhookUrl') =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setFormData((prev) => ({ ...prev, [field]: e.target.value }));
    };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      await superAdminApi.updateApplication(appId, {
        name: formData.name,
        description: formData.description,
        webhookUrl: formData.webhookUrl || null,
        webhookEnabled: formData.webhookEnabled,
        webhookEvents: formData.webhookEvents,
      });

      onRefresh();
      toast({ variant: 'success', title: 'Success', message: 'Settings saved successfully' });
    } catch (err: any) {
      toast({
        variant: 'error',
        title: 'Error',
        message: err?.response?.data?.message || err?.message || 'Failed to save settings',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Basic Info (container) */}
      <Card>
        <CardHeader>
          <CardTitle>Basic Information</CardTitle>
          <p className="text-sm text-muted-foreground">
            The application container -- a product that can hold both a SPA and a MACHINE credential.
            Manage those under the Credentials tab.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Name</label>
              <Input
                value={formData.name}
                onChange={handleChange('name')}
                placeholder="My Application"
                className="bg-card"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Slug</label>
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
            <label className="text-sm font-medium text-foreground">Description</label>
            <Input
              value={formData.description || ''}
              onChange={handleChange('description')}
              placeholder="Application description"
              className="bg-card"
            />
          </div>
        </CardContent>
      </Card>

      {/* Webhook Configuration (container) */}
      <Card>
        <CardHeader>
          <CardTitle>Webhooks</CardTitle>
          <p className="text-sm text-muted-foreground">Configure webhook notifications for sync events</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Webhook URL</label>
            <Input
              id="webhookUrl"
              type="url"
              placeholder="https://your-app.com/webhooks/authvital"
              value={formData.webhookUrl || ''}
              onChange={handleChange('webhookUrl')}
              className="bg-card"
            />
            <p className="text-xs text-muted-foreground">
              AuthVital will POST events to this URL. Events are signed using RSA-SHA256.
            </p>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium text-foreground">Enable Webhooks</label>
              <p className="text-xs text-muted-foreground">
                When enabled, events will be sent to the webhook URL
              </p>
            </div>
            <Switch
              checked={formData.webhookEnabled || false}
              onCheckedChange={(checked) =>
                setFormData((prev) => ({ ...prev, webhookEnabled: checked }))
              }
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Event Filter</label>
            {eventTypes ? (
              <WebhookEventPicker
                value={formData.webhookEvents || []}
                onChange={(events) => setFormData((prev) => ({ ...prev, webhookEvents: events }))}
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
    </div>
  );
}
