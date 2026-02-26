import * as React from 'react';
import { Plus, Globe, RefreshCw, Trash2, CheckCircle, Clock } from 'lucide-react';
import { domainApi } from '@/lib/api';
import { Table, type Column } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import type { Domain } from '@/types';

// =============================================================================
// TYPES
interface DomainsTabProps {
  tenantId: string;
  onRefresh: () => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function DomainsTab({ tenantId, onRefresh: _onRefresh }: DomainsTabProps) {
  const { toast } = useToast();
  
  const [domains, setDomains] = React.useState<Domain[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  
  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = React.useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = React.useState(false);
  const [domainToDelete, setDomainToDelete] = React.useState<Domain | null>(null);
  
  // Form state
  const [newDomain, setNewDomain] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Fetch domains
  const loadDomains = React.useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await domainApi.getTenantDomains(tenantId);
      setDomains(data || []);
    } catch (err: any) {
      const errorMessage =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to load domains';
      toast({
        variant: 'error',
        title: 'Error',
        message: errorMessage,
      });
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, toast]);

  React.useEffect(() => {
    loadDomains();
  }, [loadDomains]);

  // Handle add domain
  const handleAddDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newDomain) {
      toast({
        variant: 'error',
        title: 'Error',
        message: 'Domain is required',
      });
      return;
    }
    
    // Basic domain validation
    const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9](?:\.[a-zA-Z0-9]{2,})+$/;
    if (!domainRegex.test(newDomain)) {
      toast({
        variant: 'error',
        title: 'Error',
        message: 'Invalid domain format',
      });
      return;
    }
    
    try {
      setIsSubmitting(true);
      await domainApi.registerDomain(tenantId, newDomain);
      
      setIsAddModalOpen(false);
      setNewDomain('');
      loadDomains();
      
      toast({
        variant: 'success',
        title: 'Success',
        message: 'Domain added successfully',
      });
    } catch (err: any) {
      const errorMessage =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to add domain';
      toast({
        variant: 'error',
        title: 'Error',
        message: errorMessage,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle verify domain
  const handleVerifyDomain = async (domainId: string) => {
    try {
      await domainApi.verifyDomain(domainId);
      loadDomains();
      toast({
        variant: 'success',
        title: 'Success',
        message: 'Domain verification initiated',
      });
    } catch (err: any) {
      const errorMessage =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to verify domain';
      toast({
        variant: 'error',
        title: 'Error',
        message: errorMessage,
      });
    }
  };

  // Handle delete domain
  const handleDeleteDomain = async () => {
    if (!domainToDelete) return;
    
    try {
      await domainApi.deleteDomain(domainToDelete.id);
      setIsDeleteModalOpen(false);
      setDomainToDelete(null);
      loadDomains();
      
      toast({
        variant: 'success',
        title: 'Success',
        message: 'Domain deleted successfully',
      });
    } catch (err: any) {
      const errorMessage =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to delete domain';
      toast({
        variant: 'error',
        title: 'Error',
        message: errorMessage,
      });
    }
  };

  // Get status badge
  const getStatusBadge = (isVerified: boolean) => {
    if (isVerified) {
      return (
        <Badge className="bg-green-500/20 text-green-50 border-green-500/50">
          <CheckCircle className="mr-1 h-3 w-3" />
          Verified
        </Badge>
      );
    }
    return (
      <Badge className="bg-yellow-500/20 text-yellow-50 border-yellow-500/50">
        <Clock className="mr-1 h-3 w-3" />
        Pending
      </Badge>
    );
  };

  // Format date
  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return dateString || 'Never';
    }
  };

  // Table columns
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
    {
      header: 'Status',
      accessor: 'isVerified',
      cell: (value) => getStatusBadge(value),
    },
    {
      header: 'Verified At',
      accessor: 'verifiedAt',
      cell: (value) => formatDate(value),
    },
    {
      header: 'Actions',
      accessor: 'id',
      cell: (_, row) => (
        <div className="flex items-center gap-2 justify-end">
          {!row.isVerified && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleVerifyDomain(row.id)}
              title="Verify domain"
            >
              <RefreshCw className="h-4 w-4 text-blue-400" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setDomainToDelete(row);
              setIsDeleteModalOpen(true);
            }}
            title="Delete domain"
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      ),
      className: 'text-right',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Domains</h2>
          <p className="text-sm text-muted-foreground">
            Manage verified domains for this tenant
          </p>
        </div>
        <Button
          onClick={() => setIsAddModalOpen(true)}
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          Add Domain
        </Button>
      </div>

      {/* Domains Table */}
      <div className="rounded-lg border border-white/10 bg-card">
        <Table
          data={domains}
          columns={columns}
          isLoading={isLoading}
          emptyMessage="No domains found"
        />
      </div>

      {/* Add Domain Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add Domain"
        size="md"
        footer={
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setIsAddModalOpen(false)}>
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
              required
            />
            <p className="text-xs text-muted-foreground">
              Enter the domain name (e.g., example.com). You'll need to add a TXT record to verify ownership.
            </p>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setDomainToDelete(null);
        }}
        title="Delete Domain"
        size="sm"
        footer={
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={() => {
                setIsDeleteModalOpen(false);
                setDomainToDelete(null);
              }}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteDomain}>
              Delete Domain
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-muted-foreground">
            Are you sure you want to delete this domain?
          </p>
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
