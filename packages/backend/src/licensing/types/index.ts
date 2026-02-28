/**
 * License Pool System - Type Definitions
 *
 * This file contains INTERNAL backend types that use native Date objects.
 * For API response types (with ISO 8601 strings), use @authvital/shared.
 *
 * Pattern:
 * - Internal types use `Date` for timestamps (easier to work with in services)
 * - When returning API responses, convert to shared types using `toISOString()`
 *
 * @example
 * ```ts
 * import type { SubscriptionSummary } from '@authvital/shared';
 * import type { SubscriptionSummaryInternal } from './types';
 *
 * // Convert internal to API type
 * function toApiResponse(internal: SubscriptionSummaryInternal): SubscriptionSummary {
 *   return {
 *     ...internal,
 *     currentPeriodEnd: internal.currentPeriodEnd.toISOString(),
 *   };
 * }
 * ```
 *
 * @packageDocumentation
 */

import { SubscriptionStatus, LicenseTypeStatus } from '@prisma/client';

// Re-export shared types for API responses
export type {
  SubscriptionSummary,
  MemberWithLicenses,
  AvailableLicenseType,
  TenantLicenseOverview,
  LicenseType,
  LicenseTypeStatus as LicenseTypeStatusType,
  LicenseAssignment as LicenseAssignmentApi,
  LicenseAuditAction,
  LicenseAuditLogEntry,
  LicenseAuditLogResult,
} from '@authvital/shared';

// =============================================================================
// LICENSE TYPE TYPES
// =============================================================================

export interface LicenseTypeFeatures {
  [key: string]: boolean;
}

export interface CreateLicenseTypeInput {
  name: string;
  slug: string;
  description?: string;
  applicationId: string;
  features?: LicenseTypeFeatures;
  displayOrder?: number;
  status?: LicenseTypeStatus;
  maxMembers?: number | null;
}

export interface UpdateLicenseTypeInput {
  name?: string;
  slug?: string;
  description?: string;
  features?: LicenseTypeFeatures;
  displayOrder?: number;
  status?: LicenseTypeStatus;
  maxMembers?: number | null;
}

// =============================================================================
// SUBSCRIPTION / INVENTORY TYPES (INTERNAL - uses Date)
// =============================================================================

export interface CreateSubscriptionInput {
  tenantId: string;
  applicationId: string;
  licenseTypeId: string;
  quantityPurchased: number;
  currentPeriodEnd?: Date;
}

export interface UpdateSubscriptionQuantityInput {
  subscriptionId: string;
  quantityPurchased: number;
}

/**
 * Internal subscription summary using Date objects.
 * Convert to shared SubscriptionSummary for API responses.
 */
export interface SubscriptionSummaryInternal {
  id: string;
  applicationId: string;
  applicationName: string;
  licenseTypeId: string;
  licenseTypeName: string;
  licenseTypeSlug: string;
  quantityPurchased: number;
  quantityAssigned: number;
  quantityAvailable: number;
  status: SubscriptionStatus;
  /** Internal: use .toISOString() when converting to API response */
  currentPeriodEnd: Date;
  features: LicenseTypeFeatures;
  licensingMode: 'FREE' | 'PER_SEAT' | 'TENANT_WIDE';
  maxMembers: number | null;
}

// =============================================================================
// LICENSE ASSIGNMENT TYPES (INTERNAL - uses Date)
// =============================================================================

export interface GrantLicenseInput {
  tenantId: string;
  userId: string;
  applicationId: string;
  licenseTypeId: string;
  assignedById?: string;
}

export interface RevokeLicenseInput {
  tenantId: string;
  userId: string;
  applicationId: string;
}

export interface ChangeLicenseTypeInput {
  tenantId: string;
  userId: string;
  applicationId: string;
  newLicenseTypeId: string;
  assignedById?: string;
}

/**
 * Internal license assignment info using Date objects.
 */
export interface LicenseAssignmentInternal {
  id: string;
  userId: string;
  applicationId: string;
  licenseTypeId: string;
  licenseTypeName: string;
  licenseTypeSlug: string;
  features: LicenseTypeFeatures;
  /** Internal: use .toISOString() when converting to API response */
  assignedAt: Date;
  assignedById?: string;
}

// =============================================================================
// LICENSE CHECK TYPES (SDK-facing)
// =============================================================================

export interface LicenseCheckResult {
  hasLicense: boolean;
  licenseType?: string;
  licenseTypeName?: string;
  features?: LicenseTypeFeatures;
  reason?: string;
}

export interface BulkLicenseCheckInput {
  tenantId: string;
  userId: string;
  applicationIds: string[];
}

export interface BulkLicenseCheckResult {
  [applicationId: string]: LicenseCheckResult;
}

// =============================================================================
// TENANT LICENSE OVERVIEW TYPES (INTERNAL - uses Date)
// =============================================================================

/**
 * Internal tenant license overview using Date objects.
 * Convert to shared TenantLicenseOverview for API responses.
 */
export interface TenantLicenseOverviewInternal {
  tenantId: string;
  subscriptions: SubscriptionSummaryInternal[];
  totalSeatsOwned: number;
  totalSeatsAssigned: number;
}

// =============================================================================
// MEMBER WITH LICENSES TYPES (INTERNAL - uses Date)
// =============================================================================

/**
 * Internal member with licenses using Date objects.
 */
export interface MemberWithLicensesInternal {
  user: {
    id: string;
    email: string | null;
    givenName: string | null;
    familyName: string | null;
  };
  membership: {
    id: string;
    status: 'ACTIVE' | 'INVITED' | 'SUSPENDED';
  };
  licenses: Array<{
    id: string;
    applicationId: string;
    applicationName: string;
    licenseTypeId: string;
    licenseTypeName: string;
    licenseTypeSlug: string;
    /** Internal: use .toISOString() when converting to API response */
    assignedAt: Date;
  }>;
}

// =============================================================================
// AVAILABLE LICENSE TYPES (INTERNAL)
// =============================================================================

/**
 * Internal available license type structure.
 * This matches the shared AvailableLicenseType, no Date fields.
 */
export interface AvailableLicenseTypeInternal {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  applicationId: string;
  applicationName: string;
  features: LicenseTypeFeatures;
  displayOrder: number;
  hasSubscription: boolean;
  existingSubscription?: {
    id: string;
    quantityPurchased: number;
    quantityAssigned: number;
  };
}

// =============================================================================
// MEMBER ACCESS CHECK TYPES
// =============================================================================

export interface MemberAccessResult {
  allowed: boolean;
  mode: 'FREE' | 'PER_SEAT' | 'TENANT_WIDE';
  message?: string;
  reason?: string;
  capacity?: {
    available: number;
    purchased: number;
    assigned: number;
  };
  memberLimit?: {
    maxMembers: number | null;
    currentMembers: number;
    available: number | null;
  };
}

// =============================================================================
// ERROR TYPES
// =============================================================================

export class NoSeatsAvailableError extends Error {
  constructor(
    public readonly tenantId: string,
    public readonly applicationId: string,
    public readonly licenseTypeId: string,
    public readonly quantityPurchased: number,
    public readonly quantityAssigned: number,
  ) {
    super(`No seats available for license type. Purchased: ${quantityPurchased}, Assigned: ${quantityAssigned}`);
    this.name = 'NoSeatsAvailableError';
  }
}

export class UserAlreadyHasLicenseError extends Error {
  constructor(
    public readonly tenantId: string,
    public readonly userId: string,
    public readonly applicationId: string,
    public readonly existingLicenseType: string,
  ) {
    super(`User already has a ${existingLicenseType} license for this application`);
    this.name = 'UserAlreadyHasLicenseError';
  }
}

// =============================================================================
// CONVERTERS (Date -> ISO string)
// =============================================================================

import type {
  SubscriptionSummary,
  MemberWithLicenses,
  TenantLicenseOverview,
} from '@authvital/shared';

/**
 * Convert internal subscription summary to API response format.
 */
export function toSubscriptionSummaryApi(internal: SubscriptionSummaryInternal): SubscriptionSummary {
  return {
    ...internal,
    currentPeriodEnd: internal.currentPeriodEnd.toISOString(),
  };
}

/**
 * Convert internal member with licenses to API response format.
 */
export function toMemberWithLicensesApi(internal: MemberWithLicensesInternal): MemberWithLicenses {
  return {
    ...internal,
    licenses: internal.licenses.map((license) => ({
      ...license,
      assignedAt: license.assignedAt.toISOString(),
    })),
  };
}

/**
 * Convert internal tenant license overview to API response format.
 */
export function toTenantLicenseOverviewApi(internal: TenantLicenseOverviewInternal): TenantLicenseOverview {
  return {
    ...internal,
    subscriptions: internal.subscriptions.map(toSubscriptionSummaryApi),
  };
}
