import * as React from 'react';
import { Plus, Key, Trash2, Copy, CheckCircle } from 'lucide-react';
import { superAdminApi } from '@/lib/api';
import { Table, type Column } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';

// =============================================================================
// TYPES
// =============================================================================

interface InstanceApiKey {
  id: string;
  name: string;
  description?: string;
  keyPrefix: string;
  createdAt: string;
  updatedAt: string;
  [key: string]: any;
}

interface FormData {
  name: string;
  description: string;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function ApiKeysTab() {
  const { toast } = useToast();
  
  const [apiKeys, setApiKeys] = React.useState<InstanceApiKey[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  
  // Modal states
  const [isCreateModalOpen, setIsCreateModalOpen] = React.useState(false);
  const [isKeyCreated, setIsKeyCreated] = React.useState(false);
  const [newKey, setNewKey] = React.useState<string | null>(null);
  
  // Form state
  const [formData, setFormData] = React.useState<FormData>({
    name: '',
    description: '',
  });
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Load API keys
  const loadApiKeys = React.useCallback(async () => {
    try {
      setIsLoading(true);
      const keys = await superAdminApi.getInstanceApiKeys();
      setApiKeys(keys || []);
    } catch (err: any) {
      const errorMessage =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to load API keys';
      toast({
        variant: 'error',
        title: 'Error',
        message: errorMessage,
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    loadApiKeys();
  }, [loadApiKeys]);

  // Handle form changes
  const handleChange = (field: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, [field]: e.target.value }));
  };

  // Handle create API key
  const handleCreateApiKey = async (e: React.FormEvent) => {
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
      const result = await superAdminApi.createInstanceApiKey({
        name: formData.name,
        description: formData.description || undefined,
      });
      
      // Set the new key for display
      setNewKey(result.apiKey || result.key || result.clientId);
      setIsKeyCreated(true);
      
      // Close and reset form
      setIsCreateModalOpen(false);
      setFormData({ name: '', description: '' });
      loadApiKeys();
      
      toast({
        variant: 'success',
        title: 'API Key Created',
        message: 'Your API key has been created. Copy it now!',
      });
    } catch (err: any) {
      const errorMessage =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to create API key';
      toast({
        variant: 'error',
        title: 'Error',
        message: errorMessage,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle revoke API key
  const handleRevokeApiKey = async (key: InstanceApiKey) => {
    if (!confirm(`Are you sure you want to revoke "${key.name}"? This action cannot be undone.`)) {
      return;
    }
    
    try {
      await superAdminApi.revokeInstanceApiKey(key.id);
      loadApiKeys();
      toast({
        variant: 'success',
        title: 'Success',
        message: 'API key revoked successfully',
      });
    } catch (err: any) {
      const errorMessage =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to revoke API key';
      toast({
        variant: 'error',
        title: 'Error',
        message: errorMessage,
      });
    }
  };

  // Handle copy key
  const handleCopyKey = () => {
    if (newKey) {
      navigator.clipboard.writeText(newKey);
      toast({
        variant: 'success',
        title: 'Copied',
        message: 'API key copied to clipboard',
      });
    }
  };

  // Format date
  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return dateString;
    }
  };

  // Table columns
  const columns: Column<InstanceApiKey>[] = [
    {
      header: 'Name',
      accessor: 'name',
      cell: (_, row) => (
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/20">
            <Key className="h-4 w-4 text-blue-400" />
          </div>
          <div>
            <p className="font-medium text-foreground">{row.name}</p>
            {row.description && (
              <p className="text-sm text-muted-foreground max-w-32 truncate">{row.description}</p>
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
      header: 'Created',
      accessor: 'createdAt',
      cell: (value) => formatDate(value),
    },
    {
      header: 'Actions',
      accessor: 'id',
      cell: (_, row) => (
        <div className="flex items-center gap-2 justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleRevokeApiKey(row)}
            title="Revoke API key"
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
          <h2 className="text-lg font-semibold text-foreground">Fleet Manager API Keys</h2>
          <p className="text-sm text-muted-foreground">
            Manage instance-level API keys for fleet operations
          </p>
        </div>
        <Button
          onClick={() => {
            setIsKeyCreated(false);
            setIsCreateModalOpen(true);
          }}
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          Create API Key
        </Button>
      </div>

      {/* API Keys Table */}
      <div className="rounded-lg border border-white/10 bg-card">
        <Table
          data={apiKeys}
          columns={columns}
          isLoading={isLoading}
          emptyMessage="No API keys found"
        />
      </div>

      {/* Create API Key Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => {
          setIsCreateModalOpen(false);
          setIsKeyCreated(false);
          setFormData({ name: '', description: '' });
        }}
        title={isKeyCreated ? 'API Key Created!' : 'Create API Key'}
        size="md"
        footer={
          isKeyCreated ? (
            <div className="flex gap-2 justify-between">
              <Button
                onClick={() => {
                  setIsCreateModalOpen(false);
                  setIsKeyCreated(false);
                  setFormData({ name: '', description: '' });
                }}
              >
                Close
              </Button>
              <Button onClick={handleCopyKey} className="gap-2">
                <Copy className="h-4 w-4" />
                Copy Key
              </Button>
            </div>
          ) : (
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setIsCreateModalOpen(false);
                  setIsKeyCreated(false);
                  setFormData({ name: '', description: '' });
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleCreateApiKey} disabled={isSubmitting}>
                {isSubmitting ? 'Creating...' : 'Create API Key'}
              </Button>
            </div>
          )
        }
      >
        {!isKeyCreated ? (
          <form onSubmit={handleCreateApiKey} className="space-y-4">
            {/* Description */}
            <div className="flex items-center gap-3 rounded-md border border-white/10 bg-white/5 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20">
                <Key className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">
                  New Fleet Manager API Key
                </p>
                <p className="text-xs text-muted-foreground">
                  Create a new instance-level API key for your fleet
                </p>
              </div>
            </div>

            {/* Name */}
            <div className="space-y-2">
              <label htmlFor="key-name" className="text-sm font-medium text-foreground">
                Name <span className="text-destructive">*</span>
              </label>
              <Input
                id="key-name"
                type="text"
                placeholder="Production API Key"
                value={formData.name}
                onChange={handleChange('name')}
                disabled={isSubmitting}
                required
                className="bg-card"
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <label htmlFor="key-description" className="text-sm font-medium text-foreground">
                Description
              </label>
              <Input
                id="key-description"
                type="text"
                placeholder="Optional description for this API key"
                value={formData.description}
                onChange={handleChange('description')}
                disabled={isSubmitting}
                className="bg-card"
              />
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            {/* Success Message */}
            <div className="rounded-md border border-green-500/50 bg-green-500/10 p-4">
              <div className="flex items-start gap-3">
                <CheckCircle className="h-5 w-5 text-green-50 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-green-50">
                    API Key Created Successfully!
                  </p>
                  <p className="text-xs text-green-50/80 mt-1">
                    Please copy your API key now. You won't be able to see it again.
                  </p>
                </div>
              </div>
            </div>

            {/* The Key */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Your API Key
              </label>
              <div className="rounded-md bg-white/5 p-4">
                <code className="break-all text-sm font-mono text-foreground">
                  {newKey}
                </code>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
