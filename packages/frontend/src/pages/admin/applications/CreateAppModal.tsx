import * as React from 'react';
import { Copy, Key } from 'lucide-react';
import { cn } from '@/lib/utils';
import { superAdminApi } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Label } from '@/components/ui/Label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/RadioGroup';
import { Switch } from '@/components/ui/Switch';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/Select';
import { useToast } from '@/components/ui/Toast';
import type { LicensingMode, LicenseType } from '@/types';

// =============================================================================
// TYPES
// =============================================================================

export interface CreateAppModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface FormData {
  name: string;
  description: string;
  redirectUris: string;
  licensingMode: LicensingMode;
  defaultLicenseTypeId: string | null;
  defaultSeatCount: number;
  autoProvisionOnSignup: boolean;
  autoGrantToOwner: boolean;
}

interface FormErrors {
  name?: string;
  redirectUris?: string;
  defaultLicenseTypeId?: string;
  defaultSeatCount?: string;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function CreateAppModal({
  isOpen,
  onClose,
  onSuccess,
}: CreateAppModalProps) {
  const { toast } = useToast();
  
  const [formData, setFormData] = React.useState<FormData>({
    name: '',
    description: '',
    redirectUris: '',
    licensingMode: 'FREE',
    defaultLicenseTypeId: null,
    defaultSeatCount: 5,
    autoProvisionOnSignup: false,
    autoGrantToOwner: true,
  });
  
  const [licenseTypes, setLicenseTypes] = React.useState<LicenseType[]>([]);
  const [isLoadingLicenseTypes, setIsLoadingLicenseTypes] = React.useState(false);
  
  const [errors, setErrors] = React.useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [showCredentials, setShowCredentials] = React.useState(false);
  const [createdApp, setCreatedApp] = React.useState<{
    clientId: string;
    clientSecret?: string;
  } | null>(null);



  // Reset form when modal opens
  React.useEffect(() => {
    if (isOpen) {
      setFormData({ 
        name: '', 
        description: '', 
        redirectUris: '',
        licensingMode: 'FREE',
        defaultLicenseTypeId: null,
        defaultSeatCount: 5,
        autoProvisionOnSignup: false,
        autoGrantToOwner: true,
      });
      setErrors({});
      setShowCredentials(false);
      setCreatedApp(null);
      loadLicenseTypes();
    }
  }, [isOpen]);
  
  // Load license types
  const loadLicenseTypes = React.useCallback(async () => {
    setIsLoadingLicenseTypes(true);
    try {
      const types = await superAdminApi.getAllLicenseTypes();
      setLicenseTypes(types || []);
    } catch (err) {
      console.error('Failed to load license types:', err);
      setLicenseTypes([]);
    } finally {
      setIsLoadingLicenseTypes(false);
    }
  }, []);

  const handleChange = (field: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, [field]: e.target.value }));
    if (errors[field as keyof FormErrors]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field as keyof FormErrors];
        return newErrors;
      });
    }
  };



  const validateForm = () => {
    const newErrors: FormErrors = {};
    
    if (!formData.name) {
      newErrors.name = 'Name is required';
    }
    
    if (!formData.redirectUris) {
      newErrors.redirectUris = 'At least one redirect URI is required';
    }
    
    // If auto-provision is enabled, default license type is required
    if (formData.autoProvisionOnSignup && !formData.defaultLicenseTypeId) {
      newErrors.defaultLicenseTypeId = 'Default license type is required when auto-provision is enabled';
    }
    
    // If PER_SEAT mode, validate seat count
    if (formData.licensingMode === 'PER_SEAT' && (!formData.defaultSeatCount || formData.defaultSeatCount < 1)) {
      newErrors.defaultSeatCount = 'Default seat count must be at least 1';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }
    
    const redirectUriList = formData.redirectUris
      .split(',')
      .map((uri) => uri.trim())
      .filter(Boolean);
    
    try {
      setIsSubmitting(true);
      
      const response = await superAdminApi.createApplication({
        name: formData.name,
        description: formData.description || undefined,
        redirectUris: redirectUriList,
        licensingMode: formData.licensingMode,
        defaultLicenseTypeId: formData.defaultLicenseTypeId || undefined,
        defaultSeatCount: formData.defaultSeatCount,
        autoProvisionOnSignup: formData.autoProvisionOnSignup,
        autoGrantToOwner: formData.autoGrantToOwner,
      });
      
      setCreatedApp({
        clientId: response.clientId,
        clientSecret: response.clientSecret,
      });
      setShowCredentials(true);
      
      onSuccess();
    } catch (err: any) {
      const errorMessage =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to create application';
      
      toast({
        variant: 'error',
        title: 'Error',
        message: errorMessage,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyClientId = () => {
    if (createdApp?.clientId) {
      navigator.clipboard.writeText(createdApp.clientId);
      toast({
        variant: 'success',
        title: 'Copied',
        message: 'Client ID copied to clipboard',
      });
    }
  };

  const handleCopySecret = () => {
    if (createdApp?.clientSecret) {
      navigator.clipboard.writeText(createdApp.clientSecret);
      toast({
        variant: 'success',
        title: 'Copied',
        message: 'Client secret copied to clipboard',
      });
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={showCredentials ? 'Application Created!' : 'Create Application'}
      size="lg"
      footer={
        showCredentials ? (
          <div className="flex gap-2 justify-between">
            <Button onClick={ onClose} variant="outline">
              Close
            </Button>
            <Button onClick={handleCopySecret} className="gap-2">
              <Copy className="h-4 w-4" />
              Copy Secret
            </Button>
          </div>
        ) : (
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Create Application'}
            </Button>
          </div>
        )
      }
    >
      {!showCredentials ? (
        <form onSubmit={handleSubmit} className="space-y-4">


          {/* Name */}
          <div className="space-y-2">
            <label htmlFor="name" className="text-sm font-medium text-foreground">
              Name <span className="text-destructive">*</span>
            </label>
            <Input
              id="name"
              type="text"
              placeholder="My Application"
              value={formData.name}
              onChange={handleChange('name')}
              disabled={isSubmitting}
              required
              className={errors.name ? 'border-destructive' : ''}
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name}</p>
            )}
          </div>



          {/* Description */}
          <div className="space-y-2">
            <label htmlFor="description" className="text-sm font-medium text-foreground">
              Description
            </label>
            <Input
              id="description"
              type="text"
              placeholder="Application description"
              value={formData.description}
              onChange={handleChange('description')}
              disabled={isSubmitting}
              className="bg-card"
            />
          </div>



          {/* Redirect URI */}
          <div className="space-y-2">
            <label htmlFor="redirectUris" className="text-sm font-medium text-foreground">
              Redirect URI(s) <span className="text-destructive">*</span>
            </label>
            <Input
              id="redirectUris"
              type="text"
              placeholder="https://example.com/callback"
              value={formData.redirectUris}
              onChange={handleChange('redirectUris')}
              disabled={isSubmitting}
              required
              className={errors.redirectUris ? 'border-destructive' : ''}
            />
            {errors.redirectUris && (
              <p className="text-sm text-destructive">{errors.redirectUris}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Enter a redirect URI (or multiple separated by commas) where users will be redirected after authentication
            </p>
          </div>

          {/* LICENSING CONFIGURATION SECTION */}
          <div className="rounded-lg border border-white/10 bg-white/5 p-6 space-y-6">
            <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Key className="h-5 w-5" />
              Licensing Configuration
            </h3>
            
            {/* Licensing Mode */}
            <div className="space-y-3">
              <Label>Licensing Mode</Label>
              <RadioGroup
                value={formData.licensingMode || 'FREE'}
                onValueChange={(value: LicensingMode) => 
                  setFormData(prev => ({ ...prev, licensingMode: value }))
                }
                className="grid grid-cols-3 gap-3"
              >
                <label
                  htmlFor="mode-free"
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-lg border p-3 cursor-pointer transition-colors text-center",
                    formData.licensingMode === 'FREE'
                      ? "border-primary bg-primary/10"
                      : "border-white/10 hover:border-white/20"
                  )}
                >
                  <RadioGroupItem value="FREE" id="mode-free" />
                  <span className="text-sm font-medium">Free</span>
                  <span className="text-xs text-muted-foreground">Auto-provisioned for all members</span>
                </label>

                <label
                  htmlFor="mode-tenant"
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-lg border p-3 cursor-pointer transition-colors text-center",
                    formData.licensingMode === 'TENANT_WIDE'
                      ? "border-primary bg-primary/10"
                      : "border-white/10 hover:border-white/20"
                  )}
                >
                  <RadioGroupItem value="TENANT_WIDE" id="mode-tenant" />
                  <span className="text-sm font-medium">Tenant-Wide</span>
                  <span className="text-xs text-muted-foreground">Tenant subscribes, all members get access</span>
                </label>

                <label
                  htmlFor="mode-seat"
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-lg border p-3 cursor-pointer transition-colors text-center",
                    formData.licensingMode === 'PER_SEAT'
                      ? "border-primary bg-primary/10"
                      : "border-white/10 hover:border-white/20"
                  )}
                >
                  <RadioGroupItem value="PER_SEAT" id="mode-seat" />
                  <span className="text-sm font-medium">Per-Seat</span>
                  <span className="text-xs text-muted-foreground">Individual seats assigned to users</span>
                </label>
              </RadioGroup>
            </div>

            {/* Conditional settings - only show when licensing mode is not FREE */}
            {formData.licensingMode && formData.licensingMode !== 'FREE' && (
              <div className="space-y-4 pl-4 border-l-2 border-primary/20">
                {/* Default License Type */}
                <div className="space-y-2">
                  <Label htmlFor="defaultLicenseTypeId">Default License Type</Label>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <Select
                        value={formData.defaultLicenseTypeId || ''}
                        onValueChange={(value: string) => 
                          setFormData(prev => ({ 
                            ...prev, 
                            defaultLicenseTypeId: value || null 
                          }))
                        }
                        disabled={isLoadingLicenseTypes}
                      >
                        <SelectTrigger className={errors.defaultLicenseTypeId ? 'border-destructive' : ''}>
                          <SelectValue placeholder={isLoadingLicenseTypes ? "Loading..." : "Select a default tier for new tenants"} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">None (Manual provisioning only)</SelectItem>
                          {licenseTypes.map((lt) => (
                            <SelectItem key={lt.id} value={lt.id}>
                              {lt.name} {lt.maxMembers && `(max ${lt.maxMembers} members)`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {errors.defaultLicenseTypeId && (
                    <p className="text-sm text-destructive">{errors.defaultLicenseTypeId}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    New tenants will automatically get this license tier on signup
                  </p>
                </div>

                {/* Default Seat Count - only for PER_SEAT mode */}
                {formData.licensingMode === 'PER_SEAT' && (
                  <div className="space-y-2">
                    <Label htmlFor="defaultSeatCount">Default Seat Count</Label>
                    <Input
                      id="defaultSeatCount"
                      type="number"
                      min={1}
                      value={formData.defaultSeatCount || 5}
                      onChange={(e) => 
                        setFormData(prev => ({ 
                          ...prev, 
                          defaultSeatCount: parseInt(e.target.value) || 5 
                        }))
                      }
                      className={`max-w-[200px] ${errors.defaultSeatCount ? 'border-destructive' : ''}`}
                    />
                    {errors.defaultSeatCount && (
                      <p className="text-sm text-destructive">{errors.defaultSeatCount}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Number of seats to provision for new tenants
                    </p>
                  </div>
                )}

                {/* Auto-provision on Signup */}
                <div className="flex items-center justify-between p-3 rounded-lg border border-white/10">
                  <div className="space-y-0.5">
                    <Label htmlFor="autoProvisionOnSignup" className="cursor-pointer">Auto-provision on Signup</Label>
                    <p className="text-xs text-muted-foreground">
                      Automatically create subscription when tenant signs up
                    </p>
                  </div>
                  <Switch
                    id="autoProvisionOnSignup"
                    checked={formData.autoProvisionOnSignup || false}
                    onCheckedChange={(checked: boolean) => 
                      setFormData(prev => ({ ...prev, autoProvisionOnSignup: checked }))
                    }
                  />
                </div>

                {/* Auto-grant to Owner - only for PER_SEAT mode */}
                {formData.licensingMode === 'PER_SEAT' && (
                  <div className="flex items-center justify-between p-3 rounded-lg border border-white/10">
                    <div className="space-y-0.5">
                      <Label htmlFor="autoGrantToOwner" className="cursor-pointer">Auto-grant to Tenant Owner</Label>
                      <p className="text-xs text-muted-foreground">
                        Automatically assign a license seat to the tenant owner
                      </p>
                    </div>
                    <Switch
                      id="autoGrantToOwner"
                      checked={formData.autoGrantToOwner !== false}
                      onCheckedChange={(checked: boolean) => 
                        setFormData(prev => ({ ...prev, autoGrantToOwner: checked }))
                      }
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </form>
      ) : (
        <div className="space-y-4">
          <div className="rounded-md border border-green-500/50 bg-green-500/10 p-4">
            <p className="text-sm font-medium text-green-50">
              ✓ Application created successfully!
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Client ID
            </label>
            <div className="flex gap-2">
              <Input
                value={createdApp?.clientId || ''}
                readOnly
                className="bg-white/5 font-mono"
              />
              <Button
                variant="outline"
                onClick={handleCopyClientId}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Client Secret
            </label>
            <div className="rounded-md border border-yellow-500/50 bg-yellow-500/10 p-3 mb-2">
              <p className="text-xs text-yellow-50">
                ⚠️ <strong>Important:</strong> Copy this secret now! You won't be able to see it again.
              </p>
            </div>
            <div className="flex gap-2">
              <Input
                type="password"
                value={createdApp?.clientSecret || ''}
                readOnly
                className="bg-white/5 font-mono"
              />
              <Button
                variant="outline"
                onClick={handleCopySecret}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
