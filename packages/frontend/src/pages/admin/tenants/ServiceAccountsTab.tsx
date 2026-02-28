import * as React from 'react';
import { Plus, Key, Trash2, Copy } from 'lucide-react';
import { superAdminApi } from '@/lib/api';
import { Table, type Column } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';

// =============================================================================
// TYPES
// =============================================================================

interface ServiceAccount {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  keyPrefix: string;
  roleIds: string[];
  roles?: Array<{
    id: string;
    name: string;
  }>;
  isActive: boolean;
  createdAt: string;
  lastUsedAt?: string;
  [key: string]: any;
}

interface CreateServiceAccountForm {
  name: string;
  description?: string;
  roleIds: string[];
}

interface ServiceAccountsTabProps {
  tenantId: string;
  onRefresh: () => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function ServiceAccountsTab({ tenantId, onRefresh: _onRefresh }: ServiceAccountsTabProps) {
  const { toast } = useToast();
  
  const [serviceAccounts, setServiceAccounts] = React.useState<ServiceAccount[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  
  // Modal states
  const [isCreateModalOpen, setIsCreateModalOpen] = React.useState(false);
  const [isRevokeModalOpen, setIsRevokeModalOpen] = React.useState(false);
  const [accountToRevoke, setAccountToRevoke] = React.useState<ServiceAccount | null>(null);
  const [fullKey, setFullKey] = React.useState<string | null>(null);
  const [showKeyModal, setShowKeyModal] = React.useState(false);
  
  // Form state
  const [formData, setFormData] = React.useState<CreateServiceAccountForm>({
    name: '',
    description: '',
    roleIds: [],
  });
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Fetch service accounts
  const loadServiceAccounts = React.useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await superAdminApi.listServiceAccounts(tenantId);
      setServiceAccounts(data || []);
    } catch (err: any) {
      const errorMessage =
        err?. response?.data?.message ||
        err?.message ||
        'Failed to load service accounts';
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
    loadServiceAccounts();
  }, [loadServiceAccounts]);

  // Handle form change
  const handleFormChange = (field: keyof CreateServiceAccountForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData((prev) => ({ ...prev, [field]: e.target.value }));
  };

  // Handle create service account
  const handleCreateServiceAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name) {
      toast({
        variant: 'error',
        title: 'Error',
        message: 'Name is required',
      });
      return;
    }
    
    try {
      setIsSubmitting(true);
      const result = await superAdminApi.createServiceAccount(
        tenantId,
        formData.name,
        formData.roleIds,
        formData.description || undefined
      );
      
      // Show the full key in a modal
      setFullKey(result.apiKey || result.key);
      setShowKeyModal(true);
      
      // Close create modal and refresh
      setIsCreateModalOpen(false);
      setFormData({ name: '', description: '', roleIds: [] });
      loadServiceAccounts();
      
      toast({
        variant: 'success',
        title: 'Success',
        message: 'Service account created successfully',
      });
    } catch (err: any) {
      const errorMessage =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to create service account';
      toast({
        variant: 'error',
        title: 'Error',
        message: errorMessage,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle revoke service account
  const handleRevokeServiceAccount = async () => {
    if (!accountToRevoke) return;
    
    try {
      await superAdminApi.revokeServiceAccount(tenantId, accountToRevoke.id);
      setIsRevokeModalOpen(false);
      setAccountToRevoke(null);
      loadServiceAccounts();
      toast({
        variant: 'success',
        title: 'Success',
        message: 'Service account revoked successfully',
      });
    } catch (err: any) {
      const errorMessage =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to revoke service account';
      toast({
        variant: 'error',
        title: 'Error',
        message: errorMessage,
      });
    }
  };

  // Copy key to clipboard
  const handleCopyKey = () => {
    if (fullKey) {
      navigator.clipboard.writeText(fullKey);
      toast({
        variant: 'success',
        title: 'Copied',
        message: 'Key copied to clipboard',
      });
    }
  };

  // Format date
  const formatDate = (dateString: string | undefined) => {
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
  const columns: Column<ServiceAccount>[] = [
    {
      header: 'Name',
      accessor: 'name',
      cell: (_, row) => (
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/20">
            <Key className="h-4 w-4 text-purple-400" />
          </div>
          <div>
            <p className="font-medium text-foreground">{row.name}</p>
            {row.description && (
              <p className="text-sm text-muted-foreground">{row.description}</p>
            )}
          </div>
        </div>
      ),
    },
    {
      header: 'Key Prefix',
      accessor: 'keyPrefix',
      cell: (value) => (
        <code className="rounded bg-white/10 px-2 py-1 text-sm font-mono text-foreground">
          {value}...
        </code>
      ),
    },
    {
      header: 'Roles',
      accessor: 'roles',
      cell: (_, row) => (
        <div className="flex flex-wrap gap-1">
          {row.roles && row.roles.length > 0 ? (
            row.roles.map((role) => (
              <Badge key={role.id} variant="outline" className="text-xs">
                {role.name}
              </Badge>
            ))
          ) : (
            <span className="text-sm text-muted-foreground">No roles assigned</span>
          )}
        </div>
      ),
    },
    {
      header: 'Status',
      accessor: 'isActive',
      cell: (value) => (
        <Badge className={value ? 'bg-green-500/20 text-green-50 border-green-500/50' : 'bg-red-500/20 text-red-50 border-red-500/50'}>
          {value ? 'Active' : 'Revoked'}
        </Badge>
      ),
    },
    {
      header: 'Created',
      accessor: 'createdAt',
      cell: (value) => formatDate(value),
    },
    {
      header: 'Actions',
      accessor: 'id',
      cell: (_, row) => (
        <div className="flex items-center gap-2 justify-end">
          {row.isActive && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setAccountToRevoke(row);
                setIsRevokeModalOpen(true);
              }}
              title="Revoke service account"
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          )}
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
          <h2 className="text-lg font-semibold text-foreground">Service Accounts</h2>
          <p className="text-sm text-muted-foreground">
            API keys for machine-to-machine authentication
          </p>
        </div>
        <Button
          onClick={() => setIsCreateModalOpen(true)}
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          Create Service Account
        </Button>
      </div>

      {/* Service Accounts Table */}
      <div className="rounded-lg border border-white/10 bg-card">
        <Table
          data={serviceAccounts}
          columns={columns}
          isLoading={isLoading}
          emptyMessage="No service accounts found"
        />
      </div>

      {/* Create Service Account Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Create Service Account"
        size="md"
        footer={
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setIsCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateServiceAccount} disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Create Service Account'}
            </Button>
          </div>
        }
      >
        <form onSubmit={handleCreateServiceAccount} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Name <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => handleFormChange('name')(e)}
              placeholder="e.g., Production API Key"
              className="flex h-10 w-full rounded-md border border-white/20 bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => handleFormChange('description')(e)}
              placeholder="Optional description of this service account"
              className="flex min-h-24 w-full rounded-md border border-white/20 bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            />
          </div>
        </form>
      </Modal>

      {/* Show Key Modal */}
      <Modal
        isOpen={showKeyModal}
        onClose={() => setShowKeyModal(false)}
        title="Your API Key"
        size="md"
        footer={
          <div className="flex gap-2 justify-between">
            <Button variant="outline" onClick={() => setShowKeyModal(false)}>
              Close
            </Button>
            <Button onClick={handleCopyKey} className="gap-2">
              <Copy className="h-4 w-4" />
              Copy Key
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-muted-foreground">
            Please copy your API key now. You won't be able to see it again.
          </p>
          <div className="rounded-md bg-white/5 p-4">
            <code className="break-all text-sm font-mono text-foreground">
              {fullKey}
            </code>
          </div>
        </div>
      </Modal>

      {/* Revoke Confirmation Modal */}
      <Modal
        isOpen={isRevokeModalOpen}
        onClose={() => {
          setIsRevokeModalOpen(false);
          setAccountToRevoke(null);
        }}
        title="Revoke Service Account"
        size="sm"
        footer={
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={() => {
                setIsRevokeModalOpen(false);
                setAccountToRevoke(null);
              }}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleRevokeServiceAccount}>
              Revoke Service Account
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-muted-foreground">
            Are you sure you want to revoke this service account? This action cannot be undone.
          </p>
          {accountToRevoke && (
            <div className="rounded-md border border-white/10 bg-white/5 p-4">
              <p className="font-medium text-foreground">{accountToRevoke.name}</p>
              <p className="text-sm text-muted-foreground">{accountToRevoke.keyPrefix}...</p>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
