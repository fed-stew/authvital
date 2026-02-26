// =============================================================================
// TYPES
// =============================================================================

export interface LicenseType {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: 'DRAFT' | 'ACTIVE' | 'HIDDEN' | 'ARCHIVED';
  displayOrder: number;
  features: Record<string, boolean>;
  maxMembers: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface LicenseTypeStats {
  licenseTypeId: string;
  subscriptionCount: number;
}

export interface LicensesTabProps {
  app: any; // ApplicationInfo from AppDetailPage
  appId: string;
  onRefresh: () => void;
}

export interface LicenseFormData {
  name: string;
  slug: string;
  description: string;
  status: 'DRAFT' | 'ACTIVE' | 'HIDDEN' | 'ARCHIVED';
  displayOrder: number;
  features: Record<string, boolean>;
  maxMembers: number | null;
}

export interface LicenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  formData: LicenseFormData;
  onChange: (field: string, value: any) => void;
  onFeatureToggle: (key: string, checked: boolean) => void;
  isSubmitting: boolean;
  title: string;
  submitLabel: string;
  statusOptions: Array<{ label: string; value: string }>;
  availableFeatures: Array<{ key: string; label: string }>;
}

export const defaultFormData: LicenseFormData = {
  name: '',
  slug: '',
  description: '',
  status: 'DRAFT',
  displayOrder: 0,
  features: {},
  maxMembers: null,
};

export const statusOptions = [
  { label: 'Draft', value: 'DRAFT' },
  { label: 'Active', value: 'ACTIVE' },
  { label: 'Hidden', value: 'HIDDEN' },
  { label: 'Archived', value: 'ARCHIVED' },
];

export const availableFeatures = [
  { key: 'sso', label: 'Single Sign-On (SSO)' },
  { key: 'api_access', label: 'API Access' },
  { key: 'webhooks', label: 'Webhooks' },
  { key: 'advanced_analytics', label: 'Advanced Analytics' },
  { key: 'custom_integrations', label: 'Custom Integrations' },
  { key: 'priority_support', label: 'Priority Support' },
];

// =============================================================================
// APPLICATION SUBSCRIPTION STATS
// =============================================================================

export interface TenantSubscriptionInfo {
  tenantId: string;
  tenantName: string;
  quantityPurchased: number;
  quantityAssigned: number;
  status: string;
}

export interface LicenseTypeStats {
  licenseTypeId: string;
  licenseTypeName: string;
  licenseTypeSlug: string;
  totalSubscriptions: number;
  totalSeatsPurchased: number;
  totalSeatsAssigned: number;
  totalSeatsAvailable: number;
  tenants: TenantSubscriptionInfo[];
}

export interface ApplicationSubscriptionStats {
  applicationId: string;
  licenseTypes: LicenseTypeStats[];
  totals: {
    totalSubscriptions: number;
    totalSeatsPurchased: number;
    totalSeatsAssigned: number;
  };
}
