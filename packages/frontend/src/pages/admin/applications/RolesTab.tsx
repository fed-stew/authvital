import * as React from 'react';
import { Plus, Pencil, Trash2, Shield } from 'lucide-react';
import { superAdminApi } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Switch } from '@/components/ui/Switch';
import { Table, type Column } from '@/components/ui/Table';
import { useToast } from '@/components/ui/Toast';
import type { ApplicationInfo } from './AppDetailPage';

// =============================================================================
// TYPES
// =============================================================================

interface Role {
  id: string;
  name: string;
  slug: string;
  description?: string;
  isDefault?: boolean;
}

interface RolesTabProps {
  app: ApplicationInfo;
  appId: string;
  onRefresh: () => void;
}

// =============================================================================
// COMPONENT
// Roles are now simple: name, slug, description
// Permission checking happens in the consuming application layer
// =============================================================================

export function RolesTab({ app, appId, onRefresh: _onRefresh }: RolesTabProps) {
  const { toast } = useToast();

  const [roles, setRoles] = React.useState<Role[]>(app.roles || []);

  // Modal states
  const [isCreateModalOpen, setIsCreateModalOpen] = React.useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = React.useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = React.useState(false);
  const [roleToDelete, setRoleToDelete] = React.useState<Role | null>(null);
  const [roleToEdit, setRoleToEdit] = React.useState<Role | null>(null);

  // Form state
  const [formData, setFormData] = React.useState({
    name: '',
    slug: '',
    description: '',
  });
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Handle form changes
  const handleChange =
    (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
      setFormData((prev) => ({ ...prev, [field]: e.target.value }));
    };

  // Auto-generate slug from name
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.value;
    handleChange('name')(e);

    // Auto-generate slug only if slug hasn't been manually edited
    if (!formData.slug || formData.slug === generateSlug(formData.name)) {
      setFormData((prev) => ({ ...prev, slug: generateSlug(name) }));
    }
  };

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  };

  // Create role
  const handleCreateRole = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.slug) {
      toast({
        variant: 'error',
        title: 'Error',
        message: 'Name and slug are required',
      });
      return;
    }

    try {
      setIsSubmitting(true);
      await superAdminApi.createRole(
        appId,
        formData.name,
        formData.slug,
        formData.description || undefined
      );

      setIsCreateModalOpen(false);
      resetForm();
      loadRoles();

      toast({
        variant: 'success',
        title: 'Success',
        message: 'Role created successfully',
      });
    } catch (err: any) {
      const errorMessage =
        err?.response?.data?.message || err?.message || 'Failed to create role';
      toast({
        variant: 'error',
        title: 'Error',
        message: errorMessage,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete role
  const handleDeleteRole = async () => {
    if (!roleToDelete) return;

    try {
      await superAdminApi.deleteRole(roleToDelete.id);
      setIsDeleteModalOpen(false);
      setRoleToDelete(null);
      loadRoles();

      toast({
        variant: 'success',
        title: 'Success',
        message: 'Role deleted successfully',
      });
    } catch (err: any) {
      const errorMessage =
        err?.response?.data?.message || err?.message || 'Failed to delete role';
      toast({
        variant: 'error',
        title: 'Error',
        message: errorMessage,
      });
    }
  };

  // Set role as default
  const handleSetDefault = async (role: Role) => {
    if (role.isDefault) return; // Already default

    try {
      await superAdminApi.setDefaultRole(role.id);
      loadRoles();
      toast({
        variant: 'success',
        title: 'Default Role Updated',
        message: `${role.name} is now the default role`,
      });
    } catch (err: any) {
      const errorMessage =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to set default role';
      toast({
        variant: 'error',
        title: 'Error',
        message: errorMessage,
      });
    }
  };

  // Load roles
  const loadRoles = async () => {
    try {
      const apps = await superAdminApi.getAllApplications();
      const currentApp = apps?.find((a: ApplicationInfo) => a.id === appId);
      if (currentApp) {
        setRoles(currentApp.roles || []);
      }
    } catch (err: any) {
      console.error('Failed to load roles:', err);
    }
  };

  // Reset form
  const resetForm = () => {
    setFormData({
      name: '',
      slug: '',
      description: '',
    });
  };

  // Open edit modal
  const openEditModal = (role: Role) => {
    setRoleToEdit(role);
    setFormData({
      name: role.name,
      slug: role.slug,
      description: role.description || '',
    });
    setIsEditModalOpen(true);
  };

  // Update role
  const handleUpdateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roleToEdit) return;

    if (!formData.name || !formData.slug) {
      toast({
        variant: 'error',
        title: 'Error',
        message: 'Name and slug are required',
      });
      return;
    }

    try {
      setIsSubmitting(true);
      await superAdminApi.updateRole(roleToEdit.id, {
        name: formData.name,
        slug: formData.slug,
        description: formData.description || undefined,
      });

      setIsEditModalOpen(false);
      setRoleToEdit(null);
      resetForm();
      loadRoles();

      toast({
        variant: 'success',
        title: 'Success',
        message: 'Role updated successfully',
      });
    } catch (err: any) {
      const errorMessage =
        err?.response?.data?.message || err?.message || 'Failed to update role';
      toast({
        variant: 'error',
        title: 'Error',
        message: errorMessage,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Table columns
  const columns: Column<Role>[] = [
    {
      header: 'Name',
      accessor: 'name',
      cell: (_, row) => (
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/20">
            <Shield className="h-4 w-4 text-blue-400" />
          </div>
          <div>
            <p className="font-medium text-foreground">{row.name}</p>
            <p className="text-sm text-muted-foreground">{row.slug}</p>
          </div>
        </div>
      ),
    },
    {
      header: 'Default',
      accessor: 'isDefault',
      cell: (_, row) => (
        <div className="flex items-center">
          <Switch
            checked={row.isDefault || false}
            onCheckedChange={() => handleSetDefault(row)}
            disabled={row.isDefault}
            aria-label={`Set ${row.name} as default`}
          />
        </div>
      ),
      className: 'w-24',
    },
    {
      header: 'Description',
      accessor: 'description',
      cell: (value) => (
        <span className="text-muted-foreground">{value || '-'}</span>
      ),
    },
    {
      header: 'Actions',
      accessor: 'id',
      cell: (_, row) => (
        <div className="flex items-center gap-2 justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openEditModal(row)}
            title="Edit role"
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setRoleToDelete(row);
              setIsDeleteModalOpen(true);
            }}
            title="Delete role"
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
          <h2 className="text-lg font-semibold text-foreground">Roles</h2>
          <p className="text-sm text-muted-foreground">
            Define roles for this application. Permission logic is handled by
            the consuming application.
          </p>
        </div>
        <Button
          onClick={() => {
            resetForm();
            setIsCreateModalOpen(true);
          }}
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          Create Role
        </Button>
      </div>

      {/* Roles Table */}
      <div className="rounded-lg border border-white/10 bg-card">
        <Table
          data={roles}
          columns={columns}
          isLoading={false}
          emptyMessage="No roles found. Create your first role to get started."
        />
      </div>

      {/* Create Role Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Create Role"
        size="md"
        footer={
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={() => setIsCreateModalOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateRole} disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Create Role'}
            </Button>
          </div>
        }
      >
        <form onSubmit={handleCreateRole} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label
                htmlFor="name"
                className="text-sm font-medium text-foreground"
              >
                Name <span className="text-destructive">*</span>
              </label>
              <Input
                id="name"
                type="text"
                placeholder="Project Manager"
                value={formData.name}
                onChange={handleNameChange}
                disabled={isSubmitting}
                required
                className="bg-card"
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="slug"
                className="text-sm font-medium text-foreground"
              >
                Slug <span className="text-destructive">*</span>
              </label>
              <Input
                id="slug"
                type="text"
                placeholder="project-manager"
                value={formData.slug}
                onChange={handleChange('slug')}
                disabled={isSubmitting}
                required
                className="bg-card"
              />
              <p className="text-xs text-muted-foreground">
                Used in JWT tokens and API calls
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="description"
              className="text-sm font-medium text-foreground"
            >
              Description
            </label>
            <Input
              id="description"
              type="text"
              placeholder="Manages project boards and team assignments"
              value={formData.description}
              onChange={handleChange('description')}
              disabled={isSubmitting}
              className="bg-card"
            />
          </div>
        </form>
      </Modal>

      {/* Delete Role Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setRoleToDelete(null);
        }}
        title="Delete Role"
        size="sm"
        footer={
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={() => {
                setIsDeleteModalOpen(false);
                setRoleToDelete(null);
              }}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteRole}>
              Delete Role
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-muted-foreground">
            Are you sure you want to delete this role? Users with this role will
            lose it. This action cannot be undone.
          </p>
          {roleToDelete && (
            <div className="rounded-md border border-white/10 bg-white/5 p-4">
              <p className="font-medium text-foreground">{roleToDelete.name}</p>
              <p className="text-sm text-muted-foreground">
                {roleToDelete.slug}
              </p>
            </div>
          )}
        </div>
      </Modal>

      {/* Edit Role Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setRoleToEdit(null);
          resetForm();
        }}
        title="Edit Role"
      >
        <form onSubmit={handleUpdateRole} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Name
            </label>
            <Input
              value={formData.name}
              onChange={handleNameChange}
              placeholder="e.g., Admin, Editor, Viewer"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Slug
            </label>
            <Input
              value={formData.slug}
              onChange={handleChange('slug')}
              placeholder="e.g., admin, editor, viewer"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Used in code to reference this role
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Description
            </label>
            <Input
              value={formData.description}
              onChange={handleChange('description')}
              placeholder="What can this role do?"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsEditModalOpen(false);
                setRoleToEdit(null);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
