import * as React from 'react';
import { superAdminApi } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import type { ApplicationInfo } from './AppDetailPage';

// =============================================================================
// TYPES
// =============================================================================

interface BrandingTabProps {
  app: ApplicationInfo;
  appId: string;
  onRefresh: () => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function BrandingTab({ app, appId, onRefresh }: BrandingTabProps) {
  const { toast } = useToast();
  
  const [formData, setFormData] = React.useState({
    brandingName: app.brandingName || '',
    brandingLogoUrl: app.brandingLogoUrl || '',
    brandingIconUrl: app.brandingIconUrl || '',
    brandingPrimaryColor: app.brandingPrimaryColor || '',
    brandingBackgroundColor: app.brandingBackgroundColor || '',
    brandingAccentColor: app.brandingAccentColor || '',
    brandingSupportUrl: app.brandingSupportUrl || '',
    brandingPrivacyUrl: app.brandingPrivacyUrl || '',
    brandingTermsUrl: app.brandingTermsUrl || '',
  });
  
  const [isSaving, setIsSaving] = React.useState(false);

  // Handle form changes
  const handleChange = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, [field]: e.target.value }));
  };

  // Save branding
  const handleSave = async () => {
    try {
      setIsSaving(true);
      await superAdminApi.updateApplication(appId, {
        brandingName: formData.brandingName || undefined,
        brandingLogoUrl: formData.brandingLogoUrl || undefined,
        brandingIconUrl: formData.brandingIconUrl || undefined,
        brandingPrimaryColor: formData.brandingPrimaryColor || undefined,
        brandingBackgroundColor: formData.brandingBackgroundColor || undefined,
        brandingAccentColor: formData.brandingAccentColor || undefined,
        brandingSupportUrl: formData.brandingSupportUrl || undefined,
        brandingPrivacyUrl: formData.brandingPrivacyUrl || undefined,
        brandingTermsUrl: formData.brandingTermsUrl || undefined,
      });
      
      onRefresh();
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
            <label className="text-sm font-medium text-foreground">
              Branding Name
            </label>
            <Input
              value={formData.brandingName}
              onChange={handleChange('brandingName')}
              placeholder="My Company"
              className="bg-card"
            />
            <p className="text-xs text-muted-foreground">
              The company or organization name displayed on login screens
            </p>
          </div>

          {/* Logo URL */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Logo URL
            </label>
            <Input
              value={formData.brandingLogoUrl}
              onChange={handleChange('brandingLogoUrl')}
              placeholder="https://example.com/logo.png"
              className="bg-card"
            />
            {formData.brandingLogoUrl && (
              <div className="mt-2">
                <p className="text-xs text-muted-foreground mb-2">Preview:</p>
                <img
                  src={formData.brandingLogoUrl}
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
            <label className="text-sm font-medium text-foreground">
              Icon URL
            </label>
            <Input
              value={formData.brandingIconUrl}
              onChange={handleChange('brandingIconUrl')}
              placeholder="https://example.com/icon.png"
              className="bg-card"
            />
            {formData.brandingIconUrl && (
              <div className="mt-2">
                <p className="text-xs text-muted-foreground mb-2">Preview:</p>
                <img
                  src={formData.brandingIconUrl}
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
              <label className="text-sm font-medium text-foreground">
                Primary Color
              </label>
              <div className="flex gap-2">
                <Input
                  type="color"
                  value={formData.brandingPrimaryColor || '#3b82f6'}
                  onChange={handleChange('brandingPrimaryColor')}
                  className="h-10 w-16 p-1"
                />
                <Input
                  value={formData.brandingPrimaryColor}
                  onChange={handleChange('brandingPrimaryColor')}
                  placeholder="#3b82f6"
                  className="bg-card flex-1"
                />
              </div>
            </div>

            {/* Background Color */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Background Color
              </label>
              <div className="flex gap-2">
                <Input
                  type="color"
                  value={formData.brandingBackgroundColor || '#1e293b'}
                  onChange={handleChange('brandingBackgroundColor')}
                  className="h-10 w-16 p-1"
                />
                <Input
                  value={formData.brandingBackgroundColor}
                  onChange={handleChange('brandingBackgroundColor')}
                  placeholder="#1e293b"
                  className="bg-card flex-1"
                />
              </div>
            </div>

            {/* Accent Color */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Accent Color
              </label>
              <div className="flex gap-2">
                <Input
                  type="color"
                  value={formData.brandingAccentColor || '#8b5cf6'}
                  onChange={handleChange('brandingAccentColor')}
                  className="h-10 w-16 p-1"
                />
                <Input
                  value={formData.brandingAccentColor}
                  onChange={handleChange('brandingAccentColor')}
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
            <label className="text-sm font-medium text-foreground">
              Support URL
            </label>
            <Input
              value={formData.brandingSupportUrl}
              onChange={handleChange('brandingSupportUrl')}
              placeholder="https://example.com/support"
              className="bg-card"
            />
          </div>

          {/* Privacy Policy URL */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Privacy Policy URL
            </label>
            <Input
              value={formData.brandingPrivacyUrl}
              onChange={handleChange('brandingPrivacyUrl')}
              placeholder="https://example.com/privacy"
              className="bg-card"
            />
          </div>

          {/* Terms of Service URL */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Terms of Service URL
            </label>
            <Input
              value={formData.brandingTermsUrl}
              onChange={handleChange('brandingTermsUrl')}
              placeholder="https://example.com/terms"
              className="bg-card"
            />
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Save Branding'}
        </Button>
      </div>
    </div>
  );
}
