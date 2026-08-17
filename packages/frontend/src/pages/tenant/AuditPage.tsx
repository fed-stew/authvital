import * as React from 'react';
import { ScrollText, Download, ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react';
import { tenantApi } from '@/lib/api';
import { useTenant } from '@/contexts/TenantContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { SearchInput } from '@/components/ui/SearchInput';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/Select';
import { useToast } from '@/components/ui/Toast';
import type { AuditQueryResult, AuditLogItem } from '@/types';

/** Mirrors backend AUDIT_ACTIONS (audit/audit-actions.ts) for the filter. */
const ACTION_OPTIONS: { value: string; label: string }[] = [
  { value: 'member.role_changed', label: 'Member role changed' },
  { value: 'member.removed', label: 'Member removed' },
  { value: 'member.status_changed', label: 'Member status changed' },
  { value: 'invite.created', label: 'Invite created' },
  { value: 'invite.revoked', label: 'Invite revoked' },
  { value: 'app_access.granted', label: 'App access granted' },
  { value: 'app_access.revoked', label: 'App access revoked' },
  { value: 'app_access.role_changed', label: 'App role changed' },
  { value: 'license.granted', label: 'License granted' },
  { value: 'license.revoked', label: 'License revoked' },
  { value: 'license.changed', label: 'License changed' },
];

const ALL = '__all__';
const PAGE_SIZE = 25;

const errMessage = (err: any, fallback: string) =>
  err?.response?.data?.message || err?.message || fallback;

const formatWhen = (value: string) => {
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
};

const actionLabel = (action: string) =>
  ACTION_OPTIONS.find((o) => o.value === action)?.label ?? action;

/**
 * AuditPage - paginated, filterable tenant audit trail (audit:view).
 * Export button is only rendered when the caller holds audit:export (Owner).
 */
export function AuditPage() {
  const { tenantId, can } = useTenant();
  const { toast } = useToast();

  const canExport = can('audit:export');

  const [action, setAction] = React.useState<string>(ALL);
  const [actor, setActor] = React.useState('');
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');
  const [page, setPage] = React.useState(1);

  const [result, setResult] = React.useState<AuditQueryResult | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isExporting, setIsExporting] = React.useState(false);
  const [expanded, setExpanded] = React.useState<string | null>(null);

  const filterParams = React.useCallback(
    () => ({
      action: action === ALL ? undefined : action,
      actor: actor.trim() || undefined,
      from: from ? new Date(from).toISOString() : undefined,
      to: to ? new Date(to).toISOString() : undefined,
    }),
    [action, actor, from, to],
  );

  const load = React.useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await tenantApi.getAudit(tenantId, {
        ...filterParams(),
        page,
        pageSize: PAGE_SIZE,
      });
      setResult(data);
    } catch (err: any) {
      toast({ variant: 'error', title: 'Error', message: errMessage(err, 'Failed to load audit log') });
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, filterParams, page, toast]);

  React.useEffect(() => {
    load();
  }, [load]);

  // Reset to page 1 whenever a filter changes.
  React.useEffect(() => {
    setPage(1);
  }, [action, actor, from, to]);

  const handleExport = async () => {
    try {
      setIsExporting(true);
      const blob = await tenantApi.exportAudit(tenantId, filterParams());
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-${tenantId}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast({ variant: 'error', title: 'Export failed', message: errMessage(err, 'Could not export audit log') });
    } finally {
      setIsExporting(false);
    }
  };

  const clearFilters = () => {
    setAction(ALL);
    setActor('');
    setFrom('');
    setTo('');
  };

  const items = result?.items ?? [];
  const total = result?.total ?? 0;
  const totalPages = result?.totalPages ?? 1;
  const hasFilters = action !== ALL || actor || from || to;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Audit log</h1>
          <p className="text-muted-foreground">Security-relevant changes in your organization.</p>
        </div>
        {canExport && (
          <Button variant="outline" className="gap-2" onClick={handleExport} disabled={isExporting}>
            <Download className="h-4 w-4" />
            {isExporting ? 'Exporting...' : 'Export CSV'}
          </Button>
        )}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="w-48 space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Action</label>
            <Select value={action} onValueChange={setAction}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All actions</SelectItem>
                {ACTION_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-56 space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Actor (email or ID)</label>
            <SearchInput value={actor} onChange={setActor} placeholder="jane@example.com" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">From</label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">To</label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
          </div>
          {hasFilters && (
            <Button variant="ghost" className="gap-1.5" onClick={clearFilters}>
              <X className="h-4 w-4" />
              Clear
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b border-white/10">
          <CardTitle className="text-lg">Events</CardTitle>
          <CardDescription>{total.toLocaleString()} total events</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <ScrollText className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="font-medium text-foreground">No audit events</p>
                <p className="text-sm text-muted-foreground">
                  {hasFilters ? 'No events match your filters.' : 'Activity will show up here as it happens.'}
                </p>
              </div>
            </div>
          ) : (
            <div className="w-full overflow-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-white/10">
                    {['Time', 'Actor', 'Action', 'Target', ''].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((row: AuditLogItem) => {
                    const isOpen = expanded === row.id;
                    const hasMeta = row.metadata && Object.keys(row.metadata).length > 0;
                    return (
                      <React.Fragment key={row.id}>
                        <tr className="border-b border-white/5 hover:bg-white/5">
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-muted-foreground">
                            {formatWhen(row.createdAt)}
                          </td>
                          <td className="px-4 py-3 text-sm text-foreground">
                            {row.actorEmail || row.userId || <span className="text-muted-foreground">System</span>}
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant="secondary">{actionLabel(row.action)}</Badge>
                          </td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">
                            <span className="font-mono text-xs">{row.targetType}</span>
                            {row.targetId && (
                              <span className="ml-1 font-mono text-xs opacity-60">{row.targetId.slice(0, 8)}</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {hasMeta && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setExpanded(isOpen ? null : row.id)}
                              >
                                {isOpen ? 'Hide' : 'Details'}
                              </Button>
                            )}
                          </td>
                        </tr>
                        {isOpen && hasMeta && (
                          <tr className="border-b border-white/5 bg-black/20">
                            <td colSpan={5} className="px-4 py-3">
                              <pre className="overflow-auto rounded-md bg-white/5 p-3 text-xs text-muted-foreground">
                                {JSON.stringify(row.metadata, null, 2)}
                              </pre>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {result?.page ?? page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1"
              disabled={page <= 1 || isLoading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1"
              disabled={page >= totalPages || isLoading}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
