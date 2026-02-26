import * as React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { superAdminApi } from '@/lib/api';
import { AdminLayout, type BreadcrumbItem } from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import { SettingsTab } from './SettingsTab';
import { AccessTab } from './AccessTab';
import { BrandingTab } from './BrandingTab';
import { RolesTab } from './RolesTab';
import { LicensesTab } from './LicensesTab';

// =============================================================================
// TYPES
// =============================================================================

export interface ApplicationInfo {
  id: string;
  clientId: string;
  name: string;
  slug: string;
  description?: string;
  isActive: boolean;
  redirectUris?: string[];
  postLogoutRedirectUri?: string;
  initiateLoginUri?: string;
  accessTokenTtl?: number;
  refreshTokenTtl?: number;
  createdAt: string;
  updatedAt: string;
  // Branding
  brandingName?: string;
  brandingLogoUrl?: string;
  brandingIconUrl?: string;
  brandingPrimaryColor?: string;
  brandingBackgroundColor?: string;
  brandingAccentColor?: string;
  brandingSupportUrl?: string;
  brandingPrivacyUrl?: string;
  brandingTermsUrl?: string;
  // Roles (simple: name, slug, description - no permissions)
  roles?: Array<{
    id: string;
    name: string;
    slug: string;
    description?: string;
    isDefault?: boolean;
  }>;
  // Licensing
  licensingMode?: string;
  accessMode?: string;
  defaultLicenseTypeId?: string;
  defaultSeatCount?: number;
  autoProvisionOnSignup?: boolean;
  autoGrantToOwner?: boolean;
  // Webhooks
  webhookUrl?: string | null;
  webhookEnabled?: boolean;
  webhookEvents?: string[];
  [key: string]: any;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function AppDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [app, setApp] = React.useState<ApplicationInfo | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState('settings');
  
  // Breadcrumbs
  const breadcrumbs: BreadcrumbItem[] = [
    { label: 'Admin', href: '/admin' },
    { label: 'Applications', href: '/admin/applications' },
    { label: app ? app.name : 'Loading...' },
  ];

  // Fetch app data
  const loadApp = React.useCallback(async () => {
    if (!id) return;
    
    try {
      setIsLoading(true);
      const apps = await superAdminApi.getAllApplications();
      const foundApp = apps?.find((a: ApplicationInfo) => a.id === id);
      
      if (foundApp) {
        setApp(foundApp);
      } else {
        toast({
          variant: 'error',
          title: 'Not Found',
          message: 'Application not found',
        });
        navigate('/admin/applications');
      }
    } catch (err: any) {
      const errorMessage =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to load application details';
      toast({
        variant: 'error',
        title: 'Error',
        message: errorMessage,
      });
    } finally {
      setIsLoading(false);
    }
  }, [id, navigate, toast]);

  React.useEffect(() => {
    loadApp();
  }, [loadApp]);

  // Handle delete app
  const handleDeleteApp = async () => {
    if (!id) return;
    
    try {
      setIsDeleting(true);
      await superAdminApi.deleteApplication(id);
      
      toast({
        variant: 'success',
        title: 'Success',
        message: 'Application deleted successfully',
      });
      
      navigate('/admin/applications');
    } catch (err: any) {
      const errorMessage =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to delete application';
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
  if (isLoading) {
    return (
      <AdminLayout title="Application Details">
        <div className="flex items-center justify-center py-12">
          <div className="flex flex-col items-center gap-4">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <p className="text-sm text-muted-foreground">Loading application details...</p>
          </div>
        </div>
      </AdminLayout>
    );
  }

  // App not found
  if (!app) {
    return (
      <AdminLayout title="Application Details">
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <p className="text-muted-foreground">Application not found</p>
            <Button variant="outline" onClick={() => navigate('/admin/applications')} className="mt-4">
              Back to Applications
            </Button>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Application Details" breadcrumbs={breadcrumbs}>
      <div className="space-y-6">
        {/* Back Button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/admin/applications')}
          className="gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Applications
        </Button>

        {/* Tabs Content */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="settings">Settings</TabsTrigger>
            <TabsTrigger value="access">Access</TabsTrigger>
            <TabsTrigger value="licensing">Licensing</TabsTrigger>
            <TabsTrigger value="roles">Roles</TabsTrigger>
            <TabsTrigger value="branding">Branding</TabsTrigger>
          </TabsList>
          <TabsContent value="settings">
            <SettingsTab app={app} appId={id!} onRefresh={loadApp} />
          </TabsContent>
          <TabsContent value="access">
            <AccessTab app={app} appId={id!} onRefresh={loadApp} />
          </TabsContent>
          <TabsContent value="licensing">
            <LicensesTab app={app} appId={id!} onRefresh={loadApp} />
          </TabsContent>
          <TabsContent value="roles">
            <RolesTab app={app} appId={id!} onRefresh={loadApp} />
          </TabsContent>
          <TabsContent value="branding">
            <BrandingTab app={app} appId={id!} onRefresh={loadApp} />
          </TabsContent>
        </Tabs>
      </div>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="Delete Application"
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
              onClick={handleDeleteApp}
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Delete Application'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-muted-foreground">
            Are you sure you want to delete this application? This action cannot be undone and will revoke all access for this application.
          </p>
          <div className="rounded-md border border-white/10 bg-white/5 p-4">
            <p className="font-medium text-foreground">{app.name}</p>
            <p className="text-sm text-muted-foreground">{app.slug}</p>
          </div>
        </div>
      </Modal>
    </AdminLayout>
  );
}