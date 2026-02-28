import * as React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Shield, Save, Trash2 } from 'lucide-react';
import { superAdminApi } from '@/lib/api';
import { AdminLayout, type BreadcrumbItem } from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';

// =============================================================================
// TYPES
// =============================================================================

interface Role {
  id: string;
  name: string;
  slug: string;
  description?: string;
}

// =============================================================================
// COMPONENT
// Roles are now simple: name, slug, description
// Permission checking happens in the consuming application layer
// =============================================================================

export function RoleDetailPage() {
  const { id, appId } = useParams<{ id: string; appId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [role, setRole] = React.useState<Role | null>(null);
  const [isLoadingRole, setIsLoadingRole] = React.useState(true);
  const [appName, setAppName] = React.useState<string>('');

  // Form state
  const [formData, setFormData] = React.useState({
    name: '',
    slug: '',
    description: '',
  });
  const [isSaving, setIsSaving] = React.useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = React.useState(false);

  // Delete modal state
  const [isDeleteModalOpen, setIsDeleteModalOpen] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);

  // Breadcrumbs
  const breadcrumbs: BreadcrumbItem[] = [
    { label: 'Admin', href: '/admin' },
    { label: 'Applications', href: '/admin/applications' },
    { label: appName || 'Application', href: `/admin/applications/${appId}` },
    { label: 'Roles', href: `/admin/applications/${appId}?tab=roles` },
    { label: role ? role.name : 'Role' },
  ];

  // Load role data
  const loadRole = React.useCallback(async () => {
    if (!id || !appId) return;

    try {
      setIsLoadingRole(true);
      const apps = await superAdminApi.getAllApplications();
      const app = apps?.find((a: any) => a.id === appId);

      if (app) {
        setAppName(app.name);
        const foundRole = app?.roles?.find((r: Role) => r.id === id);

        if (foundRole) {
          setRole(foundRole);
          setFormData({
            name: foundRole.name,
            slug: foundRole.slug,
            description: foundRole.description || '',
          });
        } else {
          toast({
            variant: 'error',
            title: 'Not Found',
            message: 'Role not found',
          });
          navigate(`/admin/applications/${appId}?tab=roles`);
        }
      }
    } catch (err: any) {
      const errorMessage =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to load role details';
      toast({
        variant: 'error',
        title: 'Error',
        message: errorMessage,
      });
    } finally {
      setIsLoadingRole(false);
    }
  }, [id, appId, navigate, toast]);

  React.useEffect(() => {
    loadRole();
  }, [loadRole]);

  // Track unsaved changes
  React.useEffect(() => {
    if (role) {
      const changed =
        formData.name !== role.name ||
        formData.slug !== role.slug ||
        formData.description !== (role.description || '');
      setHasUnsavedChanges(changed);
    }
  }, [formData, role]);

  // Handle form changes
  const handleChange =
    (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
      setFormData((prev) => ({ ...prev, [field]: e.target.value }));
    };

  // Generate slug from name
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.value;
    handleChange('name')(e);

    // Auto-generate slug only if slug hasn't been manually edited
    if (
      !formData.slug ||
      formData.slug === generateSlug(role?.name || '')
    ) {
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

  // Save role
  const handleSaveRole = async () => {
    if (!role || !formData.name || !formData.slug) {
      toast({
        variant: 'error',
        title: 'Error',
        message: 'Name and slug are required',
      });
      return;
    }

    try {
      setIsSaving(true);

      const updates: { name?: string; slug?: string; description?: string } =
        {};
      if (formData.name !== role.name) updates.name = formData.name;
      if (formData.slug !== role.slug) updates.slug = formData.slug;
      if (formData.description !== (role.description || ''))
        updates.description = formData.description;

      if (Object.keys(updates).length > 0) {
        await superAdminApi.updateRole(role.id, updates);
      }

      // Refresh role data
      await loadRole();

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
      setIsSaving(false);
    }
  };

  // Delete role
  const handleDeleteRole = async () => {
    if (!role) return;

    try {
      setIsDeleting(true);
      await superAdminApi.deleteRole(role.id);

      toast({
        variant: 'success',
        title: 'Success',
        message: 'Role deleted successfully',
      });

      navigate(`/admin/applications/${appId}?tab=roles`);
    } catch (err: any) {
      const errorMessage =
        err?.response?.data?.message || err?.message || 'Failed to delete role';
      toast({
        variant: 'error',
        title: 'Error',
        message: errorMessage,
      });
      setIsDeleteModalOpen(false);
    } finally {
      setIsDeleting(false);
    }
  };

  // Loading state
  if (isLoadingRole) {
    return (
      <AdminLayout title="Role Details" breadcrumbs={breadcrumbs}>
        <div className="flex items-center justify-center py-12">
          <div className="flex flex-col items-center gap-4">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <p className="text-sm text-muted-foreground">
              Loading role details...
            </p>
          </div>
        </div>
      </AdminLayout>
    );
  }

  // Role not found
  if (!role) {
    return (
      <AdminLayout title="Role Details" breadcrumbs={breadcrumbs}>
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <p className="text-muted-foreground">Role not found</p>
            <Button
              variant="outline"
              onClick={() => navigate(`/admin/applications/${appId}?tab=roles`)}
              className="mt-4"
            >
              Back to Roles
            </Button>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Role Details" breadcrumbs={breadcrumbs}>
      <div className="space-y-6">
        {/* Header Actions */}
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(`/admin/applications/${appId}?tab=roles`)}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Roles
          </Button>

          <div className="flex gap-2">
            {hasUnsavedChanges && (
              <Button
                onClick={handleSaveRole}
                disabled={isSaving}
                className="gap-2"
              >
                <Save className="h-4 w-4" />
                {isSaving ? 'Saving...' : 'Save Changes'}
              </Button>
            )}
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setIsDeleteModalOpen(true)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Role
            </Button>
          </div>
        </div>

        {/* Role Info Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-500/20">
                <Shield className="h-6 w-6 text-blue-400" />
              </div>
              <div className="flex-1">
                <CardTitle className="text-2xl">{formData.name}</CardTitle>
                <p className="text-sm text-muted-foreground font-mono">
                  {formData.slug}
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form className="space-y-4">
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
                    value={formData.name}
                    onChange={handleNameChange}
                    disabled={isSaving}
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
                    value={formData.slug}
                    onChange={handleChange('slug')}
                    disabled={isSaving}
                    className="bg-card font-mono"
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
                  value={formData.description}
                  onChange={handleChange('description')}
                  disabled={isSaving}
                  placeholder="Role description"
                  className="bg-card"
                />
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Info Card */}
        <Card>
          <CardContent className="pt-6">
            <div className="rounded-md border border-blue-500/20 bg-blue-500/10 p-4">
              <h4 className="font-medium text-blue-200 mb-2">About Roles</h4>
              <p className="text-sm text-blue-200/80">
                Roles in AuthVital are simple identifiers (name, slug,
                description). The actual permission logic is handled by your
                application based on the role slugs in the JWT token.
              </p>
              <p className="text-sm text-blue-200/80 mt-2">
                When a user authenticates, their assigned roles appear in the
                token as:{' '}
                <code className="bg-blue-500/20 px-1 rounded">
                  "app_roles": ["admin", "editor"]
                </code>
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Unsaved Changes Warning */}
        {hasUnsavedChanges && (
          <div className="rounded-md border border-yellow-500/50 bg-yellow-500/10 p-4">
            <p className="text-sm text-yellow-200">
              You have unsaved changes. Don't forget to save before leaving this
              page.
            </p>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="Delete Role"
        size="sm"
        footer={
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={() => setIsDeleteModalOpen(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteRole}
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Delete Role'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-muted-foreground">
            Are you sure you want to delete this role? Users with this role will
            lose it. This action cannot be undone.
          </p>
          <div className="rounded-md border border-white/10 bg-white/5 p-4">
            <p className="font-medium text-foreground">{role.name}</p>
            <p className="text-sm text-muted-foreground">{role.slug}</p>
          </div>
        </div>
      </Modal>
    </AdminLayout>
  );
}
