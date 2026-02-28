/**
 * Authorization Module - Type Definitions
 *
 * Re-exports shared types and defines internal types with Date objects.
 *
 * @packageDocumentation
 */

import { AccessType, AccessStatus } from '@prisma/client';

// Re-export shared types
export type {
  AccessStatus as AccessStatusType,
  AccessType as AccessTypeType,
  AppUserWithAccess,
} from '@authvital/shared';

// ===========================================================================
// APP ACCESS TYPES (Internal)
// ===========================================================================

export interface GrantAccessInput {
  tenantId: string;
  userId: string;
  applicationId: string;
  accessType?: AccessType;
  grantedById?: string;
  licenseAssignmentId?: string;
}

export interface RevokeAccessInput {
  tenantId: string;
  userId: string;
  applicationId: string;
  revokedById?: string;
}

export interface BulkGrantAccessInput {
  tenantId: string;
  applicationId: string;
  userIds: string[];
  accessType: AccessType;
  grantedById?: string;
}

/**
 * Internal app access info with Date objects.
 */
export interface AppAccessInfoInternal {
  id: string;
  userId: string;
  tenantId: string;
  applicationId: string;
  accessType: AccessType;
  status: AccessStatus;
  grantedAt: Date;
  grantedById: string | null;
  revokedAt: Date | null;
  licenseAssignmentId: string | null;
}

export interface AppAccessWithUserInternal extends AppAccessInfoInternal {
  user: {
    id: string;
    email: string | null;
    givenName: string | null;
    familyName: string | null;
  };
}

export interface AppAccessWithAppInternal extends AppAccessInfoInternal {
  application: {
    id: string;
    name: string;
    slug: string;
  };
}

export interface AccessCheckResult {
  hasAccess: boolean;
  accessType?: AccessType;
  status?: AccessStatus;
  reason?: string;
}

// ===========================================================================
// PERMISSION TYPES
// ===========================================================================

export interface PermissionCheckResult {
  allowed: boolean;
  reason?: string;
}

export interface UserPermissions {
  tenantPermissions: string[];
  appRoles: AppRoleInfo[];
  isOwner: boolean;
  isAdmin: boolean;
}

export interface AppRoleInfo {
  applicationId: string;
  roleId: string;
  roleName: string;
  roleSlug: string;
}

// ===========================================================================
// TENANT ROLE TYPES
// ===========================================================================

export interface TenantRoleInfo {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  permissions: string[];
  isSystem: boolean;
}

export interface MembershipRoleInfo {
  membershipId: string;
  tenantRoles: TenantRoleInfo[];
}

// ===========================================================================
// CONVERTERS
// ===========================================================================

import type { AppUserWithAccess } from '@authvital/shared';

/**
 * Convert internal app access info to API response format.
 */
export function toAppUserWithAccessApi(
  membershipId: string,
  userId: string,
  email: string | null,
  name: string,
  membershipStatus: 'ACTIVE' | 'INVITED' | 'SUSPENDED',
  access: AppAccessInfoInternal | null,
  role: { id: string; name: string; slug: string } | null,
): AppUserWithAccess {
  return {
    membershipId,
    userId,
    email,
    name,
    membershipStatus,
    hasAccess: access !== null && access.status === 'ACTIVE',
    accessStatus: access?.status ?? null,
    accessType: access?.accessType ?? null,
    grantedAt: access?.grantedAt.toISOString() ?? null,
    roleId: role?.id ?? null,
    roleName: role?.name ?? null,
    roleSlug: role?.slug ?? null,
  };
}
