/**
 * @authvital/sdk - Server-Side Types
 *
 * Re-exports canonical types from @authvital/shared.
 * SDK-specific types are defined below.
 */

// =============================================================================
// RE-EXPORTED FROM @authvital/shared (canonical source)
// =============================================================================
export type {
  // Auth types
  TokenResponse,
  EnhancedJwtPayload,
  JwtLicenseInfo,
  User,
  AuthVitalUser,
  AuthResponse,

  // Licensing types
  SubscriptionStatusType,
  MembershipStatusType,
  SubscriptionSummary,
  MemberWithLicenses,
  AvailableLicenseType,
  TenantLicenseOverview,
  LicenseType,
  LicenseTypeStatus,
  LicenseAuditAction,
  LicenseAuditLogEntry,
  LicenseAuditLogResult,

  // Membership types
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

  // API types
  PaginatedResponse,
  ApiError,
  ApiResponse,
} from '@authvital/shared';

// =============================================================================
// CLIENT CONFIGURATION
// =============================================================================

export interface AuthVitalClientConfig {
  /** AuthVital server URL (e.g., https://auth.yourapp.com) */
  authVitalHost: string;
  /** OAuth client_id for your application */
  clientId: string;
  /** OAuth client_secret for your application */
  clientSecret: string;
  /** Optional: Scopes to request (default: 'system:admin') */
  scope?: string;
}

export interface OAuthFlowConfig {
  /** AuthVital server URL */
  authVitalHost: string;
  /** OAuth client_id */
  clientId: string;
  /** OAuth client_secret (optional for public clients) */
  clientSecret?: string;
  /** OAuth redirect URI */
  redirectUri: string;
  /** OAuth scopes */
  scope?: string;
}

// =============================================================================
// INVITATION TYPES (SDK-specific request/response shapes)
// =============================================================================

export interface InvitationResponse {
  /** The user's ID (sub claim in JWT) */
  sub: string;
  /** When the invitation expires */
  expiresAt: string;
}

export interface ResendInvitationParams {
  invitationId: string;
  expiresInDays?: number;
}

export interface RevokeInvitationResponse {
  success: boolean;
  message: string;
}

// =============================================================================
// MEMBERSHIP TYPES (SDK-specific shapes)
// =============================================================================

export interface ApplicationMembership {
  id: string;
  status: string;
  joinedAt: string | null;
  createdAt: string;
  user: import('@authvital/shared').MembershipUser;
  tenant: {
    id: string;
    name: string;
    slug: string;
    initiateLoginUri: string | null;
  };
  roles: import('@authvital/shared').MembershipRole[];
}

export interface ApplicationMembershipsResponse {
  applicationId: string;
  applicationName: string;
  clientId: string;
  memberships: ApplicationMembership[];
  totalCount: number;
}

export interface ValidateMembershipResponse {
  isMember: boolean;
  membership: {
    id: string;
    status: string;
    joinedAt: string | null;
  } | null;
}

export interface SetMemberRoleResponse {
  success: boolean;
  message: string;
  role: { id: string; name: string; slug: string };
}

// =============================================================================
// PERMISSION TYPES
// =============================================================================

export interface CheckPermissionParams {
  userId: string;
  tenantId: string;
  permission: string;
}

export interface CheckPermissionResult {
  allowed: boolean;
  reason?: string;
}

export interface CheckPermissionsParams {
  userId: string;
  tenantId: string;
  permissions: string[];
}

export interface CheckPermissionsResult {
  results: Record<string, boolean>;
  allAllowed: boolean;
}

export interface UserPermissions {
  permissions: string[];
  roles: Array<{ id: string; name: string; slug: string }>;
}

// =============================================================================
// ENTITLEMENT TYPES
// =============================================================================

export interface QuotaCheckResult {
  allowed: boolean;
  currentUsage?: number;
  limit?: number;
  reason?: string;
  wouldTriggerOverage?: boolean;
  overagePriceId?: string | null;
}

export interface FeatureCheckResult {
  hasAccess: boolean;
  licenseType: string | null;
  reason?: string;
}

export interface AppAccessResult {
  hasAccess: boolean;
  applicationId: string;
  reason?: string;
}

export interface QuotaStatus {
  key: string;
  scope: string;
  limit: number;
  usage: number;
  policy: 'BLOCK' | 'ALLOW_OVERAGE';
  percentUsed: number;
}

export interface TenantEntitlementStatus {
  plan: {
    id: string;
    name: string;
    status: string;
    currentPeriodEnd: string;
    autoRenew: boolean;
  } | null;
  appsUnlocked: string[];
  quotas: QuotaStatus[];
  features: Record<string, boolean>;
}

// =============================================================================
// SESSION MANAGEMENT TYPES
// =============================================================================

export interface UserSession {
  id: string;
  createdAt: string;
  expiresAt: string;
  userAgent: string | null;
  ipAddress: string | null;
  tenant: string | null;
}

export interface UserSessionsResponse {
  sessions: UserSession[];
  count: number;
}

export interface LogoutResponse {
  success: boolean;
  message: string;
}

export interface LogoutAllResponse {
  success: boolean;
  message: string;
  count: number;
}

export interface RefreshTokenPayload {
  sid: string;
  sub: string;
  aud: string;
  scope: string;
  tenant_id?: string;
  tenant_subdomain?: string;
  token_type: 'refresh';
  iat: number;
  exp: number;
}

// =============================================================================
// LICENSE MANAGEMENT TYPES
// =============================================================================

export interface LicenseGrantOptions {
  userId?: string;
  applicationId: string;
  licenseTypeId: string;
}

export interface LicenseRevokeOptions {
  userId?: string;
  applicationId: string;
}

export interface LicenseChangeTypeOptions {
  userId?: string;
  applicationId: string;
  newLicenseTypeId: string;
}

export interface LicenseAssignment {
  id: string;
  licenseTypeId: string;
  licenseTypeName: string;
  licenseTypeSlug: string;
  applicationId: string;
  applicationName: string;
  assignedAt: string;
}

export interface LicenseHolder {
  userId: string;
  userEmail: string;
  userName?: string;
  licenseTypeId: string;
  licenseTypeName: string;
  assignedAt: string;
}

export interface GrantLicenseResult {
  assignmentId: string;
  message: string;
}

export interface RevokeLicenseResult {
  message: string;
}

export interface ChangeLicenseTypeResult {
  message: string;
}

export interface GetLicenseAuditLogParams {
  tenantId: string;
  userId?: string;
  applicationId?: string;
  limit?: number;
  offset?: number;
}

// =============================================================================
// TENANT LICENSE MANAGEMENT TYPES (M2M - Super Admin)
// =============================================================================

export interface UserLicenseAssignment {
  id: string;
  userId: string;
  applicationId: string;
  applicationName: string;
  licenseTypeId: string;
  licenseTypeName: string;
  licenseTypeSlug: string;
  features: Record<string, boolean>;
  assignedAt: string;
  assignedById?: string;
}

export interface GrantLicenseParams {
  tenantId: string;
  userId: string;
  applicationId: string;
  licenseTypeId: string;
}

export interface RevokeLicenseParams {
  tenantId: string;
  userId: string;
  applicationId: string;
}

export interface ChangeLicenseTypeParams {
  tenantId: string;
  userId: string;
  applicationId: string;
  newLicenseTypeId: string;
}

export interface BulkGrantLicenseResult {
  userId: string;
  applicationId: string;
  success: boolean;
  error?: string;
}

export interface BulkRevokeLicenseResult {
  revokedCount: number;
  failures: Array<{
    userId: string;
    applicationId: string;
    error: string;
  }>;
}
