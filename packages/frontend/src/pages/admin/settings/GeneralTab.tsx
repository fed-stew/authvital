import * as React from 'react';
import { superAdminApi } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Checkbox } from '@/components/ui/Checkbox';
import { useToast } from '@/components/ui/Toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';

// =============================================================================
// TYPES
// =============================================================================

interface InstanceMeta {
  name?: string;
  allowSignUp?: boolean;
  autoCreateTenant?: boolean;
  allowGenericDomains?: boolean;
  allowAnonymousSignUp?: boolean;
  requiredUserFields?: string[];
  initiateLoginUri?: string | null;
  [key: string]: any;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function GeneralTab() {
  const { toast } = useToast();
  
  const [instanceMeta, setInstanceMeta] = React.useState<InstanceMeta>({});
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState(false);
  
  // Required user fields options
  const requiredFieldsOptions = [
    { value: 'email', label: 'Email' },
    { value: 'givenName', label: 'Given Name' },
    { value: 'familyName', label: 'Family Name' },
    { value: 'phone', label: 'Phone' },
  ];

  // Load instance meta
  React.useEffect(() => {
    const loadInstanceMeta = async () => {
      try {
        setIsLoading(true);
        const meta = await superAdminApi.getInstanceMeta();
        setInstanceMeta(meta || {});
      } catch (err: any) {
        const errorMessage =
          err?.response?.data?.message ||
          err?.message ||
          'Failed to load instance settings';
        toast({
          variant: 'error',
          title: 'Error',
          message: errorMessage,
        });
      } finally {
        setIsLoading(false);
      }
    };

    loadInstanceMeta();
  }, [toast]);

  // Handle instance name change
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInstanceMeta((prev) => ({ ...prev, name: e.target.value }));
  };

  // Handle toggle changes
  const handleToggle = (field: keyof InstanceMeta) => (checked: boolean) => {
    setInstanceMeta((prev) => ({ ...prev, [field]: checked }));
  };

  // Handle URI change
  const handleUriChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInstanceMeta((prev) => ({ ...prev, initiateLoginUri: e.target.value }));
  };

  // Handle required fields change
  const handleRequiredFieldToggle = (field: string) => (checked: boolean) => {
    const currentFields = instanceMeta.requiredUserFields || [];
    setInstanceMeta((prev) => ({
      ...prev,
      requiredUserFields: checked
        ? [...currentFields, field]
        : currentFields.filter((f) => f !== field),
    }));
  };

  // Check if field is required
  const isFieldRequired = (field: string) => {
    return (instanceMeta.requiredUserFields || []).includes(field);
  };

  // Save settings
  const handleSave = async () => {
    try {
      setIsSaving(true);
      await superAdminApi.updateInstanceMeta({
        name: instanceMeta.name,
        allowSignUp: instanceMeta.allowSignUp,
        autoCreateTenant: instanceMeta.autoCreateTenant,
        allowGenericDomains: instanceMeta.allowGenericDomains,
        allowAnonymousSignUp: instanceMeta.allowAnonymousSignUp,
        requiredUserFields: instanceMeta.requiredUserFields,
        initiateLoginUri: instanceMeta.initiateLoginUri,
      });
      
      toast({
        variant: 'success',
        title: 'Success',
        message: 'Settings saved successfully',
      });
    } catch (err: any) {
      const errorMessage =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to save settings';
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
      {/* Instance Name */}
      <Card>
        <CardHeader>
          <CardTitle>Instance Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="instance-name" className="text-sm font-medium text-foreground">
              Instance Name
            </label>
            <Input
              id="instance-name"
              placeholder="My Awesome AuthVital Instance"
              value={instanceMeta.name || ''}
              onChange={handleNameChange}
              disabled={isLoading || isSaving}
              className="bg-card"
            />
          </div>
        </CardContent>
      </Card>

      {/* Signup Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Signup Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h3 className="text-sm font-medium text-foreground">Allow Sign Up</h3>
              <p className="text-sm text-muted-foreground">
                Enable public user registration on your instance
              </p>
            </div>
            <Checkbox
              checked={instanceMeta.allowSignUp || false}
              onCheckedChange={handleToggle('allowSignUp')}
              disabled={isLoading || isSaving}
            />
          </div>

          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h3 className="text-sm font-medium text-foreground">Auto Create Tenant</h3>
              <p className="text-sm text-muted-foreground">
                Automatically create a new tenant when a user signs up
              </p>
            </div>
            <Checkbox
              checked={instanceMeta.autoCreateTenant || false}
              onCheckedChange={handleToggle('autoCreateTenant')}
              disabled={isLoading || isSaving}
            />
          </div>

          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h3 className="text-sm font-medium text-foreground">Allow Generic Domains</h3>
              <p className="text-sm text-muted-foreground">
                Allow sign up with free email domains (e.g., gmail.com)
              </p>
            </div>
            <Checkbox
              checked={instanceMeta.allowGenericDomains || false}
              onCheckedChange={handleToggle('allowGenericDomains')}
              disabled={isLoading || isSaving}
            />
          </div>

          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h3 className="text-sm font-medium text-foreground">Allow Anonymous Sign Up</h3>
              <p className="text-sm text-muted-foreground">
                Allow users to sign up without email verification
              </p>
            </div>
            <Checkbox
              checked={instanceMeta.allowAnonymousSignUp || false}
              onCheckedChange={handleToggle('allowAnonymousSignUp')}
              disabled={isLoading || isSaving}
            />
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-medium text-foreground">
              Required User Fields
            </h3>
            <p className="text-xs text-muted-foreground">
              Select which fields users must provide during sign up
            </p>
            <div className="space-y-2">
              {requiredFieldsOptions.map((option) => (
                <div key={option.value} className="flex items-center gap-3">
                  <Checkbox
                    id={`field-${option.value}`}
                    checked={isFieldRequired(option.value)}
                    onCheckedChange={handleRequiredFieldToggle(option.value)}
                    disabled={isLoading || isSaving}
                  />
                  <label
                    htmlFor={`field-${option.value}`}
                    className="text-sm text-foreground cursor-pointer"
                  >
                    {option.label}
                  </label>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Login Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Login Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="login-uri" className="text-sm font-medium text-foreground">
              Initiate Login URI
            </label>
            <Input
              id="login-uri"
              placeholder="https://example.com/auth/login/{tenant}"
              value={instanceMeta.initiateLoginUri || ''}
              onChange={handleUriChange}
              disabled={isLoading || isSaving}
              className="bg-card"
            />
            <p className="text-xs text-muted-foreground">
              Template URL for initiating login. Use {`{tenant}`} as a placeholder for the tenant slug.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isLoading || isSaving}>
          {isSaving ? 'Saving...' : 'Save Settings'}
        </Button>
      </div>
    </div>
  );
}
