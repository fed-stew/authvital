/**
 * Frontend Type Definitions
 *
 * This file re-exports canonical types from @authvital/shared
 * and defines frontend-specific types for API responses and UI.
 */

// =============================================================================
// RE-EXPORTS FROM @authvital/shared (canonical source of truth)
// =============================================================================

export type {
  // Auth
  User,
  AuthResponse,
  TokenResponse,
  EnhancedJwtPayload,
  JwtLicenseInfo,

  // Tenant & Membership
  Tenant,
  TenantWithStats,
  Membership,
  MembershipStatus,
  Domain,
  DomainVerification,

  // Membership (new!)
  MembershipUser,
  MembershipRole,
  MembershipTenant,
  TenantMembership,
  TenantMembershipsResponse,
  UserTenantMembership,
  UserTenantsResponse,
  TenantRoleDefinition,
  TenantRolesResponse,
  ApplicationRoleDefinition,
  ApplicationRolesResponse,
  PendingInvitation,
  PendingInvitationsResponse,
  SendInvitationParams,
  InvitationDetails,

  // RBAC
  LicensingMode,
  AccessMode,
  Application,
  Role,
  AccessStatus,
  AccessType,
  AppUserWithAccess,

  // Licensing
  SubscriptionStatusType,
  MembershipStatusType,
  SubscriptionSummary,
  MemberWithLicenses,
  AvailableLicenseType,
  TenantLicenseOverview,
  LicenseTypeStatus,
  LicenseType,
  LicenseAssignment,
  LicenseAuditAction,
  LicenseAuditLogEntry,
  LicenseAuditLogResult,

  // API
  PaginatedResponse,
  ApiError,
  ApiResponse,
} from '@authvital/shared';

// =============================================================================
// CONTAINER MODEL (app-client-split — Phase 2 contracts)
// =============================================================================
// An Application is a CONTAINER; OAuth credentials live on child clients.
// These are the canonical shapes the admin UI consumes in Phase 3. Import them
// from here (or straight from @authvital/contracts) — never re-derive the old
// flat Application shape that assumed one client + one secret per app.

export type {
  AppWithClients,
  ApplicationClient,
  ClientType,
  AddClientInput,
  AddClientResponse,
  UpdateClientInput,
  CreateApplicationInput,
  CreateApplicationResponse,
  UpdateApplicationInput,
  M2mTenantGrant,
} from '@authvital/contracts';

// =============================================================================
// FRONTEND-SPECIFIC: Instance Configuration Types
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
// FRONTEND-SPECIFIC: API Response Types
// =============================================================================

import type { LicensingMode, AppUserWithAccess } from '@authvital/shared';

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
// FRONTEND-SPECIFIC: Subscription Types
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
// FRONTEND-SPECIFIC: Domain Verification Response Types
// =============================================================================

import type { Domain, MembershipStatus } from '@authvital/shared';

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
// FRONTEND-SPECIFIC: License Holder (simplified for lists)
// =============================================================================

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
// FRONTEND-SPECIFIC: Member Access Check
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
// FRONTEND-SPECIFIC: Usage Dashboard
// =============================================================================

import type { LicenseAuditLogEntry } from '@authvital/shared';

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

// =============================================================================
// PHASE 4b: Audit log (GET /tenants/:id/audit)
// =============================================================================

export interface AuditLogItem {
  id: string;
  tenantId: string;
  userId: string | null;
  actorEmail: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface AuditQueryResult {
  items: AuditLogItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// =============================================================================
// PHASE 4b: Usage trends (GET /tenants/:id/licenses/usage-trends)
// =============================================================================

export interface UsagePoint {
  date: string; // YYYY-MM-DD (UTC)
  totalSeats: number;
  seatsAssigned: number;
}

export interface UsageTrendsResult {
  tenantId: string;
  days: number;
  series: UsagePoint[];
  byApplication: Array<{
    applicationId: string;
    applicationName: string;
    series: UsagePoint[];
  }>;
}

// =============================================================================
// PHASE 4b: Cross-app access matrix (GET /tenants/:id/app-access-matrix)
// =============================================================================

export interface AccessMatrixCell {
  appId: string;
  appName: string;
  hasAccess: boolean;
  role: string | null;
  licenseType: string | null;
}

export interface AccessMatrixMember {
  userId: string;
  email: string;
  name: string;
  apps: AccessMatrixCell[];
}

export interface AccessMatrixResult {
  tenantId: string;
  apps: Array<{ appId: string; appName: string }>;
  members: AccessMatrixMember[];
}

// =============================================================================
// PHASE 4b: Account settings (GET /auth/profile, GET /oauth/sessions)
// =============================================================================

export interface AccountProfile {
  id: string;
  email: string;
  mfaEnabled: boolean;
  givenName: string | null;
  familyName: string | null;
  displayName: string | null;
  pictureUrl: string | null;
  createdAt: string;
  memberships: Array<{
    id: string;
    status: MembershipStatus;
    joinedAt: string | null;
    tenant: { id: string; name: string; slug: string };
  }>;
}

export interface AccountSession {
  id: string;
  createdAt: string;
  expiresAt: string;
  userAgent: string | null;
  ipAddress: string | null;
  tenant: string | null;
}
