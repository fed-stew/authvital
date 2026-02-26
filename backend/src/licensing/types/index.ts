/**
 * License Pool System - Type Definitions
 * 
 * Core Philosophy: Tenant = Wallet, User = License Holder
 */

import { SubscriptionStatus, LicenseTypeStatus } from '@prisma/client';

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
// SUBSCRIPTION / INVENTORY TYPES
// =============================================================================

export interface CreateSubscriptionInput {
  tenantId: string;
  applicationId: string;
  licenseTypeId: string;
  quantityPurchased: number;
  currentPeriodEnd?: Date; // Optional - defaults to 1 year if not provided
}

export interface UpdateSubscriptionQuantityInput {
  subscriptionId: string;
  quantityPurchased: number;
}

export interface SubscriptionSummary {
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
  currentPeriodEnd: Date;
  features: LicenseTypeFeatures;
  licensingMode: 'FREE' | 'PER_SEAT' | 'TENANT_WIDE';
  maxMembers: number | null;
}

// =============================================================================
// LICENSE ASSIGNMENT TYPES
// =============================================================================

export interface GrantLicenseInput {
  tenantId: string;
  userId: string;
  applicationId: string;
  licenseTypeId: string;   // Which license type to assign from
  assignedById?: string;   // Who is granting this license
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

export interface LicenseAssignmentInfo {
  id: string;
  userId: string;
  applicationId: string;
  licenseTypeId: string;
  licenseTypeName: string;
  licenseTypeSlug: string;
  features: LicenseTypeFeatures;
  assignedAt: Date;
  assignedById?: string;
}

// =============================================================================
// LICENSE CHECK TYPES (SDK-facing)
// =============================================================================

export interface LicenseCheckResult {
  hasLicense: boolean;
  licenseType?: string;           // e.g., "pro", "standard"
  licenseTypeName?: string;       // e.g., "Pro", "Standard"
  features?: LicenseTypeFeatures;
  reason?: string;                // Why access was denied
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
// TENANT LICENSE OVERVIEW TYPES
// =============================================================================

export interface TenantLicenseOverview {
  tenantId: string;
  subscriptions: SubscriptionSummary[];
  totalSeatsOwned: number;
  totalSeatsAssigned: number;
}

// =============================================================================
// MEMBER WITH LICENSES TYPES
// =============================================================================

export interface MemberWithLicenses {
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
    assignedAt: Date;
  }>;
}

// =============================================================================
// AVAILABLE LICENSE TYPES TYPES
// =============================================================================

export interface AvailableLicenseType {
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
// MEMBER ACCESS CHECK TYPES (New - handles all licensing modes)
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
    maxMembers: number | null;  // null = unlimited
    currentMembers: number;
    available: number | null;   // null = unlimited
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
