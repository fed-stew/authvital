import * as React from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import { GeneralTab } from './GeneralTab';
import { BrandingTab } from './BrandingTab';
import { ApiKeysTab } from './ApiKeysTab';
import { MfaTab } from './MfaTab';
import { SsoTab } from './SsoTab';

// =============================================================================
// COMPONENT
// =============================================================================

export function SettingsPage() {
  const [activeTab, setActiveTab] = React.useState('general');

  return (
    <AdminLayout title="Settings">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="branding">Branding</TabsTrigger>
          <TabsTrigger value="mfa">MFA</TabsTrigger>
          <TabsTrigger value="sso">SSO</TabsTrigger>
          <TabsTrigger value="api-keys">API Keys</TabsTrigger>
        </TabsList>
        <TabsContent value="general">
          <GeneralTab />
        </TabsContent>
        <TabsContent value="branding">
          <BrandingTab />
        </TabsContent>
        <TabsContent value="api-keys">
          <ApiKeysTab />
        </TabsContent>
        <TabsContent value="mfa">
          <MfaTab />
        </TabsContent>
        <TabsContent value="sso">
          <SsoTab />
        </TabsContent>
      </Tabs>
    </AdminLayout>
  );
}
