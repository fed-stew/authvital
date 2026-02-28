import * as React from 'react';
import { Plus, Pencil, Archive, Key, Users, Building2, ChevronDown, ChevronRight, Shield, Zap, Crown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { superAdminApi } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Switch } from '@/components/ui/Switch';
import { Dropdown } from '@/components/ui/Dropdown';
import { useToast } from '@/components/ui/Toast';
import type { ApplicationInfo } from './AppDetailPage';
import type { LicensingMode } from '@/types';
import type { LicenseType, LicenseFormData, ApplicationSubscriptionStats, LicenseTypeStats } from './LicensesTab.types';
import { defaultFormData, statusOptions, availableFeatures } from './LicensesTab.types';
import { LicenseFormModal, ArchiveModal } from './LicensesTab.modals';

// =============================================================================
// PROPS
// =============================================================================

interface LicensesTabProps {
  app: ApplicationInfo;
  appId: string;
  onRefresh: () => void;
}

// =============================================================================
// MODE CONFIGURATION CARD
// =============================================================================

interface ModeConfigProps {
  licensingMode: LicensingMode;
  defaultLicenseTypeId: string;
  defaultSeatCount: number;
  autoProvisionOnSignup: boolean;
  autoGrantToOwner: boolean;
  licenseTypes: LicenseType[];
  isSaving: boolean;
  onModeChange: (mode: LicensingMode) => void;
  onFieldChange: (field: string, value: any) => void;
  onSave: () => void;
}

function ModeConfigCard({
  licensingMode,
  defaultLicenseTypeId,
  defaultSeatCount,
  autoProvisionOnSignup,
  autoGrantToOwner,
  licenseTypes,
  isSaving,
  onModeChange,
  onFieldChange,
  onSave,
}: ModeConfigProps) {
  const modeOptions = [
    {
      value: 'FREE' as LicensingMode,
      label: 'Free',
      icon: Zap,
      description: 'All users get access automatically',
      color: 'text-green-400',
      bgColor: 'bg-green-500/20',
      borderActive: 'border-green-500 bg-green-500/10',
    },
    {
      value: 'TENANT_WIDE' as LicensingMode,
      label: 'Tenant-Wide',
      icon: Shield,
      description: 'All users in tenant get access',
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/20',
      borderActive: 'border-blue-500 bg-blue-500/10',
    },
    {
      value: 'PER_SEAT' as LicensingMode,
      label: 'Per-Seat',
      icon: Crown,
      description: 'Individual seats assigned to users',
      color: 'text-purple-400',
      bgColor: 'bg-purple-500/20',
      borderActive: 'border-purple-500 bg-purple-500/10',
    },
  ];

  const activeLicenseTypes = licenseTypes.filter(lt => lt.status === 'ACTIVE' || lt.status === 'DRAFT');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Key className="h-5 w-5" />
          User Licensing Mode
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="text-sm text-muted-foreground">
          How individual users within a tenant get licensed to use this application.
        </p>
        {/* Mode Selector - 3 column cards */}
        <div className="grid grid-cols-3 gap-3">
          {modeOptions.map((option) => {
            const Icon = option.icon;
            const isActive = licensingMode === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onModeChange(option.value)}
                className={cn(
                  'flex flex-col items-center gap-2 rounded-lg border p-4 transition-all text-center',
                  isActive
                    ? option.borderActive
                    : 'border-white/10 hover:border-white/20 hover:bg-white/5'
                )}
              >
                <div className={cn('flex h-10 w-10 items-center justify-center rounded-full', option.bgColor)}>
                  <Icon className={cn('h-5 w-5', option.color)} />
                </div>
                <span className="text-sm font-medium text-foreground">{option.label}</span>
                <span className="text-xs text-muted-foreground">{option.description}</span>
              </button>
            );
          })}
        </div>

        {/* Dynamic settings based on mode */}
        {licensingMode !== 'FREE' && (
          <div className="space-y-4 rounded-lg border border-white/10 bg-white/5 p-4">
            <h4 className="text-sm font-medium text-foreground">Provisioning Settings</h4>

            {/* Default License Type */}
            <div className="space-y-2">
              <Label className="text-sm">Default License Type</Label>
              <Dropdown
                value={defaultLicenseTypeId || ''}
                onChange={(value) => onFieldChange('defaultLicenseTypeId', value)}
                options={[
                  { value: '', label: 'No default (manual assignment)' },
                  ...activeLicenseTypes.map(lt => ({
                    value: lt.id,
                    label: `${lt.name}${lt.maxMembers ? ` (max ${lt.maxMembers})` : ' (unlimited)'}`,
                  })),
                ]}
              />
              <p className="text-xs text-muted-foreground">
                Auto-assigned to new tenants on signup
              </p>
            </div>

            {/* Default Seat Count - PER_SEAT only */}
            {licensingMode === 'PER_SEAT' && (
              <div className="space-y-2">
                <Label className="text-sm">Default Seat Count</Label>
                <Input
                  type="number"
                  min="1"
                  value={defaultSeatCount || 10}
                  onChange={(e) => onFieldChange('defaultSeatCount', parseInt(e.target.value) || 10)}
                  placeholder="10"
                  className="bg-card max-w-32"
                />
                <p className="text-xs text-muted-foreground">
                  Number of seats provisioned for new tenants
                </p>
              </div>
            )}

            {/* Auto-provision toggle */}
            <div className="flex items-center justify-between rounded-lg border border-white/10 p-3">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">Auto-Provision on Signup</Label>
                <p className="text-xs text-muted-foreground">
                  Create subscription when a new tenant signs up
                </p>
              </div>
              <Switch
                checked={autoProvisionOnSignup || false}
                onCheckedChange={(checked) => onFieldChange('autoProvisionOnSignup', checked)}
              />
            </div>

            {/* Auto-grant to owner - PER_SEAT only */}
            {licensingMode === 'PER_SEAT' && (
              <div className="flex items-center justify-between rounded-lg border border-white/10 p-3">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">Auto-Grant to Tenant Owner</Label>
                  <p className="text-xs text-muted-foreground">
                    Assign a seat to the owner when subscription is created
                  </p>
                </div>
                <Switch
                  checked={autoGrantToOwner || false}
                  onCheckedChange={(checked) => onFieldChange('autoGrantToOwner', checked)}
                />
              </div>
            )}
          </div>
        )}

        {/* FREE mode info */}
        {licensingMode === 'FREE' && (
          <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-4">
            <p className="text-sm text-green-300">
              <strong>Free mode</strong> — A "Free" license type is auto-created and all members get access automatically. No provisioning configuration needed.
            </p>
          </div>
        )}

        {/* Save button */}
        <div className="flex justify-end">
          <Button onClick={onSave} disabled={isSaving} size="sm">
            {isSaving ? 'Saving...' : 'Save Mode Settings'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
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
    return subscriptionStats?.licenseTypes.find(lt => lt.licenseTypeId === licenseTypeId);
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

  // Badge helpers
  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'bg-green-500/20 text-green-50 border-green-500/50';
      case 'DRAFT': return 'bg-yellow-500/20 text-yellow-50 border-yellow-500/50';
      case 'HIDDEN': return 'bg-gray-500/20 text-gray-50 border-gray-500/50';
      case 'ARCHIVED': return 'bg-red-500/20 text-red-50 border-red-500/50';
      default: return '';
    }
  };

  const getSubscriptionStatusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE': return <Badge className="bg-green-500/20 text-green-50 border-green-500/50">Active</Badge>;
      case 'TRIALING': return <Badge className="bg-blue-500/20 text-blue-50 border-blue-500/50">Trial</Badge>;
      case 'PAST_DUE': return <Badge className="bg-orange-500/20 text-orange-50 border-orange-500/50">Past Due</Badge>;
      case 'CANCELED': return <Badge className="bg-gray-500/20 text-gray-50 border-gray-500/50">Canceled</Badge>;
      default: return <Badge>{status}</Badge>;
    }
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
        {subscriptionStats && subscriptionStats.totals.totalSubscriptions > 0 && (
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Subscriptions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{subscriptionStats.totals.totalSubscriptions}</div>
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
                <div className="text-2xl font-bold">{subscriptionStats.totals.totalSeatsPurchased}</div>
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
                  {subscriptionStats.totals.totalSeatsAssigned}
                  <span className="text-sm font-normal text-muted-foreground ml-1">
                    / {subscriptionStats.totals.totalSeatsPurchased}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {subscriptionStats.totals.totalSeatsPurchased - subscriptionStats.totals.totalSeatsAssigned} available
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
            {licenseTypes.map((licenseType) => {
              const stats = getStatsForType(licenseType.id);
              const isExpanded = expandedTypes.has(licenseType.id);
              const hasTenants = stats && stats.tenants.length > 0;

              return (
                <Card key={licenseType.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {hasTenants ? (
                          <button
                            onClick={() => toggleExpanded(licenseType.id)}
                            className="p-1 hover:bg-white/10 rounded transition-colors"
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            )}
                          </button>
                        ) : (
                          <div className="w-6" />
                        )}
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/20">
                          <Key className="h-5 w-5 text-purple-400" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-medium text-foreground">{licenseType.name}</h3>
                            <Badge className={getStatusBadgeVariant(licenseType.status)}>
                              {licenseType.status}
                            </Badge>
                            {licenseType.maxMembers && (
                              <Badge className="bg-white/10 text-muted-foreground border-white/20">
                                max {licenseType.maxMembers} members
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">{licenseType.slug}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-6 text-sm">
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                            <span className="text-foreground font-medium">
                              {stats?.totalSubscriptions || 0}
                            </span>
                            <span className="text-muted-foreground">tenants</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-muted-foreground" />
                            <span className="text-foreground font-medium">
                              {stats?.totalSeatsAssigned || 0} / {stats?.totalSeatsPurchased || 0}
                            </span>
                            <span className="text-muted-foreground">seats</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditModal(licenseType)}
                            title="Edit license type"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {licenseType.status !== 'ARCHIVED' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setLicenseToArchive(licenseType);
                                setIsArchiveModalOpen(true);
                              }}
                              title="Archive license type"
                            >
                              <Archive className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                    {licenseType.description && (
                      <p className="text-sm text-muted-foreground mt-2 ml-16">
                        {licenseType.description}
                      </p>
                    )}
                  </CardHeader>

                  {/* Expanded Tenant List */}
                  {isExpanded && stats && stats.tenants.length > 0 && (
                    <CardContent className="pt-0">
                      <div className="ml-6 border-l-2 border-white/10 pl-6">
                        <h4 className="text-sm font-medium text-muted-foreground mb-3">
                          Subscriptions by Tenant
                        </h4>
                        <div className="rounded-lg border border-white/10 overflow-hidden">
                          <table className="w-full">
                            <thead className="bg-white/5">
                              <tr>
                                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-2">Tenant</th>
                                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-2">Status</th>
                                <th className="text-right text-xs font-medium text-muted-foreground px-4 py-2">Purchased</th>
                                <th className="text-right text-xs font-medium text-muted-foreground px-4 py-2">Assigned</th>
                                <th className="text-right text-xs font-medium text-muted-foreground px-4 py-2">Available</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-white/10">
                              {stats.tenants.map((tenant) => (
                                <tr key={tenant.tenantId} className="hover:bg-white/5">
                                  <td className="px-4 py-2">
                                    <span className="text-sm text-foreground">{tenant.tenantName}</span>
                                  </td>
                                  <td className="px-4 py-2">
                                    {getSubscriptionStatusBadge(tenant.status)}
                                  </td>
                                  <td className="px-4 py-2 text-right">
                                    <span className="text-sm text-foreground">{tenant.quantityPurchased}</span>
                                  </td>
                                  <td className="px-4 py-2 text-right">
                                    <span className="text-sm text-foreground">{tenant.quantityAssigned}</span>
                                  </td>
                                  <td className="px-4 py-2 text-right">
                                    <span className="text-sm text-muted-foreground">
                                      {tenant.quantityPurchased - tenant.quantityAssigned}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </CardContent>
                  )}
                </Card>
              );
            })}
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
