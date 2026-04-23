import * as React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, AlertTriangle, Power, Trash2 } from 'lucide-react';
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
  const [isDisabling, setIsDisabling] = React.useState(false);
  const [isEnabling, setIsEnabling] = React.useState(false);
  const [showDisableModal, setShowDisableModal] = React.useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = React.useState('');
  
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
      setDeleteConfirmName('');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDisableApp = async () => {
    if (!id) return;
    try {
      setIsDisabling(true);
      const result = await superAdminApi.disableApplication(id);
      toast({
        variant: 'success',
        title: 'Application Disabled',
        message: result.message || 'Application has been disabled.',
      });
      setShowDisableModal(false);
      loadApp(); // Refresh
    } catch (err: any) {
      toast({
        variant: 'error',
        title: 'Error',
        message: err?.response?.data?.message || err?.message || 'Failed to disable application',
      });
    } finally {
      setIsDisabling(false);
    }
  };

  const handleEnableApp = async () => {
    if (!id) return;
    try {
      setIsEnabling(true);
      await superAdminApi.enableApplication(id);
      toast({
        variant: 'success',
        title: 'Application Enabled',
        message: 'Application has been re-enabled.',
      });
      loadApp(); // Refresh
    } catch (err: any) {
      toast({
        variant: 'error',
        title: 'Error',
        message: err?.response?.data?.message || err?.message || 'Failed to enable application',
      });
    } finally {
      setIsEnabling(false);
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

        {/* Danger Zone */}
        <div className="mt-8 rounded-lg border border-red-500/30 bg-red-500/5">
          <div className="border-b border-red-500/20 px-6 py-4">
            <h3 className="flex items-center gap-2 text-lg font-semibold text-red-400">
              <AlertTriangle className="h-5 w-5" />
              Danger Zone
            </h3>
          </div>
          
          <div className="divide-y divide-red-500/10">
            {/* Disable/Enable */}
            <div className="flex items-center justify-between px-6 py-4">
              <div>
                <p className="font-medium text-foreground">
                  {app.isActive ? 'Disable this application' : 'Enable this application'}
                </p>
                <p className="text-sm text-muted-foreground">
                  {app.isActive
                    ? 'Disabling will revoke all active sessions and prevent new logins. Existing data is preserved.'
                    : 'Re-enable this application to allow logins again.'}
                </p>
              </div>
              {app.isActive ? (
                <Button
                  variant="outline"
                  onClick={() => setShowDisableModal(true)}
                  disabled={isDisabling}
                  className="border-orange-500/50 text-orange-400 hover:bg-orange-500/10"
                >
                  <Power className="mr-2 h-4 w-4" />
                  {isDisabling ? 'Disabling...' : 'Disable Application'}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={handleEnableApp}
                  disabled={isEnabling}
                  className="border-green-500/50 text-green-400 hover:bg-green-500/10"
                >
                  <Power className="mr-2 h-4 w-4" />
                  {isEnabling ? 'Enabling...' : 'Enable Application'}
                </Button>
              )}
            </div>

            {/* Delete */}
            <div className="flex items-center justify-between px-6 py-4">
              <div>
                <p className="font-medium text-foreground">Delete this application</p>
                <p className="text-sm text-muted-foreground">
                  {app.isActive
                    ? 'You must disable the application before it can be deleted.'
                    : 'Permanently delete this application and all associated data. This cannot be undone.'}
                </p>
              </div>
              <Button
                variant="destructive"
                onClick={() => setIsDeleteModalOpen(true)}
                disabled={app.isActive}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Application
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => { setIsDeleteModalOpen(false); setDeleteConfirmName(''); }}
        title="Delete Application"
        size="sm"
        footer={
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={() => { setIsDeleteModalOpen(false); setDeleteConfirmName(''); }}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteApp}
              disabled={isDeleting || deleteConfirmName !== app.name}
            >
              {isDeleting ? 'Deleting...' : 'Delete Application'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-muted-foreground">
            This action <strong className="text-foreground">cannot be undone</strong>. This will permanently delete the
            application <strong className="text-foreground">{app.name}</strong>, including all roles, license types,
            subscriptions, and access grants.
          </p>
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">
              Type <strong className="text-foreground">{app.name}</strong> to confirm:
            </label>
            <input
              type="text"
              value={deleteConfirmName}
              onChange={(e) => setDeleteConfirmName(e.target.value)}
              className="w-full rounded-md border border-white/10 bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-red-500/50 focus:outline-none focus:ring-1 focus:ring-red-500/50"
              placeholder={app.name}
              autoFocus
            />
          </div>
        </div>
      </Modal>

      {/* Disable Confirmation Modal */}
      <Modal
        isOpen={showDisableModal}
        onClose={() => setShowDisableModal(false)}
        title="Disable Application"
        size="sm"
        footer={
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={() => setShowDisableModal(false)}
              disabled={isDisabling}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDisableApp}
              disabled={isDisabling}
            >
              {isDisabling ? 'Disabling...' : 'Disable Application'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-muted-foreground">
            Are you sure you want to disable <strong className="text-foreground">{app.name}</strong>?
          </p>
          <div className="rounded-md border border-orange-500/20 bg-orange-500/10 p-4 text-sm text-orange-300">
            <p className="font-medium">This will:</p>
            <ul className="mt-2 list-disc pl-5 space-y-1">
              <li>Revoke all active user sessions for this application</li>
              <li>Prevent any new logins or token exchanges</li>
              <li>Preserve all application data, roles, and configuration</li>
            </ul>
          </div>
        </div>
      </Modal>
    </AdminLayout>
  );
}