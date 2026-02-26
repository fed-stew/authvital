// =============================================================================
// Auth Types
// =============================================================================

export interface User {
  id: string;
  email: string;
  mfaEnabled: boolean;
  profile: Record<string, unknown>;
  createdAt: string;
}

export interface AuthResponse {
  accessToken: string;
  user: {
    id: string;
    email: string;
  };
}

// =============================================================================
// Instance Configuration Types (Replaces Directory)
// =============================================================================

export interface InstanceMeta {
  id: string;
  instanceUuid: string;
  name: string;
  allowSignUp: boolean;
  autoCreateTenant: boolean;
  allowGenericDomains: boolean;
  allowAnonymousSignUp: boolean;
  requiredUserFields: string[];
  defaultTenantRoleIds: string[];
  brandingName: string | null;
  brandingLogoUrl: string | null;
  brandingIconUrl: string | null;
  brandingPrimaryColor: string | null;
  brandingBackgroundColor: string | null;
  brandingAccentColor: string | null;
  brandingSupportUrl: string | null;
  brandingPrivacyUrl: string | null;
  brandingTermsUrl: string | null;
  initiateLoginUri: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InstanceApiKey {
  id: string;
  prefix: string;
  name: string;
  description: string | null;
  permissions: string[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
}

// =============================================================================
// Tenant Types
// =============================================================================

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  settings: Record<string, unknown>;
  initiateLoginUri: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TenantWithStats extends Tenant {
  stats: {
    memberCount: number;
    maxSeats: number;
    subscriptionName: string;
  };
}

// =============================================================================
// Membership Types
// =============================================================================

export type MembershipStatus = 'INVITED' | 'ACTIVE' | 'SUSPENDED';

export interface Membership {
  id: string;
  status: MembershipStatus;
  joinedAt: string | null;
  userId: string;
  tenantId: string;
  createdAt: string;
  updatedAt: string;
}

// =============================================================================
// RBAC Types
// =============================================================================

export type LicensingMode = 'FREE' | 'PER_SEAT' | 'TENANT_WIDE';

export type AccessMode = 'AUTOMATIC' | 'MANUAL_AUTO_GRANT' | 'MANUAL_NO_DEFAULT' | 'DISABLED';

export interface Application {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  
  // Licensing configuration
  licensingMode: LicensingMode;
  defaultLicenseTypeId: string | null;
  defaultSeatCount: number;
  autoProvisionOnSignup: boolean;
  autoGrantToOwner: boolean;
}

// Roles are now simple: name, slug, description
// Permission checking happens in the consuming application layer
export interface Role {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  applicationId?: string;
}

export interface ApplicationWithRoles {
  application: Application;
  roles: Role[];
}

// =============================================================================
// App Access Types (for toggle UI)
// =============================================================================

export type AccessStatus = 'ACTIVE' | 'REVOKED' | 'SUSPENDED';
export type AccessType = 'GRANTED' | 'INVITED' | 'AUTO_FREE' | 'AUTO_TENANT' | 'AUTO_OWNER';

export interface AppUserWithAccess {
  membershipId: string;
  userId: string;
  email: string | null;
  name: string;
  membershipStatus: MembershipStatus; // INVITED = pending invite, ACTIVE = full member
  hasAccess: boolean;
  accessStatus: AccessStatus | null;
  accessType: AccessType | null;
  grantedAt: string | null;
  roleId: string | null;
  roleName: string | null;
  roleSlug: string | null;
}

export interface AppUsersResponse {
  app: {
    id: string;
    name: string;
    slug: string;
    licensingMode: LicensingMode;
    licenseTypeName: string;
    seatsUsed: number;
    seatsTotal: number;
    seatsAvailable: number;
    roles: Array<{
      id: string;
      name: string;
      slug: string;
      description?: string;
      isDefault?: boolean;
    }>;
  };
  users: AppUserWithAccess[];
  totalMembers: number;
  membersWithAccess: number;
}

// =============================================================================
// Subscription Types
// =============================================================================

export type SubscriptionInterval = 'MONTHLY' | 'YEARLY';
export type TenantSubscriptionStatus = 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'TRIALING';

export interface Subscription {
  id: string;
  name: string;
  price: number;
  interval: SubscriptionInterval;
  maxSeats: number;
  features: string[];
  isActive: boolean;
}

export interface TenantSubscription {
  id: string;
  name: string;
  price: number;
  interval: SubscriptionInterval;
  status: TenantSubscriptionStatus;
  currentPeriodEnd: string;
  autoRenew: boolean;
  features: string[];
}

export interface SubscriptionUsage {
  seatsUsed: number;
  seatsTotal: number;
  usagePercentage: number;
  isNearLimit: boolean;
  isAtLimit: boolean;
}

export interface TenantSubscriptionResponse {
  hasSubscription: boolean;
  subscription: TenantSubscription | null;
  usage: SubscriptionUsage | null;
}

// =============================================================================
// Domain Verification Types
// =============================================================================

export interface DomainVerification {
  token: string;
  txtRecord: {
    type: string;
    name: string;
    value: string;
  };
  instructions: string;
}

export interface Domain {
  id: string;
  domainName: string;
  isVerified: boolean;
  verifiedAt: string | null;
  createdAt: string;
  verification: DomainVerification;
}

export interface DomainVerifyResponse {
  success: boolean;
  message: string;
  domain: Domain;
}

export interface DomainVerifyError {
  message: string;
  tip: string;
  expectedRecord?: {
    type: string;
    name: string;
    value: string;
  };
  foundRecords?: string[];
  code?: string;
}

// =============================================================================
// License Management Types
// =============================================================================

export type LicenseTypeStatus = 'DRAFT' | 'ACTIVE' | 'HIDDEN' | 'ARCHIVED';

export interface LicenseType {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  applicationId: string;
  applicationName?: string;
  features: Record<string, boolean>;
  maxMembers: number | null;
 status: LicenseTypeStatus;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface LicenseAssignment {
  id: string;
  userId: string;
  tenantId: string;
  applicationId: string;
  licenseTypeId: string;
  licenseTypeName: string;
  subscriptionId: string | null;
  assignedAt: string;
  user?: {
    id: string;
    email: string;
    givenName?: string;
    familyName?: string;
  };
  licenseType?: LicenseType;
}

export interface LicenseHolder {
  userId: string;
  userEmail: string;
  userName?: string;
  licenseTypeId: string;
  licenseTypeName: string;
  assignedAt: string;
}

export interface AppSubscription {
  id: string;
  tenantId: string;
  tenantName: string;
  applicationId: string;
  applicationName: string;
  licenseTypeId: string;
  licenseTypeName: string;
  quantityPurchased: number;
  quantityAssigned: number;
  status: 'ACTIVE' | 'CANCELED' | 'EXPIRED';
  currentPeriodStart: string;
  currentPeriodEnd: string;
  createdAt: string;
  updatedAt: string;
}

// =============================================================================
// License Audit Log Types
// =============================================================================

export type LicenseAuditAction = 'GRANTED' | 'REVOKED' | 'CHANGED';

export interface LicenseAuditLogEntry {
  id: string;
  tenantId: string;
  userId: string;
  userEmail: string;
  userName?: string;
  applicationId: string;
  applicationName: string;
  licenseTypeId: string;
  licenseTypeName: string;
  action: LicenseAuditAction;
  previousLicenseTypeName?: string;
  performedBy: string;
  performedByUser?: {
    id: string;
    email: string;
    givenName?: string;
    familyName?: string;
  };
  performedAt: string;
  reason?: string;
}

export interface LicenseAuditLogResult {
  entries: LicenseAuditLogEntry[];
  total: number;
  limit: number;
  offset: number;
}

// =============================================================================
// Member Access Check Types
// =============================================================================

export interface MemberAccessResult {
  allowed: boolean;
  mode: LicensingMode;
  message?: string;
  reason?: string;
  capacity?: {
    available: number;
    purchased: number;
    assigned: number;
  };
  memberLimit?: {
    maxMembers: number | null;
    currentMembers: number;
    available: number | null;
  };
}

// =============================================================================
// Usage Dashboard Types
// =============================================================================

export interface TenantUsageOverview {
  tenantId: string;
  tenantName: string;
  subscriptions: Array<{
    applicationId: string;
    applicationName: string;
    licenseTypeName: string;
    totalSeats: number;
    seatsAssigned: number;
    seatsAvailable: number;
    utilizationPercentage: number;
  }>;
  totalSeatsAcrossAllApps: number;
  totalSeatsAssigned: number;
  overallUtilization: number;
  hasOverage: boolean;
  overageApplications: string[];
}

export interface UsageTrendEntry {
  date: string;
  seatsAssigned: number;
  seatsAvailable: number;
  utilizationPercentage: number;
  newUsers: number;
}

export interface UsageDashboardData {
  overview: TenantUsageOverview;
  trends: UsageTrendEntry[];
  topApplications: Array<{
    applicationId: string;
    applicationName: string;
    seatsAssigned: number;
    utilizationPercentage: number;
  }>;
  recentActivity: LicenseAuditLogEntry[];
}
