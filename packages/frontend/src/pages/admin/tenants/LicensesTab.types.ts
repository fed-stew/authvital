// =============================================================================
// TENANT LICENSE MANAGEMENT TYPES
// =============================================================================

import type { MemberWithLicenses } from '@authvital/shared';

// Re-export shared types for convenience
export {
  type SubscriptionStatusType,
  type MembershipStatusType,
  type SubscriptionSummary,
  type MemberWithLicenses,
  type AvailableLicenseType,
  type TenantLicenseOverview,
} from '@authvital/shared';

// =============================================================================
// FRONTEND-SPECIFIC TYPES
// =============================================================================

// TenantSubscription is now an alias for SubscriptionSummary
// (licensingMode and maxMembers are included in the base type)
export type { SubscriptionSummary as TenantSubscription } from '@authvital/shared';

// Form data for granting a license
export interface GrantLicenseFormData {
  userId: string;
  applicationId: string;
  licenseTypeId: string;
}

// Form data for provisioning a subscription
export interface ProvisionSubscriptionFormData {
  applicationId: string;
  licenseTypeId: string;
  quantityPurchased: number;
  currentPeriodEnd: string;
}

// Bulk operation result
export interface BulkGrantLicenseResult {
  userId: string;
  applicationId: string;
  success: boolean;
  error?: string;
}

export interface BulkRevokeLicenseResult {
  revokedCount: number;
  failures: Array<{
    userId: string;
    applicationId: string;
    error: string;
  }>;
}

// License assignment for member display
export interface MemberLicenseDisplay {
  id: string;
  applicationId: string;
  applicationName: string;
  licenseTypeId: string;
  licenseTypeName: string;
  licenseTypeSlug: string;
  assignedAt: string;
  features: Record<string, boolean>;
}

// Member data for table
export interface MemberLicenseRow extends MemberWithLicenses {
  // Computed display values
  displayName: string;
  totalLicenses: number;
  hasProOrBetter: boolean;
}

// License action type
export type LicenseAction = 'grant' | 'revoke' | 'change';

// License status for display
export type LicenseStatusType = 'assigned' | 'unassigned' | 'pending';

// =============================================================================
// UI CONSTANTS
// =============================================================================

// Status badge variants mapping
export const subscriptionStatusVariants: Record<string, string> = {
  ACTIVE: 'bg-green-500/20 text-green-50 border-green-500/50',
  TRIALING: 'bg-blue-500/20 text-blue-50 border-blue-500/50',
  PAST_DUE: 'bg-yellow-500/20 text-yellow-50 border-yellow-500/50',
  CANCELED: 'bg-orange-500/20 text-orange-50 border-orange-500/50',
  EXPIRED: 'bg-red-500/20 text-red-50 border-red-500/50',
};

// Status badge labels
export const subscriptionStatusLabels: Record<string, string> = {
  ACTIVE: 'Active',
  TRIALING: 'Trial',
  PAST_DUE: 'Past Due',
  CANCELED: 'Canceled',
  EXPIRED: 'Expired',
};

// Membership status badge variants
export const membershipStatusVariants: Record<string, string> = {
  ACTIVE: 'bg-green-500/20 text-green-50 border-green-500/50',
  INVITED: 'bg-yellow-500/20 text-yellow-50 border-yellow-500/50',
  SUSPENDED: 'bg-red-500/20 text-red-50 border-red-500/50',
};

// Default form values
export const defaultProvisionFormData: ProvisionSubscriptionFormData = {
  applicationId: '',
  licenseTypeId: '',
  quantityPurchased: 1,
  currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
};

export const defaultGrantFormData: GrantLicenseFormData = {
  userId: '',
  applicationId: '',
  licenseTypeId: '',
};

// Available quantity options
export const quantityOptions = [1, 2, 5, 10, 20, 50, 100].map((value) => ({
  label: value.toString(),
  value,
}));

// Custom quantity range
export const quantityRange = {
  min: 1,
  max: 1000,
};

// Period end options (common billing periods)
export const periodEndOptions = [
  { label: '1 Month', value: 30 },
  { label: '3 Months', value: 90 },
  { label: '6 Months', value: 180 },
  { label: '1 Year', value: 365 },
  { label: '2 Years', value: 730 },
  { label: '3 Years', value: 1095 },
];

// Helper: Get period end date string from days
export const getPeriodEndDate = (daysFromNow: number): string => {
  return new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
};
