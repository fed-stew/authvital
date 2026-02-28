/**
 * RBAC (Role-Based Access Control) Type Definitions
 *
 * These types define the application, role, and access control structures
 * used throughout the AuthVital platform.
 *
 * @packageDocumentation
 */

import type { MembershipStatusType } from './licensing.types.js';

// =============================================================================
// APPLICATION TYPES
// =============================================================================

/**
 * Licensing mode for an application.
 *
 * - `FREE`: No license required, all tenant members have access
 * - `PER_SEAT`: Each user needs an assigned license seat
 * - `TENANT_WIDE`: Entire tenant gets access with a single subscription
 */
export type LicensingMode = 'FREE' | 'PER_SEAT' | 'TENANT_WIDE';

/**
 * Application access mode configuration.
 *
 * Controls how users gain access to an application:
 * - `AUTOMATIC`: All tenant members automatically get access
 * - `MANUAL_AUTO_GRANT`: Users must be granted access, but it's auto-granted on first request
 * - `MANUAL_NO_DEFAULT`: Users must be explicitly granted access
 * - `DISABLED`: App is disabled for the tenant
 */
export type AccessMode =
  | 'AUTOMATIC'
  | 'MANUAL_AUTO_GRANT'
  | 'MANUAL_NO_DEFAULT'
  | 'DISABLED';

/**
 * Application entity.
 *
 * Represents an OAuth client application that users can access.
 */
export interface Application {
  /** Unique application identifier */
  id: string;
  /** Display name */
  name: string;
  /** URL-friendly slug */
  slug: string;
  /** Optional description */
  description: string | null;
  /** How licensing works for this app */
  licensingMode: LicensingMode;
  /** Default license type for auto-provisioning */
  defaultLicenseTypeId: string | null;
  /** Default seat count for new subscriptions */
  defaultSeatCount: number;
  /** Auto-provision subscription on tenant signup */
  autoProvisionOnSignup: boolean;
  /** Auto-grant access to tenant owners */
  autoGrantToOwner: boolean;
}

// =============================================================================
// ROLE TYPES
// =============================================================================

/**
 * Role entity.
 *
 * Roles are simple: name, slug, description.
 * Permission checking happens in the consuming application layer.
 */
export interface Role {
  /** Unique role identifier */
  id: string;
  /** Display name */
  name: string;
  /** URL-friendly slug */
  slug: string;
  /** Optional description */
  description: string | null;
  /** Application ID (for app-specific roles) */
  applicationId?: string;
}

// =============================================================================
// ACCESS TYPES
// =============================================================================

/**
 * User's access status to an application.
 *
 * - `ACTIVE`: User has active access
 * - `REVOKED`: Access was explicitly revoked
 * - `SUSPENDED`: Access is temporarily suspended
 */
export type AccessStatus = 'ACTIVE' | 'REVOKED' | 'SUSPENDED';

/**
 * How a user gained access to an application.
 *
 * - `GRANTED`: Explicitly granted by an admin
 * - `INVITED`: Granted as part of an invitation
 * - `AUTO_FREE`: Automatically granted (FREE licensing mode)
 * - `AUTO_TENANT`: Automatically granted (TENANT_WIDE licensing mode)
 * - `AUTO_OWNER`: Automatically granted to tenant owner
 */
export type AccessType =
  | 'GRANTED'
  | 'INVITED'
  | 'AUTO_FREE'
  | 'AUTO_TENANT'
  | 'AUTO_OWNER';

/**
 * User with their application access details.
 *
 * Used in admin UIs for managing application access.
 */
export interface AppUserWithAccess {
  /** Membership ID */
  membershipId: string;
  /** User ID */
  userId: string;
  /** User's email */
  email: string | null;
  /** User's display name */
  name: string;
  /** Membership status (INVITED = pending, ACTIVE = full member) */
  membershipStatus: MembershipStatusType;
  /** Whether the user has access to the app */
  hasAccess: boolean;
  /** Current access status (if hasAccess is true) */
  accessStatus: AccessStatus | null;
  /** How access was granted (if hasAccess is true) */
  accessType: AccessType | null;
  /** When access was granted (ISO 8601 date string) */
  grantedAt: string | null;
  /** Assigned role ID (if any) */
  roleId: string | null;
  /** Assigned role name (if any) */
  roleName: string | null;
  /** Assigned role slug (if any) */
  roleSlug: string | null;
}
