import * as React from 'react';
import {
  Plus,
  Globe,
  RefreshCw,
  Trash2,
  CheckCircle,
  Clock,
  ShieldCheck,
  FileText,
  Copy,
} from 'lucide-react';
import { tenantApi } from '@/lib/api';
import { useTenant } from '@/contexts/TenantContext';
import { Table, type Column } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { StatsCard } from '@/components/ui/StatsCard';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { useToast } from '@/components/ui/Toast';
import type { Domain } from '@/types';

// Basic domain shape check (label.label, no protocol/path).
const DOMAIN_REGEX =
  /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9](?:\.[a-zA-Z0-9]{2,})+$/;

/**
 * DomainsPage - Tenant-facing domain management.
 *
 * Lets an org admin claim a domain, view the DNS TXT record needed to prove
 * ownership, verify it, and remove it. Talks to the tenant-scoped
 * /tenants/:tenantId/domains API (NOT the super-admin domain routes).
 */
export function DomainsPage() {
  const { tenantId, can } = useTenant();
  const { toast } = useToast();

  const canManage = can('domains:manage');

  const [domains, setDomains] = React.useState<Domain[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  const [isAddOpen, setIsAddOpen] = React.useState(false);
  const [newDomain, setNewDomain] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const [recordDomain, setRecordDomain] = React.useState<Domain | null>(null);
  const [domainToDelete, setDomainToDelete] = React.useState<Domain | null>(null);
  const [verifyingId, setVerifyingId] = React.useState<string | null>(null);

  const errMessage = (err: any, fallback: string) =>
    err?.response?.data?.message || err?.message || fallback;

  const loadDomains = React.useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await tenantApi.getDomains(tenantId);
      setDomains(data || []);
    } catch (err: any) {
      toast({ variant: 'error', title: 'Error', message: errMessage(err, 'Failed to load domains') });
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, toast]);

  React.useEffect(() => {
    loadDomains();
  }, [loadDomains]);

  const handleAddDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    const domain = newDomain.trim().toLowerCase();

    if (!DOMAIN_REGEX.test(domain)) {
      toast({ variant: 'error', title: 'Invalid domain', message: 'Enter a domain like example.com' });
      return;
    }

    try {
      setIsSubmitting(true);
      const created = await tenantApi.registerDomain(tenantId, domain);
      setIsAddOpen(false);
      setNewDomain('');
      await loadDomains();
      // Jump straight to the DNS record so they can set it up immediately.
      if (created?.verification) setRecordDomain(created);
      toast({ variant: 'success', title: 'Domain added', message: 'Add the DNS TXT record to verify ownership.' });
    } catch (err: any) {
      toast({ variant: 'error', title: 'Error', message: errMessage(err, 'Failed to add domain') });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerify = async (domain: Domain) => {
    try {
      setVerifyingId(domain.id);
      const result = await tenantApi.verifyDomain(tenantId, domain.id);
      await loadDomains();
      toast({
        variant: result?.success ? 'success' : 'error',
        title: result?.success ? 'Domain verified' : 'Not verified yet',
        message: result?.message || 'Verification attempted.',
      });
    } catch (err: any) {
      toast({ variant: 'error', title: 'Verification failed', message: errMessage(err, 'DNS TXT record not found yet') });
    } finally {
      setVerifyingId(null);
    }
  };

  const handleDelete = async () => {
    if (!domainToDelete) return;
    try {
      await tenantApi.deleteDomain(tenantId, domainToDelete.id);
      setDomainToDelete(null);
      await loadDomains();
      toast({ variant: 'success', title: 'Domain removed', message: 'The domain was removed.' });
    } catch (err: any) {
      toast({ variant: 'error', title: 'Error', message: errMessage(err, 'Failed to remove domain') });
    }
  };

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ variant: 'success', title: 'Copied', message: 'Copied to clipboard.' });
    } catch {
      toast({ variant: 'error', title: 'Copy failed', message: 'Could not access the clipboard.' });
    }
  };

  const formatDate = (value: string | null) => {
    if (!value) return 'Never';
    const d = new Date(value);
    return Number.isNaN(d.getTime())
      ? 'Never'
      : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const statusBadge = (isVerified: boolean) =>
    isVerified ? (
      <Badge variant="success">
        <CheckCircle className="mr-1 h-3 w-3" />
        Verified
      </Badge>
    ) : (
      <Badge variant="warning">
        <Clock className="mr-1 h-3 w-3" />
        Pending
      </Badge>
    );

  const verifiedCount = domains.filter((d) => d.isVerified).length;
  const pendingCount = domains.length - verifiedCount;
  const showEmpty = !isLoading && domains.length === 0;

  const columns: Column<Domain>[] = [
    {
      header: 'Domain',
      accessor: 'domainName',
      cell: (value) => (
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/20">
            <Globe className="h-4 w-4 text-blue-400" />
          </div>
          <p className="font-medium text-foreground">{value}</p>
        </div>
      ),
    },
    { header: 'Status', accessor: 'isVerified', cell: (value) => statusBadge(value) },
    { header: 'Added', accessor: 'createdAt', cell: (value) => formatDate(value) },
    {
      header: 'Actions',
      accessor: 'id',
      className: 'text-right',
      cell: (_, row) => (
        <div className="flex items-center justify-end gap-2">
          {!row.isVerified && (
            <Button variant="ghost" size="sm" title="View DNS record" onClick={() => setRecordDomain(row)}>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </Button>
          )}
          {!row.isVerified && canManage && (
            <Button
              variant="ghost"
              size="sm"
              title="Verify domain"
              disabled={verifyingId === row.id}
              onClick={() => handleVerify(row)}
            >
              <RefreshCw className={`h-4 w-4 text-blue-400 ${verifyingId === row.id ? 'animate-spin' : ''}`} />
            </Button>
          )}
          {canManage && (
            <Button variant="ghost" size="sm" title="Remove domain" onClick={() => setDomainToDelete(row)}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Domains</h1>
          <p className="text-muted-foreground">
            Verify domains you own to enable SSO enforcement and auto-join.
          </p>
        </div>
        {canManage && (
          <Button onClick={() => setIsAddOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Domain
          </Button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatsCard
          title="Domains"
          value={domains.length}
          isLoading={isLoading}
          subtitle="claimed by your org"
          icon={<Globe className="h-5 w-5 text-primary" />}
        />
        <StatsCard
          title="Verified"
          value={verifiedCount}
          isLoading={isLoading}
          subtitle="ready for SSO & auto-join"
          icon={<ShieldCheck className="h-5 w-5 text-green-400" />}
        />
        <StatsCard
          title="Pending"
          value={pendingCount}
          isLoading={isLoading}
          subtitle="awaiting DNS verification"
          icon={<Clock className="h-5 w-5 text-yellow-400" />}
        />
      </div>

      <Card>
        <CardHeader className="border-b border-white/10">
          <CardTitle className="text-lg">Claimed domains</CardTitle>
          <CardDescription>Verify domains you own to enable SSO enforcement and auto-join.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {showEmpty ? (
            <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Globe className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="font-medium text-foreground">No domains added yet</p>
                <p className="text-sm text-muted-foreground">
                  Claim a domain to unlock SSO enforcement and email-based auto-join.
                </p>
              </div>
              {canManage && (
                <Button onClick={() => setIsAddOpen(true)} className="mt-1 gap-2">
                  <Plus className="h-4 w-4" />
                  Add Domain
                </Button>
              )}
            </div>
          ) : (
            <Table data={domains} columns={columns} isLoading={isLoading} />
          )}
        </CardContent>
      </Card>

      {/* Add Domain */}
      <Modal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        title="Add Domain"
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsAddOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddDomain} disabled={isSubmitting}>
              {isSubmitting ? 'Adding...' : 'Add Domain'}
            </Button>
          </div>
        }
      >
        <form onSubmit={handleAddDomain} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Domain <span className="text-destructive">*</span>
            </label>
            <Input
              type="text"
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              placeholder="example.com"
              className="bg-card"
              autoFocus
              required
            />
            <p className="text-xs text-muted-foreground">
              After adding, you'll get a DNS TXT record to prove ownership.
            </p>
          </div>
        </form>
      </Modal>

      {/* DNS record */}
      <Modal
        isOpen={!!recordDomain}
        onClose={() => setRecordDomain(null)}
        title="Verify domain ownership"
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRecordDomain(null)}>
              Close
            </Button>
            {recordDomain && !recordDomain.isVerified && canManage && (
              <Button disabled={verifyingId === recordDomain.id} onClick={() => handleVerify(recordDomain)}>
                {verifyingId === recordDomain.id ? 'Checking...' : 'Verify now'}
              </Button>
            )}
          </div>
        }
      >
        {recordDomain && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {recordDomain.verification?.instructions ||
                `Add this TXT record to the DNS settings for ${recordDomain.domainName}, then verify. DNS changes can take up to 48 hours to propagate.`}
            </p>
            {(['type', 'name', 'value'] as const).map((field) => (
              <div key={field} className="space-y-1">
                <label className="text-xs font-medium uppercase text-muted-foreground">{field}</label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 truncate rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-foreground">
                    {recordDomain.verification?.txtRecord?.[field]}
                  </code>
                  <Button
                    variant="ghost"
                    size="sm"
                    title={`Copy ${field}`}
                    onClick={() => copy(recordDomain.verification?.txtRecord?.[field] ?? '')}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* Delete confirm */}
      <Modal
        isOpen={!!domainToDelete}
        onClose={() => setDomainToDelete(null)}
        title="Remove Domain"
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDomainToDelete(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Remove Domain
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-muted-foreground">Are you sure you want to remove this domain?</p>
          {domainToDelete && (
            <div className="rounded-md border border-white/10 bg-white/5 p-4">
              <p className="font-medium text-foreground">{domainToDelete.domainName}</p>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
