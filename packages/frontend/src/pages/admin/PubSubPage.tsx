import * as React from 'react';
import { superAdminApi } from '@/lib/api';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Switch } from '@/components/ui/Switch';
import { StatsCard } from '@/components/ui/StatsCard';
import { useToast } from '@/components/ui/Toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Table, Column } from '@/components/ui/Table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import {
  Save,
  RefreshCw,
  RotateCcw,
  XCircle,
  Clock,
  AlertTriangle,
  Send,
  SkipForward,
} from 'lucide-react';
import { WebhookEventPicker, EventCategory } from '@/components/WebhookEventPicker';

// =============================================================================
// TYPES
// =============================================================================

interface PubSubConfig {
  id: string;
  enabled: boolean;
  topic: string;
  orderingEnabled: boolean;
  events: string[];
  createdAt: string;
  updatedAt: string;
}

interface OutboxEvent {
  id: string;
  eventType: string;
  eventSource: string;
  aggregateId: string;
  tenantId: string | null;
  topic: string;
  status: 'PENDING' | 'PUBLISHED' | 'FAILED' | 'SKIPPED';
  attempts: number;
  lastError: string | null;
  messageId: string | null;
  publishedAt: string | null;
  createdAt: string;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function PubSubPage() {
  const { toast } = useToast();

  // Config state
  const [config, setConfig] = React.useState<PubSubConfig | null>(null);
  const [eventCategories, setEventCategories] = React.useState<EventCategory[]>([]);
  const [isLoadingConfig, setIsLoadingConfig] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState(false);

  // Form state (mirrors config but is editable)
  const [formEnabled, setFormEnabled] = React.useState(false);
  const [formTopic, setFormTopic] = React.useState('authvital-events');
  const [formOrdering, setFormOrdering] = React.useState(true);
  const [formEvents, setFormEvents] = React.useState<string[]>([]);
  const [hasChanges, setHasChanges] = React.useState(false);

  // Outbox state
  const [outboxStats, setOutboxStats] = React.useState<Record<string, number>>({});
  const [outboxEvents, setOutboxEvents] = React.useState<OutboxEvent[]>([]);
  const [isLoadingOutbox, setIsLoadingOutbox] = React.useState(true);
  const [outboxFilter, setOutboxFilter] = React.useState<string>('');
  const [isRetrying, setIsRetrying] = React.useState(false);

  // =========================================================================
  // DATA LOADING
  // =========================================================================

  const loadConfig = React.useCallback(async () => {
    try {
      setIsLoadingConfig(true);
      const [configData, categories] = await Promise.all([
        superAdminApi.getPubSubConfig(),
        superAdminApi.getPubSubEventTypes(),
      ]);
      setConfig(configData);
      setEventCategories(categories);
      // Sync form state
      setFormEnabled(configData.enabled);
      setFormTopic(configData.topic);
      setFormOrdering(configData.orderingEnabled);
      setFormEvents(configData.events);
      setHasChanges(false);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Failed to load Pub/Sub configuration';
      toast({ variant: 'error', title: 'Error', message });
    } finally {
      setIsLoadingConfig(false);
    }
  }, [toast]);

  const loadOutbox = React.useCallback(async () => {
    try {
      setIsLoadingOutbox(true);
      const [stats, events] = await Promise.all([
        superAdminApi.getPubSubOutboxStats(),
        superAdminApi.getPubSubOutboxEvents({
          status: outboxFilter || undefined,
          limit: 50,
        }),
      ]);
      setOutboxStats(stats);
      setOutboxEvents(events);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Failed to load outbox data';
      toast({ variant: 'error', title: 'Error', message });
    } finally {
      setIsLoadingOutbox(false);
    }
  }, [toast, outboxFilter]);

  React.useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  React.useEffect(() => {
    loadOutbox();
  }, [loadOutbox]);

  // =========================================================================
  // CHANGE TRACKING
  // =========================================================================

  React.useEffect(() => {
    if (!config) return;
    const changed =
      formEnabled !== config.enabled ||
      formTopic !== config.topic ||
      formOrdering !== config.orderingEnabled ||
      JSON.stringify(formEvents.sort()) !== JSON.stringify(config.events.sort());
    setHasChanges(changed);
  }, [config, formEnabled, formTopic, formOrdering, formEvents]);

  // =========================================================================
  // HANDLERS
  // =========================================================================

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const updated = await superAdminApi.updatePubSubConfig({
        enabled: formEnabled,
        topic: formTopic,
        orderingEnabled: formOrdering,
        events: formEvents,
      });
      setConfig(updated);
      setHasChanges(false);
      toast({
        variant: 'success',
        title: 'Configuration Saved',
        message: updated.enabled
          ? 'Pub/Sub publishing is now active'
          : 'Configuration saved (publishing is disabled)',
      });
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Failed to save configuration';
      toast({ variant: 'error', title: 'Error', message });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDiscard = () => {
    if (!config) return;
    setFormEnabled(config.enabled);
    setFormTopic(config.topic);
    setFormOrdering(config.orderingEnabled);
    setFormEvents(config.events);
    setHasChanges(false);
  };

  const handleRetryEvent = async (id: string) => {
    try {
      const result = await superAdminApi.retryPubSubEvent(id);
      if (result.success) {
        toast({ variant: 'success', title: 'Retried', message: 'Event reset to PENDING' });
        await loadOutbox();
      } else {
        toast({ variant: 'error', title: 'Cannot Retry', message: result.message });
      }
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Failed to retry event';
      toast({ variant: 'error', title: 'Error', message });
    }
  };

  const handleRetryAll = async () => {
    if (!confirm('Retry all failed events? They will be re-queued for publishing.')) return;
    setIsRetrying(true);
    try {
      const result = await superAdminApi.retryAllPubSubEvents();
      toast({
        variant: 'success',
        title: 'Events Retried',
        message: `${result.count} event(s) reset to PENDING`,
      });
      await loadOutbox();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Failed to retry events';
      toast({ variant: 'error', title: 'Error', message });
    } finally {
      setIsRetrying(false);
    }
  };

  // =========================================================================
  // HELPERS
  // =========================================================================

  const formatDate = (date: string | null) => {
    if (!date) return '\u2014';
    return new Date(date).toLocaleString();
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case 'PUBLISHED':
        return <Badge variant="success">Published</Badge>;
      case 'PENDING':
        return <Badge variant="warning">Pending</Badge>;
      case 'FAILED':
        return <Badge variant="destructive">Failed</Badge>;
      case 'SKIPPED':
        return <Badge variant="secondary">Skipped</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  // =========================================================================
  // TABLE COLUMNS
  // =========================================================================

  const outboxColumns: Column<OutboxEvent>[] = [
    {
      header: 'Event',
      accessor: 'eventType',
      cell: (_, row) => (
        <div>
          <code className="text-sm font-medium">{row.eventType}</code>
          <div className="text-xs text-muted-foreground mt-0.5">
            {row.eventSource}
          </div>
        </div>
      ),
    },
    {
      header: 'Status',
      accessor: 'status',
      cell: (value) => statusBadge(value),
    },
    {
      header: 'Attempts',
      accessor: 'attempts',
      cell: (value) => (
        <span className="text-sm text-muted-foreground">{value}</span>
      ),
    },
    {
      header: 'Topic',
      accessor: 'topic',
      cell: (value) => (
        <code className="text-xs text-muted-foreground">{value}</code>
      ),
    },
    {
      header: 'Created',
      accessor: 'createdAt',
      cell: (value) => (
        <span className="text-sm text-muted-foreground">{formatDate(value)}</span>
      ),
    },
    {
      header: 'Error',
      accessor: 'lastError',
      cell: (value) =>
        value ? (
          <span className="text-xs text-red-400 truncate max-w-[200px] block" title={value}>
            {value}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">\u2014</span>
        ),
    },
    {
      header: '',
      accessor: 'id',
      className: 'w-[80px]',
      cell: (_, row) =>
        row.status === 'FAILED' ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              handleRetryEvent(row.id);
            }}
            title="Retry this event"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        ) : null,
    },
  ];

  // =========================================================================
  // RENDER
  // =========================================================================

  return (
    <AdminLayout title="Pub/Sub">
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-2xl font-bold">Pub/Sub</h2>
          <p className="text-muted-foreground">
            Publish events to Google Cloud Pub/Sub for downstream consumers
          </p>
        </div>

        <Tabs defaultValue="config">
          <TabsList>
            <TabsTrigger value="config">Configuration</TabsTrigger>
            <TabsTrigger value="outbox">
              Outbox
              {(outboxStats.FAILED ?? 0) > 0 && (
                <Badge variant="destructive" className="ml-2 text-xs">
                  {outboxStats.FAILED}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ============================================================= */}
          {/* CONFIGURATION TAB */}
          {/* ============================================================= */}

          <TabsContent value="config">
            <div className="space-y-6">
              {/* Unsaved changes banner */}
              {hasChanges && (
                <div className="flex items-center justify-between rounded-lg border border-yellow-500/20 bg-yellow-500/10 px-4 py-3">
                  <div className="flex items-center gap-2 text-sm text-yellow-400">
                    <AlertTriangle className="h-4 w-4" />
                    You have unsaved changes
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={handleDiscard}>
                      Discard
                    </Button>
                    <Button size="sm" onClick={handleSave} disabled={isSaving}>
                      <Save className="h-4 w-4 mr-2" />
                      {isSaving ? 'Saving...' : 'Save Changes'}
                    </Button>
                  </div>
                </div>
              )}

              {/* Enable / Disable */}
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <h3 className="font-medium">Enable Pub/Sub Publishing</h3>
                      <p className="text-sm text-muted-foreground">
                        When enabled, selected events will be published to the configured
                        Pub/Sub topic. When disabled, events are still recorded in the outbox
                        with a SKIPPED status.
                      </p>
                    </div>
                    <Switch
                      checked={formEnabled}
                      onCheckedChange={setFormEnabled}
                      disabled={isLoadingConfig}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Topic & Ordering */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Topic Settings</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Topic Name</label>
                    <Input
                      value={formTopic}
                      onChange={(e) => setFormTopic(e.target.value)}
                      placeholder="authvital-events"
                      disabled={isLoadingConfig}
                    />
                    <p className="text-xs text-muted-foreground">
                      The Pub/Sub topic name. The topic will be auto-created if it doesn't exist.
                    </p>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-white/10">
                    <div className="space-y-1">
                      <label className="text-sm font-medium">Message Ordering</label>
                      <p className="text-xs text-muted-foreground">
                        Enable ordering keys so messages for the same entity are delivered in order.
                      </p>
                    </div>
                    <Switch
                      checked={formOrdering}
                      onCheckedChange={setFormOrdering}
                      disabled={isLoadingConfig}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Event Selection */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Events</CardTitle>
                </CardHeader>
                <CardContent>
                  {isLoadingConfig ? (
                    <div className="h-32 flex items-center justify-center text-muted-foreground">
                      Loading event types...
                    </div>
                  ) : (
                    <WebhookEventPicker
                      value={formEvents}
                      onChange={setFormEvents}
                      categories={eventCategories}
                    />
                  )}
                </CardContent>
              </Card>

              {/* Info Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">About Pub/Sub Integration</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground space-y-2">
                  <p>
                    Events are published to Google Cloud Pub/Sub using an outbox pattern \u2014 events
                    are first written to the database, then asynchronously published. This ensures
                    no events are lost, even during transient failures.
                  </p>
                  <p>
                    AuthVital uses Application Default Credentials (ADC) to authenticate with
                    GCP. The service account must have the{' '}
                    <code className="text-xs bg-white/5 px-1 py-0.5 rounded">
                      roles/pubsub.publisher
                    </code>{' '}
                    role.
                  </p>
                  <p>
                    Downstream consumers create their own subscriptions on the topic. AuthVital
                    only handles publishing \u2014 consumption is managed independently.
                  </p>
                </CardContent>
              </Card>

              {/* Save Button (bottom) */}
              {hasChanges && (
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={handleDiscard}>
                    Discard Changes
                  </Button>
                  <Button onClick={handleSave} disabled={isSaving}>
                    <Save className="h-4 w-4 mr-2" />
                    {isSaving ? 'Saving...' : 'Save Changes'}
                  </Button>
                </div>
              )}
            </div>
          </TabsContent>

          {/* ============================================================= */}
          {/* OUTBOX TAB */}
          {/* ============================================================= */}

          <TabsContent value="outbox">
            <div className="space-y-6">
              {/* Stats Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatsCard
                  icon={<Clock className="h-5 w-5 text-yellow-400" />}
                  title="Pending"
                  value={outboxStats.PENDING ?? 0}
                  isLoading={isLoadingOutbox}
                />
                <StatsCard
                  icon={<Send className="h-5 w-5 text-green-400" />}
                  title="Published"
                  value={outboxStats.PUBLISHED ?? 0}
                  isLoading={isLoadingOutbox}
                />
                <StatsCard
                  icon={<XCircle className="h-5 w-5 text-red-400" />}
                  title="Failed"
                  value={outboxStats.FAILED ?? 0}
                  isLoading={isLoadingOutbox}
                />
                <StatsCard
                  icon={<SkipForward className="h-5 w-5 text-muted-foreground" />}
                  title="Skipped"
                  value={outboxStats.SKIPPED ?? 0}
                  isLoading={isLoadingOutbox}
                />
              </div>

              {/* Actions Bar */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <label className="text-sm text-muted-foreground">Filter:</label>
                  <select
                    className="rounded-md border border-white/10 bg-background px-3 py-1.5 text-sm"
                    value={outboxFilter}
                    onChange={(e) => setOutboxFilter(e.target.value)}
                  >
                    <option value="">All Statuses</option>
                    <option value="PENDING">Pending</option>
                    <option value="PUBLISHED">Published</option>
                    <option value="FAILED">Failed</option>
                    <option value="SKIPPED">Skipped</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  {(outboxStats.FAILED ?? 0) > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleRetryAll}
                      disabled={isRetrying}
                    >
                      <RotateCcw className="h-4 w-4 mr-2" />
                      {isRetrying ? 'Retrying...' : `Retry All Failed (${outboxStats.FAILED})`}
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={loadOutbox}>
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Events Table */}
              <Card>
                <CardContent className="p-0">
                  <Table
                    data={outboxEvents}
                    columns={outboxColumns}
                    isLoading={isLoadingOutbox}
                    emptyMessage="No outbox events found"
                  />
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}

export default PubSubPage;
