/**
 * Tenant-related type definitions
 */

import { MembershipStatus } from '@prisma/client';

/**
 * Tenant overview stats for dashboard
 */
export interface TenantOverview {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  memberCount: number;
  pendingInvites: number;
  appCount: number;
}

/**
 * Member summary for list views
 */
export interface MemberSummary {
  id: string;
  status: MembershipStatus;
  joinedAt: Date | null;
  user: {
    id: string;
    email: string;
    givenName: string | null;
    familyName: string | null;
  };
  tenantRoles: Array<{
    id: string;
    name: string;
    slug: string;
  }>;
  appAccess: Array<{
    appId: string;
    appName: string;
    roleId: string;
    roleName: string;
  }>;
}

/**
 * App user with access info
 */
export interface AppUserInfo {
  membershipId: string;
  userId: string;
  email: string;
  name: string;
  membershipStatus: MembershipStatus;
  hasAccess: boolean;
  accessStatus: string | null;
  accessType: string | null;
  grantedAt: Date | null;
  roleId: string | null;
  roleName: string | null;
  roleSlug: string | null;
}

/**
 * App info with seat availability
 */
export interface AppInfo {
  id: string;
  name: string;
  slug: string;
  licensingMode: string;
  licenseTypeName: string;
  seatsUsed: number;
  seatsTotal: number;
  seatsAvailable: number;
  roles: Array<{
    id: string;
    name: string;
    slug: string;
    description: string | null;
    isDefault: boolean;
  }>;
}

/**
 * Subscription summary
 */
export interface SubscriptionSummary {
  applicationId: string;
  licenseType: string;
  licenseTypeName: string;
  seatsOwned: number;
  seatsAssigned: number;
}
