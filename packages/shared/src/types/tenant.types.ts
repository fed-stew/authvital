/**
 * Tenant & Membership Type Definitions
 *
 * These types define the multi-tenant organization structure
 * used throughout the AuthVital platform.
 *
 * @packageDocumentation
 */

import type { MembershipStatusType } from './licensing.types.js';

// =============================================================================
// TENANT TYPES
// =============================================================================

/**
 * Core tenant (organization) entity.
 *
 * Represents an organization/workspace in the multi-tenant system.
 */
export interface Tenant {
  /** Unique tenant identifier */
  id: string;
  /** Display name of the tenant */
  name: string;
  /** URL-friendly slug (used in subdomains) */
  slug: string;
  /** Tenant-specific settings */
  settings: Record<string, unknown>;
  /** Custom login URL (for SSO redirects) */
  initiateLoginUri: string | null;
  /** When the tenant was created (ISO 8601 date string) */
  createdAt: string;
  /** When the tenant was last updated (ISO 8601 date string) */
  updatedAt: string;
}

/**
 * Tenant with aggregated statistics.
 *
 * Extended tenant info used in admin dashboards and listings.
 */
export interface TenantWithStats extends Tenant {
  /** Aggregated statistics for the tenant */
  stats: {
    /** Number of active members */
    memberCount: number;
    /** Maximum seats available */
    maxSeats: number;
    /** Name of the primary subscription/plan */
    subscriptionName: string;
  };
}

// =============================================================================
// MEMBERSHIP TYPES
// =============================================================================

/**
 * Membership status values.
 *
 * Aliased from licensing.types for backward compatibility.
 * @see MembershipStatusType
 */
export type MembershipStatus = MembershipStatusType;

/**
 * User's membership in a tenant.
 *
 * Represents the relationship between a user and a tenant.
 */
export interface Membership {
  /** Unique membership identifier */
  id: string;
  /** Current membership status */
  status: MembershipStatus;
  /** When the user joined (null if still invited) */
  joinedAt: string | null;
  /** User ID */
  userId: string;
  /** Tenant ID */
  tenantId: string;
  /** When the membership was created (ISO 8601 date string) */
  createdAt: string;
  /** When the membership was last updated (ISO 8601 date string) */
  updatedAt: string;
}

// =============================================================================
// DOMAIN VERIFICATION TYPES
// =============================================================================

/**
 * Domain verification configuration.
 *
 * Contains the details needed to verify domain ownership via DNS TXT record.
 */
export interface DomainVerification {
  /** Verification token */
  token: string;
  /** DNS TXT record configuration */
  txtRecord: {
    /** Record type (always "TXT") */
    type: string;
    /** DNS record name (e.g., "_authvital.example.com") */
    name: string;
    /** Expected record value */
    value: string;
  };
  /** Human-readable verification instructions */
  instructions: string;
}

/**
 * Verified domain entity.
 *
 * Represents a domain that has been claimed (and optionally verified)
 * by a tenant for SSO and auto-join functionality.
 */
export interface Domain {
  /** Unique domain identifier */
  id: string;
  /** The domain name (e.g., "example.com") */
  domainName: string;
  /** Whether the domain has been verified */
  isVerified: boolean;
  /** When the domain was verified (ISO 8601 date string) */
  verifiedAt: string | null;
  /** When the domain was added (ISO 8601 date string) */
  createdAt: string;
  /** Verification configuration */
  verification: DomainVerification;
}
