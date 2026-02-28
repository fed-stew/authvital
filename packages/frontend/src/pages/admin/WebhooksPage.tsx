import * as React from 'react';
import { superAdminApi } from '@/lib/api';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Table, Column } from '@/components/ui/Table';
import {
  Plus,
  Webhook,
  Trash2,
  Play,
  CheckCircle,
  XCircle,
  Clock,
  Eye,
} from 'lucide-react';
import { WebhookEventPicker, EventCategory } from '@/components/WebhookEventPicker';

// =============================================================================
// TYPES
// =============================================================================

interface SystemWebhook {
  id: string;
  name: string;
  url: string;
  events: string[];
  isActive: boolean;
  description: string | null;
  lastTriggeredAt: string | null;
  lastStatus: number | null;
  failureCount: number;
  createdAt: string;
}

interface WebhookDelivery {
  id: string;
  event: string;
  payload: unknown;
  status: number | null;
  response: string | null;
  duration: number | null;
  error: string | null;
  attemptedAt: string;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function WebhooksPage() {
  const { toast } = useToast();

  const [webhooks, setWebhooks] = React.useState<SystemWebhook[]>([]);
  const [eventCategories, setEventCategories] = React.useState<EventCategory[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  // Modal states
  const [isCreateModalOpen, setIsCreateModalOpen] = React.useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = React.useState(false);
  const [selectedWebhook, setSelectedWebhook] = React.useState<SystemWebhook | null>(null);
  const [deliveries, setDeliveries] = React.useState<WebhookDelivery[]>([]);

  // Form state
  const [form, setForm] = React.useState({
    name: '',
    url: '',
    description: '',
    events: [] as string[],
  });
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Load data
  const loadData = React.useCallback(async () => {
    try {
      setIsLoading(true);
      const [webhooksData, categoriesData] = await Promise.all([
        superAdminApi.getWebhooks(),
        superAdminApi.getWebhookEventTypes(),
      ]);
      setWebhooks(webhooksData);
      setEventCategories(categoriesData);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Failed to load webhooks';
      toast({
        variant: 'error',
        title: 'Error',
        message,
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  // Create webhook
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.url) return;

    setIsSubmitting(true);
    try {
      await superAdminApi.createWebhook({
        name: form.name,
        url: form.url,
        events: form.events,
        description: form.description || undefined,
      });

      toast({
        variant: 'success',
        title: 'Webhook Created',
        message: 'Webhook is ready to receive events',
      });

      setForm({ name: '', url: '', description: '', events: [] });
      setIsCreateModalOpen(false);
      await loadData();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Failed to create webhook';
      toast({
        variant: 'error',
        title: 'Error',
        message,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Toggle webhook active state
  const handleToggleActive = async (webhook: SystemWebhook) => {
    try {
      await superAdminApi.updateWebhook(webhook.id, { isActive: !webhook.isActive });
      toast({
        variant: 'success',
        title: 'Success',
        message: `Webhook ${webhook.isActive ? 'disabled' : 'enabled'}`,
      });
      await loadData();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Failed to update webhook';
      toast({
        variant: 'error',
        title: 'Error',
        message,
      });
    }
  };

  // Delete webhook
  const handleDelete = async (webhook: SystemWebhook) => {
    if (!confirm(`Are you sure you want to delete "${webhook.name}"? This cannot be undone.`)) {
      return;
    }

    try {
      await superAdminApi.deleteWebhook(webhook.id);
      toast({ variant: 'success', title: 'Success', message: 'Webhook deleted' });
      await loadData();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Failed to delete webhook';
      toast({
        variant: 'error',
        title: 'Error',
        message,
      });
    }
  };

  // Test webhook
  const handleTest = async (webhook: SystemWebhook) => {
    try {
      const result = await superAdminApi.testWebhook(webhook.id);
      if (result.success) {
        toast({
          variant: 'success',
          title: 'Test Successful',
          message: `Response: ${result.status} (${result.duration}ms)`,
        });
      } else {
        toast({
          variant: 'error',
          title: 'Test Failed',
          message: result.error || `Status: ${result.status}`,
        });
      }
      await loadData();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Failed to test webhook';
      toast({
        variant: 'error',
        title: 'Error',
        message,
      });
    }
  };

  // View webhook details and deliveries
  const handleViewDetails = async (webhook: SystemWebhook) => {
    setSelectedWebhook(webhook);
    setIsDetailModalOpen(true);
    try {
      const data = await superAdminApi.getWebhookDeliveries(webhook.id);
      setDeliveries(data);
    } catch {
      setDeliveries([]);
    }
  };

  // Format date
  const formatDate = (date: string | null) => {
    if (!date) return 'Never';
    return new Date(date).toLocaleString();
  };

  // Table columns
  const columns: Column<SystemWebhook>[] = [
    {
      header: 'Webhook',
      accessor: 'name',
      cell: (_, row) => (
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
            <Webhook className="h-4 w-4 text-primary" />
          </div>
          <div>
            <div className="font-medium">{row.name}</div>
            <div className="text-sm text-muted-foreground truncate max-w-[200px]">{row.url}</div>
          </div>
        </div>
      ),
    },
    {
      header: 'Events',
      accessor: 'events',
      cell: (value: string[]) => (
        <div className="flex flex-wrap gap-1">
          {value.slice(0, 2).map((e) => (
            <Badge key={e} variant="secondary" className="text-xs">
              {e}
            </Badge>
          ))}
          {value.length > 2 && (
            <Badge variant="secondary" className="text-xs">
              +{value.length - 2}
            </Badge>
          )}
        </div>
      ),
    },
    {
      header: 'Status',
      accessor: 'isActive',
      cell: (value, row) => (
        <div className="flex items-center gap-2">
          {value ? (
            <Badge variant="success">Active</Badge>
          ) : (
            <Badge variant="secondary">Disabled</Badge>
          )}
          {row.failureCount > 0 && (
            <Badge variant="destructive" className="text-xs">
              {row.failureCount} failures
            </Badge>
          )}
        </div>
      ),
    },
    {
      header: 'Last Triggered',
      accessor: 'lastTriggeredAt',
      cell: (value, row) => (
        <div className="text-sm text-muted-foreground">
          <div>{formatDate(value)}</div>
          {row.lastStatus && (
            <div className="flex items-center gap-1">
              {row.lastStatus >= 200 && row.lastStatus < 300 ? (
                <CheckCircle className="h-3 w-3 text-green-500" />
              ) : (
                <XCircle className="h-3 w-3 text-red-500" />
              )}
              <span>{row.lastStatus}</span>
            </div>
          )}
        </div>
      ),
    },
    {
      header: 'Actions',
      accessor: 'id',
      className: 'w-[150px]',
      cell: (_, row) => (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              handleViewDetails(row);
            }}
            title="View details"
          >
            <Eye className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              handleTest(row);
            }}
            title="Send test"
          >
            <Play className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              handleToggleActive(row);
            }}
            title={row.isActive ? 'Disable' : 'Enable'}
          >
            {row.isActive ? (
              <XCircle className="h-4 w-4 text-amber-500" />
            ) : (
              <CheckCircle className="h-4 w-4 text-green-500" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              handleDelete(row);
            }}
            className="text-destructive hover:text-destructive"
            title="Delete"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <AdminLayout title="System Webhooks">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">System Webhooks</h2>
            <p className="text-muted-foreground">
              Configure webhooks to receive notifications for system events
            </p>
          </div>
          <Button onClick={() => setIsCreateModalOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Webhook
          </Button>
        </div>

        {/* Webhooks Table */}
        <Card>
          <CardContent className="p-0">
            <Table
              data={webhooks}
              columns={columns}
              isLoading={isLoading}
              emptyMessage="No webhooks configured"
            />
          </CardContent>
        </Card>

        {/* Info Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">About System Webhooks</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>
              System webhooks notify external services when events occur in your AuthVital
              instance. Each webhook request is signed using RSA-SHA256 with the platform's
              signing key (same keys used for JWTs).
            </p>
            <p>
              Verify signatures using the <code>X-Webhook-Signature</code> header and the key ID
              from <code>X-Webhook-Key-Id</code>. Fetch public keys from{' '}
              <code>/.well-known/jwks.json</code>.
            </p>
            <p>
              Use webhooks to sync data with external systems, trigger workflows, or build
              integrations.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Create Webhook Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => {
          setIsCreateModalOpen(false);
          setForm({ name: '', url: '', description: '', events: [] });
        }}
        title="Add Webhook"
      >
        <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Name</label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="My Webhook"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">URL</label>
              <Input
                type="url"
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                placeholder="https://example.com/webhook"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Description (optional)</label>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="What this webhook is for..."
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Events</label>
              <WebhookEventPicker
                value={form.events}
                onChange={(events) => setForm({ ...form, events })}
                categories={eventCategories}
              />
            </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => setIsCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Create Webhook'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Webhook Details Modal */}
      <Modal
        isOpen={isDetailModalOpen}
        onClose={() => {
          setIsDetailModalOpen(false);
          setSelectedWebhook(null);
          setDeliveries([]);
        }}
        title={selectedWebhook?.name || 'Webhook Details'}
      >
        {selectedWebhook && (
          <div className="space-y-4">
            {/* Webhook info */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">URL</p>
                <p className="font-mono text-xs break-all">{selectedWebhook.url}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Status</p>
                <Badge variant={selectedWebhook.isActive ? 'success' : 'secondary'}>
                  {selectedWebhook.isActive ? 'Active' : 'Disabled'}
                </Badge>
              </div>
              <div>
                <p className="text-muted-foreground">Events</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {selectedWebhook.events.map((e) => (
                    <Badge key={e} variant="secondary" className="text-xs">
                      {e}
                    </Badge>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-muted-foreground">Failures</p>
                <p>{selectedWebhook.failureCount}</p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => handleTest(selectedWebhook)}>
                <Play className="h-4 w-4 mr-2" />
                Send Test
              </Button>
            </div>

            {/* Recent Deliveries */}
            <div>
              <p className="text-sm font-medium mb-2">Recent Deliveries</p>
              {deliveries.length === 0 ? (
                <p className="text-sm text-muted-foreground">No deliveries yet</p>
              ) : (
                <div className="max-h-[200px] overflow-y-auto border rounded-lg divide-y">
                  {deliveries.map((d) => (
                    <div key={d.id} className="p-2 text-sm">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {d.status && d.status >= 200 && d.status < 300 ? (
                            <CheckCircle className="h-4 w-4 text-green-500" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-500" />
                          )}
                          <Badge variant="secondary" className="text-xs">
                            {d.event}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground text-xs">
                          {d.status && <span>{d.status}</span>}
                          {d.duration && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {d.duration}ms
                            </span>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDate(d.attemptedAt)}
                      </p>
                      {d.error && <p className="text-xs text-red-500 mt-1">{d.error}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </AdminLayout>
  );
}

export default WebhooksPage;
