/**
 * Integration Service Types
 *
 * Re-exports common types from @authvital/shared and defines
 * integration-specific internal types.
 *
 * @packageDocumentation
 */

// Re-export shared types
export type {
  MembershipUser,
  MembershipRole,
  MembershipTenant,
} from '@authvital/shared';

// =============================================================================
// INTEGRATION-SPECIFIC TYPES (Internal, uses Date)
// =============================================================================

/**
 * Tenant info for integration responses.
 *
 * @deprecated Use MembershipTenant from @authvital/shared instead
 */
export interface TenantInfo {
  id: string;
  name: string;
  slug: string;
  initiateLoginUri: string | null;
}

/**
 * Internal membership info with Date objects.
 */
export interface MembershipInfoInternal {
  id: string;
  status: string;
  joinedAt: Date | null;
  createdAt: Date;
  user: import('@authvital/shared').MembershipUser;
  roles: import('@authvital/shared').MembershipRole[];
}

/**
 * Internal subscription info with Date objects.
 */
export interface SubscriptionInfoInternal {
  id: string;
  applicationId: string;
  licenseType: string;
  licenseTypeName: string;
  status: string;
  quantityPurchased: number;
  quantityAssigned: number;
  quantityAvailable: number;
  currentPeriodEnd: Date;
  autoRenew: boolean;
}

/**
 * License info for integration responses.
 */
export interface LicenseInfo {
  id: string;
  licenseTypeId: string;
  licenseTypeName: string;
  licenseTypeSlug: string;
  applicationId: string;
  applicationName: string;
  assignedAt: string;
}

/**
 * License holder info for integration responses.
 */
export interface LicenseHolderInfo {
  userId: string;
  userEmail: string;
  userName?: string;
  licenseTypeId: string;
  licenseTypeName: string;
  assignedAt: string;
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Build the initiateLoginUri for a tenant.
 * Priority: Tenant's own URI > Instance template with {tenant} replaced
 */
export function buildInitiateLoginUri(
  tenantSlug: string,
  tenantUri: string | null,
  instanceUri: string | null,
): string | null {
  // Tenant-level override takes precedence
  if (tenantUri) {
    return tenantUri;
  }

  // Use instance template with {tenant} placeholder replaced
  if (instanceUri) {
    return instanceUri.replace(/\{tenant\}/g, tenantSlug);
  }

  return null;
}

// =============================================================================
// CONVERTERS
// =============================================================================

import type { TenantMembership } from '@authvital/shared';

/**
 * Convert internal membership info to API response format.
 */
export function toTenantMembershipApi(internal: MembershipInfoInternal): TenantMembership {
  return {
    id: internal.id,
    status: internal.status as 'ACTIVE' | 'INVITED' | 'SUSPENDED',
    joinedAt: internal.joinedAt?.toISOString() ?? null,
    createdAt: internal.createdAt.toISOString(),
    user: internal.user,
    roles: internal.roles,
  };
}
