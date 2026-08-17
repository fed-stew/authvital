import * as React from 'react';
import { Plus, Key } from 'lucide-react';
import { superAdminApi } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { useToast } from '@/components/ui/Toast';
import type { ApplicationInfo } from './AppDetailPage';
import type { LicensingMode } from '@/types';
import type { LicenseType, LicenseFormData, ApplicationSubscriptionStats, LicenseTypeStats } from './LicensesTab.types';
import { defaultFormData, statusOptions, availableFeatures } from './LicensesTab.types';
import { LicenseFormModal, ArchiveModal } from './LicensesTab.modals';
import { ModeConfigCard } from './LicensesTab.mode';
import { LicenseTypeCard } from './LicensesTab.sections';

// =============================================================================
// PROPS
// =============================================================================

interface LicensesTabProps {
  app: ApplicationInfo;
  appId: string;
  onRefresh: () => void;
}


// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function LicensesTab({ app, appId, onRefresh }: LicensesTabProps) {
  const { toast } = useToast();

  // Mode config state
  const [modeConfig, setModeConfig] = React.useState({
    licensingMode: (app.licensingMode || 'FREE') as LicensingMode,
    defaultLicenseTypeId: app.defaultLicenseTypeId || '',
    defaultSeatCount: app.defaultSeatCount || 10,
    autoProvisionOnSignup: app.autoProvisionOnSignup || false,
    autoGrantToOwner: app.autoGrantToOwner || false,
  });
  const [isSavingMode, setIsSavingMode] = React.useState(false);

  // License types state
  const [licenseTypes, setLicenseTypes] = React.useState<LicenseType[]>([]);
  const [subscriptionStats, setSubscriptionStats] = React.useState<ApplicationSubscriptionStats | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [expandedTypes, setExpandedTypes] = React.useState<Set<string>>(new Set());

  // Modal states
  const [isCreateModalOpen, setIsCreateModalOpen] = React.useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = React.useState(false);
  const [isArchiveModalOpen, setIsArchiveModalOpen] = React.useState(false);
  const [licenseToEdit, setLicenseToEdit] = React.useState<LicenseType | null>(null);
  const [licenseToArchive, setLicenseToArchive] = React.useState<LicenseType | null>(null);

  // Form state
  const [formData, setFormData] = React.useState<LicenseFormData>(defaultFormData);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Sync mode config when app prop changes
  React.useEffect(() => {
    setModeConfig({
      licensingMode: (app.licensingMode || 'FREE') as LicensingMode,
      defaultLicenseTypeId: app.defaultLicenseTypeId || '',
      defaultSeatCount: app.defaultSeatCount || 10,
      autoProvisionOnSignup: app.autoProvisionOnSignup || false,
      autoGrantToOwner: app.autoGrantToOwner || false,
    });
  }, [app.licensingMode, app.defaultLicenseTypeId, app.defaultSeatCount, app.autoProvisionOnSignup, app.autoGrantToOwner]);

  // Load license types and subscription stats
  const loadData = React.useCallback(async () => {
    try {
      setIsLoading(true);
      const [types, stats] = await Promise.all([
        superAdminApi.getApplicationLicenseTypes(appId, true),
        superAdminApi.getApplicationSubscriptionStats(appId),
      ]);
      setLicenseTypes(types || []);
      setSubscriptionStats(stats || null);
    } catch (err: any) {
      console.error('Failed to load license data:', err);
      toast({
        variant: 'error',
        title: 'Error',
        message: 'Failed to load license data',
      });
    } finally {
      setIsLoading(false);
    }
  }, [appId, toast]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  // Save mode config
  const handleSaveMode = async () => {
    try {
      setIsSavingMode(true);
      await superAdminApi.updateApplication(appId, {
        licensingMode: modeConfig.licensingMode,
        defaultLicenseTypeId: modeConfig.defaultLicenseTypeId || undefined,
        defaultSeatCount: modeConfig.defaultSeatCount,
        autoProvisionOnSignup: modeConfig.autoProvisionOnSignup,
        autoGrantToOwner: modeConfig.autoGrantToOwner,
      });
      onRefresh();
      toast({
        variant: 'success',
        title: 'Success',
        message: 'Licensing mode updated',
      });
    } catch (err: any) {
      toast({
        variant: 'error',
        title: 'Error',
        message: err?.response?.data?.message || err?.message || 'Failed to update licensing mode',
      });
    } finally {
      setIsSavingMode(false);
    }
  };

  const handleModeFieldChange = (field: string, value: any) => {
    setModeConfig(prev => ({ ...prev, [field]: value }));
  };

  // Get stats for a specific license type
  const getStatsForType = (licenseTypeId: string): LicenseTypeStats | undefined => {
    return subscriptionStats?.licenseTypes?.find(lt => lt.licenseTypeId === licenseTypeId);
  };

  // Toggle expanded state
  const toggleExpanded = (licenseTypeId: string) => {
    setExpandedTypes(prev => {
      const next = new Set(prev);
      if (next.has(licenseTypeId)) next.delete(licenseTypeId);
      else next.add(licenseTypeId);
      return next;
    });
  };

  // Handle form changes
  const handleFormFieldChange = (field: string, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleFeatureToggle = (featureKey: string, checked: boolean) => {
    setFormData((prev) => ({
      ...prev,
      features: { ...prev.features, [featureKey]: checked },
    }));
  };

  const handleCreateNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.value;
    handleFormFieldChange('name', name);
    if (!formData.slug || formData.slug === generateSlug(formData.name)) {
      handleFormFieldChange('slug', generateSlug(name));
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

  // CRUD operations
  const handleCreateLicense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.slug) {
      toast({ variant: 'error', title: 'Error', message: 'Name and slug are required' });
      return;
    }
    try {
      setIsSubmitting(true);
      await superAdminApi.createLicenseType({
        name: formData.name,
        slug: formData.slug,
        description: formData.description || undefined,
        applicationId: appId,
        status: formData.status,
        displayOrder: formData.displayOrder,
        features: formData.features,
      });
      setIsCreateModalOpen(false);
      setFormData(defaultFormData);
      loadData();
      toast({ variant: 'success', title: 'Success', message: 'License type created successfully' });
    } catch (err: any) {
      toast({ variant: 'error', title: 'Error', message: err?.response?.data?.message || err?.message || 'Failed to create license type' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditLicense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!licenseToEdit) return;
    if (!formData.name || !formData.slug) {
      toast({ variant: 'error', title: 'Error', message: 'Name and slug are required' });
      return;
    }
    try {
      setIsSubmitting(true);
      await superAdminApi.updateLicenseType(licenseToEdit.id, {
        name: formData.name,
        slug: formData.slug,
        description: formData.description || undefined,
        status: formData.status,
        displayOrder: formData.displayOrder,
        features: formData.features,
      });
      setIsEditModalOpen(false);
      setLicenseToEdit(null);
      setFormData(defaultFormData);
      loadData();
      toast({ variant: 'success', title: 'Success', message: 'License type updated successfully' });
    } catch (err: any) {
      toast({ variant: 'error', title: 'Error', message: err?.response?.data?.message || err?.message || 'Failed to update license type' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleArchiveLicense = async () => {
    if (!licenseToArchive) return;
    try {
      await superAdminApi.archiveLicenseType(licenseToArchive.id);
      setIsArchiveModalOpen(false);
      setLicenseToArchive(null);
      loadData();
      toast({ variant: 'success', title: 'Success', message: 'License type archived successfully' });
    } catch (err: any) {
      toast({ variant: 'error', title: 'Error', message: err?.response?.data?.message || err?.message || 'Failed to archive license type' });
    }
  };

  const openEditModal = (licenseType: LicenseType) => {
    setLicenseToEdit(licenseType);
    setFormData({
      name: licenseType.name,
      slug: licenseType.slug,
      description: licenseType.description || '',
      status: licenseType.status,
      displayOrder: licenseType.displayOrder,
      features: { ...licenseType.features },
      maxMembers: licenseType.maxMembers ?? null,
    });
    setIsEditModalOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Info banner */}
      <div className="rounded-lg border border-purple-500/20 bg-purple-500/10 p-4">
        <div className="flex items-start gap-3">
          <Key className="h-5 w-5 text-purple-400 mt-0.5" />
          <div>
            <h4 className="font-medium text-purple-400">User-Level Licensing</h4>
            <p className="text-sm text-muted-foreground mt-1">
              Licensing controls how <strong>individual users</strong> within a tenant get access.
              For tenant-level subscription control, see the <strong>Access</strong> tab.
            </p>
          </div>
        </div>
      </div>

      {/* ========== LICENSING MODE CONFIGURATION ========== */}
      <ModeConfigCard
        licensingMode={modeConfig.licensingMode}
        defaultLicenseTypeId={modeConfig.defaultLicenseTypeId}
        defaultSeatCount={modeConfig.defaultSeatCount}
        autoProvisionOnSignup={modeConfig.autoProvisionOnSignup}
        autoGrantToOwner={modeConfig.autoGrantToOwner}
        licenseTypes={licenseTypes}
        isSaving={isSavingMode}
        onModeChange={(mode) => handleModeFieldChange('licensingMode', mode)}
        onFieldChange={handleModeFieldChange}
        onSave={handleSaveMode}
      />

      {/* ========== LICENSE TYPES SECTION (hidden in FREE mode) ========== */}
      {modeConfig.licensingMode !== 'FREE' && (
        <div className="space-y-4">
        {/* Section Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">License Types</h2>
            <p className="text-sm text-muted-foreground">
              Define the tiers tenants can subscribe to
            </p>
          </div>
          <Button
            onClick={() => {
              setFormData(defaultFormData);
              setIsCreateModalOpen(true);
            }}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            Create License Type
          </Button>
        </div>

        {/* Summary Stats */}
        {(subscriptionStats?.totals?.totalSubscriptions ?? 0) > 0 && (
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Subscriptions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{subscriptionStats?.totals?.totalSubscriptions ?? 0}</div>
                <p className="text-xs text-muted-foreground">across all tenants</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Seats Purchased
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{subscriptionStats?.totals?.totalSeatsPurchased ?? 0}</div>
                <p className="text-xs text-muted-foreground">total capacity</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Seats Assigned
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {subscriptionStats?.totals?.totalSeatsAssigned ?? 0}
                  <span className="text-sm font-normal text-muted-foreground ml-1">
                    / {subscriptionStats?.totals?.totalSeatsPurchased ?? 0}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {(subscriptionStats?.totals?.totalSeatsPurchased ?? 0) - (subscriptionStats?.totals?.totalSeatsAssigned ?? 0)} available
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* License Types List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="flex flex-col items-center gap-4">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              <p className="text-sm text-muted-foreground">Loading license data...</p>
            </div>
          </div>
        ) : licenseTypes.length === 0 ? (
          <div className="rounded-lg border border-white/10 bg-card p-8 text-center">
            <Key className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">No License Types</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Create your first license type to start managing subscriptions.
            </p>
            <Button
              onClick={() => {
                setFormData(defaultFormData);
                setIsCreateModalOpen(true);
              }}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              Create License Type
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {licenseTypes.map((licenseType) => (
              <LicenseTypeCard
                key={licenseType.id}
                licenseType={licenseType}
                stats={getStatsForType(licenseType.id)}
                isExpanded={expandedTypes.has(licenseType.id)}
                onToggle={() => toggleExpanded(licenseType.id)}
                onEdit={() => openEditModal(licenseType)}
                onArchive={() => {
                  setLicenseToArchive(licenseType);
                  setIsArchiveModalOpen(true);
                }}
              />
            ))}
          </div>
        )}
        </div>
      )}

      {/* ========== MODALS ========== */}
      <LicenseFormModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSubmit={handleCreateLicense}
        formData={formData}
        onChange={handleFormFieldChange}
        onFeatureToggle={handleFeatureToggle}
        isSubmitting={isSubmitting}
        title="Create License Type"
        submitLabel="Create License Type"
        statusOptions={statusOptions}
        availableFeatures={availableFeatures}
        onNameChange={handleCreateNameChange}
      />

      <LicenseFormModal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setLicenseToEdit(null);
        }}
        onSubmit={handleEditLicense}
        formData={formData}
        onChange={handleFormFieldChange}
        onFeatureToggle={handleFeatureToggle}
        isSubmitting={isSubmitting}
        title="Edit License Type"
        submitLabel="Update License Type"
        statusOptions={statusOptions}
        availableFeatures={availableFeatures}
      />

      <ArchiveModal
        isOpen={isArchiveModalOpen}
        onClose={() => {
          setIsArchiveModalOpen(false);
          setLicenseToArchive(null);
        }}
        onConfirm={handleArchiveLicense}
        licenseType={licenseToArchive}
      />
    </div>
  );
}
