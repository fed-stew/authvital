import * as React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Building2, Trash2, Pencil } from 'lucide-react';
import { superAdminApi } from '@/lib/api';
import { AdminLayout, type BreadcrumbItem } from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { OverviewTab } from './OverviewTab';
import { MembersTab } from './MembersTab';
import { ServiceAccountsTab } from './ServiceAccountsTab';
import { DomainsTab } from './DomainsTab';
import { AppsTab } from './AppsTab';

// =============================================================================
// TYPES
// =============================================================================

interface TenantInfo {
  id: string;
  name: string;
  slug: string;
  memberCount?: number;
  createdAt: string;
  updatedAt: string;
  settings?: Record<string, any>;
  initiateLoginUri?: string | null;
  [key: string]: any;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function TenantDetailPage() {
  const { id: tenantId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [tenant, setTenant] = React.useState<TenantInfo | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState('overview');

  // Breadcrumbs
  const breadcrumbs: BreadcrumbItem[] = [
    { label: 'Admin', href: '/admin' },
    { label: 'Tenants', href: '/admin/tenants' },
    { label: tenant ? tenant.name : 'Loading...' },
  ];

  // Fetch tenant data
  const loadTenant = React.useCallback(async () => {
    if (!tenantId) return;
    
    try {
      setIsLoading(true);
      const data = await superAdminApi.getTenantDetail(tenantId);
      setTenant(data);
    } catch (err: any) {
      const errorMessage =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to load tenant details';
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
    loadTenant();
  }, [loadTenant]);

  // Handle delete tenant
  const handleDeleteTenant = async () => {
    if (!tenantId) return;
    
    try {
      setIsDeleting(true);
      await superAdminApi.deleteTenant(tenantId);
      
      toast({
        variant: 'success',
        title: 'Success',
        message: 'Tenant deleted successfully',
      });
      
      navigate('/admin/tenants');
    } catch (err: any) {
      const errorMessage =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to delete tenant';
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

  // Format date for display
  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return dateString;
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <AdminLayout title="Tenant Details">
        <div className="flex items-center justify-center py-12">
          <div className="flex flex-col items-center gap-4">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <p className="text-sm text-muted-foreground">Loading tenant details...</p>
          </div>
        </div>
      </AdminLayout>
    );
  }

  // Tenant not found
  if (!tenant) {
    return (
      <AdminLayout title="Tenant Details">
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <p className="text-muted-foreground">Tenant not found</p>
            <Button variant="outline" onClick={() => navigate('/admin/tenants')} className="mt-4">
              Back to Tenants
            </Button>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Tenant Details" breadcrumbs={breadcrumbs}>
      <div className="space-y-6">
        {/* Back Button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/admin/tenants')}
          className="gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Tenants
        </Button>

        {/* Tenant Header Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-4">
              {/* Icon */}
              <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-green-500/20">
                <Building2 className="h-8 w-8 text-green-400" />
              </div>

              <div className="space-y-1">
                <CardTitle>{tenant.name}</CardTitle>
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <Badge variant="outline">{tenant.slug}</Badge>
                  <span>•</span>
                  <span>{tenant.memberCount || 0} members</span>
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" size="sm">
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setIsDeleteModalOpen(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Tenant ID</p>
                <p className="text-sm text-foreground font-mono">{tenant.id}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Slug</p>
                <p className="text-foreground">{tenant.slug}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Created</p>
                <p className="text-foreground">{formatDate(tenant.createdAt)}</p>
              </div>
              {tenant.initiateLoginUri && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Initiate Login URI</p>
                  <p className="text-sm text-foreground font-mono truncate">{tenant.initiateLoginUri}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Tabs Content */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="members">Members</TabsTrigger>
            <TabsTrigger value="service-accounts">Service Accounts</TabsTrigger>
            <TabsTrigger value="domains">Domains</TabsTrigger>
            <TabsTrigger value="apps">Apps</TabsTrigger>
          </TabsList>
          <TabsContent value="overview">
            <OverviewTab tenant={tenant} tenantId={tenantId!} onRefresh={loadTenant} />
          </TabsContent>
          <TabsContent value="members">
            <MembersTab tenantId={tenantId!} onRefresh={loadTenant} />
          </TabsContent>
          <TabsContent value="service-accounts">
            <ServiceAccountsTab tenantId={tenantId!} onRefresh={loadTenant} />
          </TabsContent>
          <TabsContent value="domains">
            <DomainsTab tenantId={tenantId!} onRefresh={loadTenant} />
          </TabsContent>
          <TabsContent value="apps">
            <AppsTab tenantId={tenantId!} onRefresh={loadTenant} />
          </TabsContent>
        </Tabs>
      </div>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="Delete Tenant"
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
              onClick={handleDeleteTenant}
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Delete Tenant'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-muted-foreground">
            Are you sure you want to delete this tenant? This action cannot be undone and will remove all associated data including members, service accounts, and domains.
          </p>
          <div className="rounded-md border border-white/10 bg-white/5 p-4">
            <p className="font-medium text-foreground">{tenant.name}</p>
            <p className="text-sm text-muted-foreground">{tenant.slug}</p>
          </div>
        </div>
      </Modal>
    </AdminLayout>
  );
}
