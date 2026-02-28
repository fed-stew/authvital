import * as React from 'react';
import { superAdminApi } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';

// =============================================================================
// TYPES
// =============================================================================

interface InstanceBranding {
  brandingName?: string | null;
  brandingLogoUrl?: string | null;
  brandingIconUrl?: string | null;
  brandingPrimaryColor?: string | null;
  brandingBackgroundColor?: string | null;
  brandingAccentColor?: string | null;
  brandingSupportUrl?: string | null;
  brandingPrivacyUrl?: string | null;
  brandingTermsUrl?: string | null;
  [key: string]: any;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function BrandingTab() {
  const { toast } = useToast();
  
  const [branding, setBranding] = React.useState<InstanceBranding>({});
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState(false);

  // Load instance branding
  React.useEffect(() => {
    const loadBranding = async () => {
      try {
        setIsLoading(true);
        const meta = await superAdminApi.getInstanceMeta();
        setBranding({
          brandingName: meta.brandingName || null,
          brandingLogoUrl: meta.brandingLogoUrl || null,
          brandingIconUrl: meta.brandingIconUrl || null,
          brandingPrimaryColor: meta.brandingPrimaryColor || null,
          brandingBackgroundColor: meta.brandingBackgroundColor || null,
          brandingAccentColor: meta.brandingAccentColor || null,
          brandingSupportUrl: meta.brandingSupportUrl || null,
          brandingPrivacyUrl: meta.brandingPrivacyUrl || null,
          brandingTermsUrl: meta.brandingTermsUrl || null,
        });
      } catch (err: any) {
        const errorMessage =
          err?.response?.data?.message ||
          err?.message ||
          'Failed to load branding settings';
        toast({
          variant: 'error',
          title: 'Error',
          message: errorMessage,
        });
      } finally {
        setIsLoading(false);
      }
    };

    loadBranding();
  }, [toast]);

  // Handle form changes
  const handleChange = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setBranding((prev) => ({ ...prev, [field]: e.target.value }));
  };

  // Save branding
  const handleSave = async () => {
    try {
      setIsSaving(true);
      await superAdminApi.updateInstanceMeta({
        brandingName: branding.brandingName || undefined,
        brandingLogoUrl: branding.brandingLogoUrl || undefined,
        brandingIconUrl: branding.brandingIconUrl || undefined,
        brandingPrimaryColor: branding.brandingPrimaryColor || undefined,
        brandingBackgroundColor: branding.brandingBackgroundColor || undefined,
        brandingAccentColor: branding.brandingAccentColor || undefined,
        brandingSupportUrl: branding.brandingSupportUrl || undefined,
        brandingPrivacyUrl: branding.brandingPrivacyUrl || undefined,
        brandingTermsUrl: branding.brandingTermsUrl || undefined,
      });
      
      toast({
        variant: 'success',
        title: 'Success',
        message: 'Branding saved successfully',
      });
    } catch (err: any) {
      const errorMessage =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to save branding';
      toast({
        variant: 'error',
        title: 'Error',
        message: errorMessage,
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Branding Name */}
      <Card>
        <CardHeader>
          <CardTitle>Branding</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="branding-name" className="text-sm font-medium text-foreground">
              Branding Name
            </label>
            <Input
              id="branding-name"
              placeholder="My Company"
              value={branding.brandingName || ''}
              onChange={handleChange('brandingName')}
              disabled={isLoading || isSaving}
              className="bg-card"
            />
            <p className="text-xs text-muted-foreground">
              The company or organization name displayed across your instance
            </p>
          </div>

          {/* Logo URL */}
          <div className="space-y-2">
            <label htmlFor="logo-url" className="text-sm font-medium text-foreground">
              Logo URL
            </label>
            <Input
              id="logo-url"
              placeholder="https://example.com/logo.png"
              value={branding.brandingLogoUrl || ''}
              onChange={handleChange('brandingLogoUrl')}
              disabled={isLoading || isSaving}
              className="bg-card"
            />
            {branding.brandingLogoUrl && (
              <div className="mt-2">
                <p className="text-xs text-muted-foreground mb-2">Preview:</p>
                <img
                  src={branding.brandingLogoUrl}
                  alt="Logo preview"
                  className="h-16 max-w-32 object-contain rounded border border-white/10"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              </div>
            )}
          </div>

          {/* Icon URL */}
          <div className="space-y-2">
            <label htmlFor="icon-url" className="text-sm font-medium text-foreground">
              Icon URL
            </label>
            <Input
              id="icon-url"
              placeholder="https://example.com/icon.png"
              value={branding.brandingIconUrl || ''}
              onChange={handleChange('brandingIconUrl')}
              disabled={isLoading || isSaving}
              className="bg-card"
            />
            {branding.brandingIconUrl && (
              <div className="mt-2">
                <p className="text-xs text-muted-foreground mb-2">Preview:</p>
                <img
                  src={branding.brandingIconUrl}
                  alt="Icon preview"
                  className="h-12 w-12 rounded border border-white/10"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Colors */}
      <Card>
        <CardHeader>
          <CardTitle>Colors</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            {/* Primary Color */}
            <div className="space-y-2">
              <label htmlFor="primary-color" className="text-sm font-medium text-foreground">
                Primary Color
              </label>
              <div className="flex gap-2">
                <Input
                  type="color"
                  id="primary-color"
                  value={branding.brandingPrimaryColor || '#3b82f6'}
                  onChange={handleChange('brandingPrimaryColor')}
                  disabled={isLoading || isSaving}
                  className="h-10 w-16 p-1"
                />
                <Input
                  value={branding.brandingPrimaryColor || ''}
                  onChange={handleChange('brandingPrimaryColor')}
                  disabled={isLoading || isSaving}
                  placeholder="#3b82f6"
                  className="bg-card flex-1"
                />
              </div>
            </div>

            {/* Background Color */}
            <div className="space-y-2">
              <label htmlFor="bg-color" className="text-sm font-medium text-foreground">
                Background Color
              </label>
              <div className="flex gap-2">
                <Input
                  type="color"
                  id="bg-color"
                  value={branding.brandingBackgroundColor || '#0f172a'}
                  onChange={handleChange('brandingBackgroundColor')}
                  disabled={isLoading || isSaving}
                  className="h-10 w-16 p-1"
                />
                <Input
                  value={branding.brandingBackgroundColor || ''}
                  onChange={handleChange('brandingBackgroundColor')}
                  disabled={isLoading || isSaving}
                  placeholder="#0f172a"
                  className="bg-card flex-1"
                />
              </div>
            </div>

            {/* Accent Color */}
            <div className="space-y-2">
              <label htmlFor="accent-color" className="text-sm font-medium text-foreground">
                Accent Color
              </label>
              <div className="flex gap-2">
                <Input
                  type="color"
                  id="accent-color"
                  value={branding.brandingAccentColor || '#8b5cf6'}
                  onChange={handleChange('brandingAccentColor')}
                  disabled={isLoading || isSaving}
                  className="h-10 w-16 p-1"
                />
                <Input
                  value={branding.brandingAccentColor || ''}
                  onChange={handleChange('brandingAccentColor')}
                  disabled={isLoading || isSaving}
                  placeholder="#8b5cf6"
                  className="bg-card flex-1"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Links */}
      <Card>
        <CardHeader>
          <CardTitle>Links</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Support URL */}
          <div className="space-y-2">
            <label htmlFor="support-url" className="text-sm font-medium text-foreground">
              Support URL
            </label>
            <Input
              id="support-url"
              placeholder="https://example.com/support"
              value={branding.brandingSupportUrl || ''}
              onChange={handleChange('brandingSupportUrl')}
              disabled={isLoading || isSaving}
              className="bg-card"
            />
          </div>

          {/* Privacy URL */}
          <div className="space-y-2">
            <label htmlFor="privacy-url" className="text-sm font-medium text-foreground">
              Privacy Policy URL
            </label>
            <Input
              id="privacy-url"
              placeholder="https://example.com/privacy"
              value={branding.brandingPrivacyUrl || ''}
              onChange={handleChange('brandingPrivacyUrl')}
              disabled={isLoading || isSaving}
              className="bg-card"
            />
          </div>

          {/* Terms URL */}
          <div className="space-y-2">
            <label htmlFor="terms-url" className="text-sm font-medium text-foreground">
              Terms of Service URL
            </label>
            <Input
              id="terms-url"
              placeholder="https://example.com/terms"
              value={branding.brandingTermsUrl || ''}
              onChange={handleChange('brandingTermsUrl')}
              disabled={isLoading || isSaving}
              className="bg-card"
            />
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isLoading || isSaving}>
          {isSaving ? 'Saving...' : 'Save Branding'}
        </Button>
      </div>
    </div>
  );
}
