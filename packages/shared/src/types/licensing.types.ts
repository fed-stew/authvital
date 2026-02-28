/**
 * Canonical Licensing Type Definitions
 *
 * These are the single source of truth for licensing-related data structures.
 * They use primitive types (string for dates) so they work for both:
 * - Backend services (internal use)
 * - API responses (SDK consumption)
 * - Frontend applications
 *
 * When working with Prisma models internally, convert Date objects to ISO strings
 * before returning data that conforms to these types.
 *
 * @packageDocumentation
 */

// =============================================================================
// SUBSCRIPTION SUMMARY
// =============================================================================

/**
 * Subscription status values.
 *
 * Using string literal union instead of Prisma enum for portability
 * across packages and environments.
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
 *
 * @example
 * ```ts
 * const sub: SubscriptionSummary = {
 *   id: 'sub_123',
 *   applicationId: 'app_456',
 *   applicationName: 'MyApp',
 *   licenseTypeId: 'lt_789',
 *   licenseTypeName: 'Professional',
 *   licenseTypeSlug: 'pro',
 *   quantityPurchased: 10,
 *   quantityAssigned: 7,
 *   quantityAvailable: 3,
 *   status: 'ACTIVE',
 *   currentPeriodEnd: '2024-12-31T23:59:59Z',
 *   features: { advancedReporting: true, apiAccess: true },
 * };
 * ```
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
  /** Licensing mode: FREE, PER_SEAT, or TENANT_WIDE */
  licensingMode: 'FREE' | 'PER_SEAT' | 'TENANT_WIDE';
  /** Maximum members allowed (null = unlimited) */
  maxMembers: number | null;
}

// =============================================================================
// MEMBER WITH LICENSES
// =============================================================================

/**
 * Membership status values.
 *
 * - `ACTIVE`: User is a full member of the tenant
 * - `INVITED`: User has been invited but hasn't accepted yet
 * - `SUSPENDED`: User's membership has been suspended
 */
export type MembershipStatusType = 'ACTIVE' | 'INVITED' | 'SUSPENDED';

/**
 * A tenant member with their license assignments.
 *
 * Used for tenant admin UIs that need to display users and their
 * assigned licenses in a single view.
 *
 * @example
 * ```ts
 * const member: MemberWithLicenses = {
 *   user: {
 *     id: 'user_123',
 *     email: 'alice@example.com',
 *     givenName: 'Alice',
 *     familyName: 'Smith',
 *   },
 *   membership: {
 *     id: 'mem_456',
 *     status: 'ACTIVE',
 *   },
 *   licenses: [
 *     {
 *       id: 'la_789',
 *       applicationId: 'app_001',
 *       applicationName: 'MyApp',
 *       licenseTypeId: 'lt_002',
 *       licenseTypeName: 'Professional',
 *       licenseTypeSlug: 'pro',
 *       assignedAt: '2024-01-15T10:30:00Z',
 *     },
 *   ],
 * };
 * ```
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

// =============================================================================
// LICENSE TYPE DEFINITION
// =============================================================================

/**
 * License type status.
 */
export type LicenseTypeStatus = 'DRAFT' | 'ACTIVE' | 'HIDDEN' | 'ARCHIVED';

/**
 * A license type that can be assigned to users.
 *
 * License types define what features users get access to
 * within an application.
 */
export interface LicenseType {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** URL-friendly slug */
  slug: string;
  /** Optional description */
  description: string | null;
  /** Application this license type belongs to */
  applicationId: string;
  /** Human-readable application name (optional, for display) */
  applicationName?: string;
  /** Feature flags enabled by this license type */
  features: Record<string, boolean>;
  /** Maximum members allowed (null = unlimited) */
  maxMembers: number | null;
  /** Current status */
  status: LicenseTypeStatus;
  /** Display order for UI sorting */
  displayOrder: number;
  /** When created (ISO 8601 date string) */
  createdAt: string;
  /** When last updated (ISO 8601 date string) */
  updatedAt: string;
}

// =============================================================================
// LICENSE ASSIGNMENT
// =============================================================================

/**
 * A license assigned to a user.
 */
export interface LicenseAssignment {
  /** Assignment ID */
  id: string;
  /** User who has the license */
  userId: string;
  /** Tenant the assignment belongs to */
  tenantId: string;
  /** Application the license is for */
  applicationId: string;
  /** License type assigned */
  licenseTypeId: string;
  /** Human-readable license type name */
  licenseTypeName: string;
  /** Associated subscription (if any) */
  subscriptionId: string | null;
  /** When assigned (ISO 8601 date string) */
  assignedAt: string;
  /** User details (optional, for display) */
  user?: {
    id: string;
    email: string;
    givenName?: string;
    familyName?: string;
  };
  /** License type details (optional) */
  licenseType?: LicenseType;
}

// =============================================================================
// LICENSE AUDIT LOG
// =============================================================================

/**
 * License audit action types.
 */
export type LicenseAuditAction = 'GRANTED' | 'REVOKED' | 'CHANGED';

/**
 * An entry in the license audit log.
 */
export interface LicenseAuditLogEntry {
  /** Entry ID */
  id: string;
  /** Tenant where action occurred */
  tenantId: string;
  /** User affected */
  userId: string;
  /** User's email */
  userEmail: string;
  /** User's display name */
  userName?: string;
  /** Application involved */
  applicationId: string;
  /** Application name */
  applicationName: string;
  /** License type involved */
  licenseTypeId: string;
  /** License type name */
  licenseTypeName: string;
  /** What action was taken */
  action: LicenseAuditAction;
  /** Previous license type (for CHANGED actions) */
  previousLicenseTypeName?: string;
  /** Who performed the action */
  performedBy: string;
  /** Details about who performed */
  performedByUser?: {
    id: string;
    email: string;
    givenName?: string;
    familyName?: string;
  };
  /** When action was performed (ISO 8601 date string) */
  performedAt: string;
  /** Optional reason */
  reason?: string;
}

/**
 * Paginated audit log result.
 */
export interface LicenseAuditLogResult {
  /** Audit log entries */
  entries: LicenseAuditLogEntry[];
  /** Total count */
  total: number;
  /** Limit used */
  limit: number;
  /** Offset used */
  offset: number;
}
