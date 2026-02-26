import * as React from 'react';
import { superAdminApi } from '@/lib/api';
import { useAdmin } from '@/contexts/AdminContext';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Table, Column } from '@/components/ui/Table';
import { Plus, Trash2, ShieldCheck } from 'lucide-react';

// =============================================================================
// TYPES
// =============================================================================

interface SuperAdmin {
  id: string;
  email: string;
  username: string | null;
  displayName: string | null;
  givenName: string | null;
  familyName: string | null;
  pictureUrl: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function AdminAccountsPage() {
  const { admin: currentAdmin } = useAdmin();
  const { toast } = useToast();
  
  const [admins, setAdmins] = React.useState<SuperAdmin[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState<string | null>(null);
  
  // Create form state
  const [createForm, setCreateForm] = React.useState({
    email: '',
    password: '',
    givenName: '',
    familyName: '',
  });
  const [isCreating, setIsCreating] = React.useState(false);
  const [autoGeneratePassword, setAutoGeneratePassword] = React.useState(true);

  // Load admins
  const loadAdmins = React.useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await superAdminApi.getAdminAccounts();
      setAdmins(data);
    } catch (err: any) {
      toast({
        variant: 'error',
        title: 'Error',
        message: err?.response?.data?.message || 'Failed to load admin accounts',
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    loadAdmins();
  }, [loadAdmins]);

  // Format date
  const formatDate = (date: string | null) => {
    if (!date) return 'Never';
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Delete admin
  const handleDelete = async (adminId: string, email: string) => {
    if (adminId === currentAdmin?.id) {
      toast({
        variant: 'error',
        title: 'Error',
        message: 'You cannot delete your own account',
      });
      return;
    }

    if (!confirm(`Are you sure you want to delete the admin account "${email}"? This action cannot be undone.`)) {
      return;
    }

    setIsDeleting(adminId);
    try {
      await superAdminApi.deleteAdminAccount(adminId);
      toast({
        variant: 'success',
        title: 'Success',
        message: 'Admin account deleted',
      });
      await loadAdmins();
    } catch (err: any) {
      toast({
        variant: 'error',
        title: 'Error',
        message: err?.response?.data?.message || 'Failed to delete admin account',
      });
    } finally {
      setIsDeleting(null);
    }
  };

  // Create admin
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.email) return;
    if (!autoGeneratePassword && !createForm.password) return;

    setIsCreating(true);
    try {
      await superAdminApi.createAdminAccount({
        email: createForm.email,
        givenName: createForm.givenName || undefined,
        familyName: createForm.familyName || undefined,
        ...(autoGeneratePassword ? {} : { password: createForm.password }),
      });
      toast({
        variant: 'success',
        title: 'Success',
        message: autoGeneratePassword 
          ? 'Admin account created. Login credentials have been emailed.'
          : 'Admin account created successfully',
      });
      setIsCreateModalOpen(false);
      setCreateForm({ email: '', password: '', givenName: '', familyName: '' });
      setAutoGeneratePassword(true);
      await loadAdmins();
    } catch (err: any) {
      toast({
        variant: 'error',
        title: 'Error',
        message: err?.response?.data?.message || 'Failed to create admin account',
      });
    } finally {
      setIsCreating(false);
    }
  };

  // Table columns
  const columns: Column<SuperAdmin>[] = [
    {
      header: 'Admin',
      accessor: 'email',
      cell: (_, row) => (
        <div className="flex items-center gap-3">
          {row.pictureUrl ? (
            <img 
              src={row.pictureUrl} 
              alt="" 
              className="h-9 w-9 rounded-full object-cover"
            />
          ) : (
            <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
              <ShieldCheck className="h-4 w-4 text-primary" />
            </div>
          )}
          <div>
            <div className="font-medium flex items-center gap-2">
              {row.displayName || row.email}
              {row.id === currentAdmin?.id && (
                <Badge variant="secondary" className="text-xs">You</Badge>
              )}
            </div>
            {row.displayName && (
              <div className="text-sm text-muted-foreground">{row.email}</div>
            )}
          </div>
        </div>
      ),
    },
    {
      header: 'Status',
      accessor: 'isActive',
      cell: (value) => (
        <Badge variant={value ? 'success' : 'secondary'}>
          {value ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      header: 'Last Login',
      accessor: 'lastLoginAt',
      cell: (value) => (
        <span className="text-muted-foreground">{formatDate(value)}</span>
      ),
    },
    {
      header: 'Created',
      accessor: 'createdAt',
      cell: (value) => (
        <span className="text-muted-foreground">{formatDate(value)}</span>
      ),
    },
    {
      header: 'Actions',
      accessor: 'id',
      className: 'w-[100px]',
      cell: (_, row) => (
        row.id !== currentAdmin?.id ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              handleDelete(row.id, row.email);
            }}
            disabled={isDeleting === row.id}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        ) : null
      ),
    },
  ];

  return (
    <AdminLayout title="Admin Accounts">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Admin Accounts</h2>
            <p className="text-muted-foreground">
              Manage super admin accounts for this AuthVader instance
            </p>
          </div>
          <Button onClick={() => setIsCreateModalOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Admin
          </Button>
        </div>

        {/* Admins Table */}
        <Card>
          <CardContent className="p-0">
            <Table
              data={admins}
              columns={columns}
              isLoading={isLoading}
              emptyMessage="No admin accounts found"
            />
          </CardContent>
        </Card>

        {/* Info Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">About Admin Accounts</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>
              <strong>Super Admins</strong> have full access to this AuthVader instance. 
              They can manage users, tenants, applications, and system settings.
            </p>
            <p>
              Admin accounts are separate from regular user accounts in the directory. 
              They can only access the admin console, not client applications.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Create Admin Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Add Admin Account"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Email</label>
            <Input
              type="email"
              value={createForm.email}
              onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
              placeholder="admin@example.com"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">First Name</label>
              <Input
                type="text"
                value={createForm.givenName}
                onChange={(e) => setCreateForm({ ...createForm, givenName: e.target.value })}
                placeholder="Jane"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Last Name</label>
              <Input
                type="text"
                value={createForm.familyName}
                onChange={(e) => setCreateForm({ ...createForm, familyName: e.target.value })}
                placeholder="Doe"
              />
            </div>
          </div>
          
          {/* Auto-generate password toggle */}
          <div className="flex items-center justify-between py-2">
            <div>
              <label className="text-sm font-medium">Auto-generate password</label>
              <p className="text-xs text-muted-foreground">
                Send login credentials via email
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={autoGeneratePassword}
              onClick={() => setAutoGeneratePassword(!autoGeneratePassword)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                autoGeneratePassword ? 'bg-primary' : 'bg-muted'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  autoGeneratePassword ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Password field - only shown when not auto-generating */}
          {!autoGeneratePassword && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Password</label>
              <Input
                type="password"
                value={createForm.password}
                onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                placeholder="••••••••"
                required
                minLength={8}
              />
              <p className="text-xs text-muted-foreground">
                Minimum 8 characters
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsCreateModalOpen(false);
                setAutoGeneratePassword(true);
                setCreateForm({ email: '', password: '', givenName: '', familyName: '' });
              }}
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={isCreating || (!autoGeneratePassword && createForm.password.length < 8)}
            >
              {isCreating ? 'Creating...' : 'Create Admin'}
            </Button>
          </div>
        </form>
      </Modal>
    </AdminLayout>
  );
}

export default AdminAccountsPage;
