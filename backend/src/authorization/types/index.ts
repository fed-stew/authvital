/**
 * Authorization Module - Type Definitions
 */

import { AccessType, AccessStatus } from '@prisma/client';

// ===========================================================================
// APP ACCESS TYPES
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

export interface AppAccessInfo {
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

export interface AppAccessWithUser extends AppAccessInfo {
  user: {
    id: string;
    email: string | null;
    givenName: string | null;
    familyName: string | null;
  };
}

export interface AppAccessWithApp extends AppAccessInfo {
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
