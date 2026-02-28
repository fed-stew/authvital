/**
 * Membership Type Definitions
 *
 * Types for user memberships, roles, and tenant relationships.
 * Used across backend, frontend, and SDK.
 *
 * @packageDocumentation
 */

import type { MembershipStatusType } from './licensing.types.js';

// =============================================================================
// BASIC MEMBER TYPES
// =============================================================================

/**
 * Basic user info within a membership context.
 */
export interface MembershipUser {
  /** User ID */
  id: string;
  /** User's email */
  email: string | null;
  /** User's first name */
  givenName: string | null;
  /** User's last name */
  familyName: string | null;
}

/**
 * Role assigned to a member.
 */
export interface MembershipRole {
  /** Role ID */
  id: string;
  /** Role display name */
  name: string;
  /** Role slug */
  slug: string;
  /** Application ID (for app-specific roles) */
  applicationId?: string;
  /** Application name (for display) */
  applicationName?: string;
}

/**
 * Basic tenant info for membership context.
 */
export interface MembershipTenant {
  /** Tenant ID */
  id: string;
  /** Tenant display name */
  name: string;
  /** Tenant slug */
  slug: string;
  /** Custom login URL */
  initiateLoginUri: string | null;
}

// =============================================================================
// MEMBERSHIP RECORDS
// =============================================================================

/**
 * A user's membership in a tenant.
 */
export interface TenantMembership {
  /** Membership ID */
  id: string;
  /** Membership status */
  status: MembershipStatusType;
  /** When the user joined (null if still invited) */
  joinedAt: string | null;
  /** When the membership was created */
  createdAt: string;
  /** User info */
  user: MembershipUser;
  /** Roles assigned */
  roles: MembershipRole[];
}

/**
 * Response from tenant memberships list endpoint.
 */
export interface TenantMembershipsResponse {
  /** Tenant ID */
  tenantId: string;
  /** Tenant name */
  tenantName: string;
  /** Tenant slug */
  tenantSlug: string;
  /** Custom login URL */
  initiateLoginUri: string | null;
  /** List of memberships */
  memberships: TenantMembership[];
  /** Total count */
  totalCount: number;
}

/**
 * A membership record with tenant info (for user's tenant list).
 */
export interface UserTenantMembership {
  /** Membership ID */
  id: string;
  /** Membership status */
  status: MembershipStatusType;
  /** When the user joined */
  joinedAt: string | null;
  /** When created */
  createdAt: string;
  /** Tenant info */
  tenant: MembershipTenant;
  /** Roles in this tenant */
  roles: MembershipRole[];
}

/**
 * Response from user's tenants list endpoint.
 */
export interface UserTenantsResponse {
  /** User ID */
  userId: string;
  /** User's memberships across tenants */
  memberships: UserTenantMembership[];
  /** Total count */
  totalCount: number;
}

// =============================================================================
// ROLE DEFINITIONS
// =============================================================================

/**
 * Tenant role definition (system or custom).
 */
export interface TenantRoleDefinition {
  /** Role ID */
  id: string;
  /** Display name */
  name: string;
  /** URL-friendly slug */
  slug: string;
  /** Description */
  description: string | null;
  /** Whether this is a system-defined role */
  isSystem: boolean;
  /** Permissions granted by this role */
  permissions: string[];
}

/**
 * Response from tenant roles list endpoint.
 */
export interface TenantRolesResponse {
  roles: TenantRoleDefinition[];
}

/**
 * Application role definition.
 */
export interface ApplicationRoleDefinition {
  /** Role ID */
  id: string;
  /** Display name */
  name: string;
  /** URL-friendly slug */
  slug: string;
  /** Description */
  description: string | null;
  /** Whether this is a system-defined role */
  isSystem: boolean;
  /** Permissions granted by this role */
  permissions: string[];
}

/**
 * Response from application roles list endpoint.
 */
export interface ApplicationRolesResponse {
  /** Application ID */
  applicationId: string;
  /** Application name */
  applicationName: string;
  /** OAuth client ID */
  clientId: string;
  /** Available roles */
  roles: ApplicationRoleDefinition[];
}

// =============================================================================
// INVITATION TYPES
// =============================================================================

/**
 * A pending invitation.
 */
export interface PendingInvitation {
  /** Invitation ID */
  id: string;
  /** Invitee's email */
  email: string;
  /** Role to be assigned */
  role: string;
  /** When the invitation expires */
  expiresAt: string;
  /** When the invitation was created */
  createdAt: string;
  /** Who sent the invitation */
  invitedBy: {
    id: string;
    email: string | null;
    givenName: string | null;
    familyName: string | null;
  } | null;
}

/**
 * Response from pending invitations list endpoint.
 */
export interface PendingInvitationsResponse {
  /** Tenant ID */
  tenantId: string;
  /** Tenant name */
  tenantName: string;
  /** List of pending invitations */
  invitations: PendingInvitation[];
  /** Total count */
  totalCount: number;
}

/**
 * Parameters for sending an invitation.
 */
export interface SendInvitationParams {
  /** Invitee's email */
  email: string;
  /** User's first name (used if creating new user) */
  givenName?: string;
  /** User's last name (used if creating new user) */
  familyName?: string;
  /** Tenant role ID to assign */
  roleId: string;
  /** Days until expiration (default: 7) */
  expiresInDays?: number;
  /** Application clientId for redirect URL */
  clientId?: string;
}

/**
 * Invitation details for display.
 */
export interface InvitationDetails {
  /** Invitation ID */
  id: string;
  /** Invitee's email */
  email: string;
  /** Role to be assigned */
  role: string;
  /** When the invitation expires */
  expiresAt: string;
  /** Tenant info */
  tenant: {
    id: string;
    name: string;
    slug: string;
  };
  /** Who sent the invitation */
  invitedBy: {
    name: string;
  } | null;
}
