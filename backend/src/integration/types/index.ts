/**
 * Shared types for Integration services
 */

export interface MembershipUser {
  id: string;
  email: string | null;
  givenName: string | null;
  familyName: string | null;
}

export interface MembershipRole {
  id: string;
  name: string;
  slug: string;
  applicationId?: string;
  applicationName?: string;
}

export interface TenantInfo {
  id: string;
  name: string;
  slug: string;
  initiateLoginUri: string | null;
}

export interface MembershipInfo {
  id: string;
  status: string;
  joinedAt: Date | null;
  createdAt: Date;
  user: MembershipUser;
  roles: MembershipRole[];
}

export interface SubscriptionInfo {
  id: string;
  applicationId: string;
  licenseType: string;
  licenseTypeName: string;
  status: string;
  quantityPurchased: number;
  quantityAssigned: number;
  quantityAvailable: number;
  currentPeriodEnd: Date;
  autoRenew: boolean;
}

export interface LicenseInfo {
  id: string;
  licenseTypeId: string;
  licenseTypeName: string;
  licenseTypeSlug: string;
  applicationId: string;
  applicationName: string;
  assignedAt: string;
}

export interface LicenseHolderInfo {
  userId: string;
  userEmail: string;
  userName?: string;
  licenseTypeId: string;
  licenseTypeName: string;
  assignedAt: string;
}

/**
 * Build the initiateLoginUri for a tenant.
 * Priority: Tenant's own URI > Instance template with {tenant} replaced
 */
export function buildInitiateLoginUri(
  tenantSlug: string,
  tenantUri: string | null,
  instanceUri: string | null,
): string | null {
  // Tenant-level override takes precedence
  if (tenantUri) {
    return tenantUri;
  }

  // Use instance template with {tenant} placeholder replaced
  if (instanceUri) {
    return instanceUri.replace(/\{tenant\}/g, tenantSlug);
  }

  return null;
}
