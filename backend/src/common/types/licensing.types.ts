/**
 * Canonical Licensing Type Definitions
 *
 * These are the source-of-truth types for licensing-related data structures.
 * They use primitive types (string for dates) so they work for both:
 * - Backend services (internal use)
 * - API responses (SDK consumption)
 *
 * When working with Prisma models internally, convert Date objects to ISO strings
 * before returning data that conforms to these types.
 */

// =============================================================================
// SUBSCRIPTION SUMMARY
// =============================================================================

/**
 * Subscription status values.
 * Using string literal union instead of Prisma enum for portability.
 */
export type SubscriptionStatusType =
  | 'ACTIVE'
  | 'TRIALING'
  | 'PAST_DUE'
  | 'CANCELED'
  | 'EXPIRED';

/**
 * Summary of a tenant's subscription (license inventory).
 *
 * Represents a single subscription that grants the tenant access to
 * a specific license type for an application.
 */
export interface SubscriptionSummary {
  /** Subscription ID */
  id: string;
  /** Application this subscription is for */
  applicationId: string;
  /** Human-readable application name */
  applicationName: string;
  /** License type ID */
  licenseTypeId: string;
  /** Human-readable license type name */
  licenseTypeName: string;
  /** License type slug (e.g., "pro", "enterprise") */
  licenseTypeSlug: string;
  /** Total seats purchased */
  quantityPurchased: number;
  /** Seats currently assigned to users */
  quantityAssigned: number;
  /** Seats available for assignment */
  quantityAvailable: number;
  /** Current subscription status */
  status: SubscriptionStatusType;
  /** When the current billing period ends (ISO 8601 date string) */
  currentPeriodEnd: string;
  /** Feature flags enabled by this license type */
  features: Record<string, boolean>;
}

// =============================================================================
// MEMBER WITH LICENSES
// =============================================================================

/**
 * Membership status values.
 */
export type MembershipStatusType = 'ACTIVE' | 'INVITED' | 'SUSPENDED';

/**
 * A tenant member with their license assignments.
 *
 * Used for tenant admin UIs that need to display users and their
 * assigned licenses in a single view.
 */
export interface MemberWithLicenses {
  /** Basic user info */
  user: {
    id: string;
    email: string | null;
    givenName: string | null;
    familyName: string | null;
  };
  /** Membership status in the tenant */
  membership: {
    id: string;
    status: MembershipStatusType;
  };
  /** Licenses assigned to this user */
  licenses: Array<{
    /** License assignment ID */
    id: string;
    /** Application the license is for */
    applicationId: string;
    /** Human-readable application name */
    applicationName: string;
    /** License type ID */
    licenseTypeId: string;
    /** Human-readable license type name */
    licenseTypeName: string;
    /** License type slug */
    licenseTypeSlug: string;
    /** When the license was assigned (ISO 8601 date string) */
    assignedAt: string;
  }>;
}

// =============================================================================
// AVAILABLE LICENSE TYPE
// =============================================================================

/**
 * A license type available for provisioning.
 *
 * Used in tenant admin UIs for displaying license types that can be
 * purchased or assigned. Includes info about existing subscriptions
 * if the tenant already has one.
 */
export interface AvailableLicenseType {
  /** License type ID */
  id: string;
  /** Human-readable name */
  name: string;
  /** URL-friendly slug */
  slug: string;
  /** Optional description */
  description: string | null;
  /** Application this license type belongs to */
  applicationId: string;
  /** Human-readable application name */
  applicationName: string;
  /** Feature flags enabled by this license type */
  features: Record<string, boolean>;
  /** Display order for UI sorting */
  displayOrder: number;
  /** Whether the tenant has an active subscription for this type */
  hasSubscription: boolean;
  /** Existing subscription details (if hasSubscription is true) */
  existingSubscription?: {
    id: string;
    quantityPurchased: number;
    quantityAssigned: number;
  };
}

// =============================================================================
// TENANT LICENSE OVERVIEW
// =============================================================================

/**
 * Full license overview for a tenant.
 *
 * Aggregates all subscription data for a tenant, providing a complete
 * picture of their license inventory and usage.
 */
export interface TenantLicenseOverview {
  /** Tenant ID */
  tenantId: string;
  /** All subscriptions owned by the tenant */
  subscriptions: SubscriptionSummary[];
  /** Total seats across all subscriptions */
  totalSeatsOwned: number;
  /** Total seats assigned across all subscriptions */
  totalSeatsAssigned: number;
}
