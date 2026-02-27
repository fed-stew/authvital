/**
 * @authvital/sdk - Server-Side Types
 *
 * Clean, well-organized type definitions for the AuthVital server SDK.
 *
 * ╔════════════════════════════════════════════════════════════════════════════╗
 * ║  IMPORTANT: CANONICAL TYPE SYNCHRONIZATION                                  ║
 * ╠════════════════════════════════════════════════════════════════════════════╣
 * ║  The following types are COPIES of canonical definitions:                   ║
 * ║                                                                             ║
 * ║  - SubscriptionSummary                                                      ║
 * ║  - SubscriptionStatusType                                                   ║
 * ║  - MemberWithLicenses                                                       ║
 * ║  - MembershipStatusType                                                     ║
 * ║  - AvailableLicenseType                                                     ║
 * ║  - TenantLicenseOverview                                                    ║
 * ║                                                                             ║
 * ║  SOURCE OF TRUTH: backend/src/common/types/licensing.types.ts               ║
 * ║                                                                             ║
 * ║  When updating these types, ALWAYS update the canonical source first,       ║
 * ║  then sync changes here to maintain consistency.                            ║
 * ╚════════════════════════════════════════════════════════════════════════════╝
 */

// =============================================================================
// CANONICAL LICENSING TYPES (synced from backend/src/common/types/)
// =============================================================================

/**
 * Subscription status values.
 * @sync backend/src/common/types/licensing.types.ts
 */
export type SubscriptionStatusType =
  | 'ACTIVE'
  | 'TRIALING'
  | 'PAST_DUE'
  | 'CANCELED'
  | 'EXPIRED';

/**
 * Membership status values.
 * @sync backend/src/common/types/licensing.types.ts
 */
export type MembershipStatusType = 'ACTIVE' | 'INVITED' | 'SUSPENDED';

/**
 * Summary of a tenant's subscription (license inventory).
 * @sync backend/src/common/types/licensing.types.ts
 */
export interface SubscriptionSummary {
  id: string;
  applicationId: string;
  applicationName: string;
  licenseTypeId: string;
  licenseTypeName: string;
  licenseTypeSlug: string;
  quantityPurchased: number;
  quantityAssigned: number;
  quantityAvailable: number;
  status: SubscriptionStatusType;
  currentPeriodEnd: string;
  features: Record<string, boolean>;
}

/**
 * A tenant member with their license assignments.
 * @sync backend/src/common/types/licensing.types.ts
 */
export interface MemberWithLicenses {
  user: {
    id: string;
    email: string | null;
    givenName: string | null;
    familyName: string | null;
  };
  membership: {
    id: string;
    status: MembershipStatusType;
  };
  licenses: Array<{
    id: string;
    applicationId: string;
    applicationName: string;
    licenseTypeId: string;
    licenseTypeName: string;
    licenseTypeSlug: string;
    assignedAt: string;
  }>;
}

/**
 * A license type available for provisioning.
 * @sync backend/src/common/types/licensing.types.ts
 */
export interface AvailableLicenseType {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  applicationId: string;
  applicationName: string;
  features: Record<string, boolean>;
  displayOrder: number;
  hasSubscription: boolean;
  existingSubscription?: {
    id: string;
    quantityPurchased: number;
    quantityAssigned: number;
  };
}

/**
 * Full license overview for a tenant.
 * @sync backend/src/common/types/licensing.types.ts
 */
export interface TenantLicenseOverview {
  tenantId: string;
  subscriptions: SubscriptionSummary[];
  totalSeatsOwned: number;
  totalSeatsAssigned: number;
}

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
// TOKEN TYPES
// =============================================================================

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  id_token?: string;
  scope?: string;
}

// =============================================================================
// JWT TYPES
// =============================================================================

/**
 * License information included in JWT
 */
export interface JwtLicenseInfo {
  /** License type slug (e.g., "pro", "enterprise") */
  type: string;
  /** License type display name */
  name: string;
  /** Enabled feature keys */
  features: string[];
}

/**
 * Enhanced JWT payload with OIDC standard claims
 * 
 * This represents the decoded JWT token contents from AuthVital.
 * Claims are included based on requested OAuth scopes.
 */
export interface EnhancedJwtPayload {
  // ═══════════════════════════════════════════════════════════════════════════
  // STANDARD JWT CLAIMS
  // ═══════════════════════════════════════════════════════════════════════════
  /** Subject (user ID) */
  sub: string;
  /** Audience (client ID) */
  aud: string | string[];
  /** Issuer (AuthVital URL) */
  iss: string;
  /** Issued at (unix timestamp) */
  iat: number;
  /** Expiration (unix timestamp) */
  exp: number;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PROFILE SCOPE (OIDC Standard)
  // ═══════════════════════════════════════════════════════════════════════════
  /** Unique handle - OIDC: preferred_username */
  preferred_username?: string;
  /** Full display name - OIDC: name */
  name?: string;
  /** First name - OIDC: given_name */
  given_name?: string;
  /** Last name - OIDC: family_name */
  family_name?: string;
  /** Middle name(s) - OIDC: middle_name */
  middle_name?: string;
  /** Casual name - OIDC: nickname */
  nickname?: string;
  /** Profile picture URL - OIDC: picture */
  picture?: string;
  /** Personal URL - OIDC: website */
  website?: string;
  /** Gender identity - OIDC: gender */
  gender?: string;
  /** Birth date (YYYY-MM-DD) - OIDC: birthdate */
  birthdate?: string;
  /** IANA timezone - OIDC: zoneinfo */
  zoneinfo?: string;
  /** Language/region - OIDC: locale */
  locale?: string;
  /** Last profile update (unix timestamp) - OIDC: updated_at */
  updated_at?: number;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // EMAIL SCOPE (OIDC Standard)
  // ═══════════════════════════════════════════════════════════════════════════
  /** Email address - OIDC: email */
  email?: string;
  /** Whether email is verified - OIDC: email_verified */
  email_verified?: boolean;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PHONE SCOPE (OIDC Standard)
  // ═══════════════════════════════════════════════════════════════════════════
  /** Phone number (E.164) - OIDC: phone_number */
  phone_number?: string;
  /** Whether phone is verified - OIDC: phone_number_verified */
  phone_number_verified?: boolean;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // TENANT CONTEXT (AuthVital-specific)
  // ═══════════════════════════════════════════════════════════════════════════
  /** Current tenant ID (when token is tenant-scoped) */
  tenant_id?: string;
  /** Tenant subdomain */
  tenant_subdomain?: string;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // AUTHORIZATION (AuthVital-specific)
  // ═══════════════════════════════════════════════════════════════════════════
  /** Tenant-level roles (from TenantRole) */
  tenant_roles?: string[];
  /** Tenant-level permissions */
  tenant_permissions?: string[];
  /** Application-specific roles (from Role) */
  app_roles?: string[];
  /** Application-specific permissions */
  app_permissions?: string[];
  /** Groups the user belongs to in the current tenant */
  groups?: string[];
  
  // ═══════════════════════════════════════════════════════════════════════════
  // LICENSE (AuthVital-specific)
  // ═══════════════════════════════════════════════════════════════════════════
  /** License info for current app */
  license?: JwtLicenseInfo;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // OAUTH
  // ═══════════════════════════════════════════════════════════════════════════
  /** Granted scopes */
  scope?: string;
  
  // Allow additional custom claims
  [key: string]: unknown;
}

// =============================================================================
// INVITATION TYPES
// =============================================================================

export interface InvitationResponse {
  /** The user's ID (sub claim in JWT) */
  sub: string;
  /** When the invitation expires */
  expiresAt: string;
}

export interface PendingInvitation {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  createdAt: string;
  invitedBy: {
    id: string;
    email: string | null;
    givenName: string | null;
    familyName: string | null;
  } | null;
}

export interface PendingInvitationsResponse {
  tenantId: string;
  tenantName: string;
  invitations: PendingInvitation[];
  totalCount: number;
}

export interface SendInvitationParams {
  email: string;
  /** User's first name (used if creating new user) */
  givenName?: string;
  /** User's last name (used if creating new user) */
  familyName?: string;
  /** 
   * Tenant role ID to assign when invitation is accepted.
   * Required. Get available role IDs from `authvital.memberships.getTenantRoles()`.
   */
  roleId: string;
  expiresInDays?: number;
  /** Application clientId - determines redirect URL after acceptance */
  clientId?: string;
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
// MEMBERSHIP TYPES
// =============================================================================

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
  applicationId: string;
  applicationName: string;
}

export interface TenantMembership {
  id: string;
  status: string;
  joinedAt: string | null;
  createdAt: string;
  user: MembershipUser;
  roles: MembershipRole[];
}

export interface TenantMembershipsResponse {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  initiateLoginUri: string | null;
  memberships: TenantMembership[];
  totalCount: number;
}

export interface ApplicationMembership {
  id: string;
  status: string;
  joinedAt: string | null;
  createdAt: string;
  user: MembershipUser;
  tenant: {
    id: string;
    name: string;
    slug: string;
    initiateLoginUri: string | null;
  };
  roles: MembershipRole[];
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

export interface UserTenantMembership {
  id: string;
  status: string;
  joinedAt: string | null;
  createdAt: string;
  tenant: {
    id: string;
    name: string;
    slug: string;
    initiateLoginUri: string | null;
  };
  roles: MembershipRole[];
}

export interface UserTenantsResponse {
  userId: string;
  memberships: UserTenantMembership[];
  totalCount: number;
}

// =============================================================================
// TENANT ROLE TYPES
// =============================================================================

export interface TenantRoleDefinition {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
}

export interface TenantRolesResponse {
  roles: TenantRoleDefinition[];
}

// =============================================================================
// APPLICATION ROLE TYPES
// =============================================================================

export interface ApplicationRoleDefinition {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
}

export interface ApplicationRolesResponse {
  applicationId: string;
  applicationName: string;
  clientId: string;
  roles: ApplicationRoleDefinition[];
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
// ENTITLEMENT TYPES (NEW - Plan-based entitlements)
// =============================================================================

/**
 * Result of checking a quota
 */
export interface QuotaCheckResult {
  /** Whether the action is allowed */
  allowed: boolean;
  /** Current usage count */
  currentUsage?: number;
  /** The limit */
  limit?: number;
  /** Reason if not allowed */
  reason?: string;
  /** Whether this would trigger overage billing */
  wouldTriggerOverage?: boolean;
  /** The overage price ID if applicable */
  overagePriceId?: string | null;
}

/**
 * Result of checking a feature flag
 */
export interface FeatureCheckResult {
  /** Whether the feature is enabled */
  hasAccess: boolean;
  /** The license type slug */
  licenseType: string | null;
  /** Reason if not enabled */
  reason?: string;
}

/**
 * Result of checking app access
 */
export interface AppAccessResult {
  /** Whether the tenant has access to the app */
  hasAccess: boolean;
  /** The application ID */
  applicationId: string;
  /** Reason if no access */
  reason?: string;
}

/**
 * A quota's current status
 */
export interface QuotaStatus {
  key: string;
  scope: string;
  limit: number;
  usage: number;
  policy: 'BLOCK' | 'ALLOW_OVERAGE';
  percentUsed: number;
}

/**
 * Full entitlement status for a tenant
 */
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
// TOKEN GHOSTING: SESSION MANAGEMENT TYPES
// =============================================================================

/**
 * Session info returned by the sessions endpoint
 */
export interface UserSession {
  /** Session ID (used for revocation) */
  id: string;
  /** When the session was created */
  createdAt: string;
  /** When the session expires */
  expiresAt: string;
  /** User agent string (browser/device info) */
  userAgent: string | null;
  /** IP address of the session */
  ipAddress: string | null;
  /** Tenant subdomain if session is tenant-scoped */
  tenant: string | null;
}

/**
 * Response from GET /oauth/sessions
 */
export interface UserSessionsResponse {
  sessions: UserSession[];
  count: number;
}

/**
 * Response from POST /oauth/logout
 */
export interface LogoutResponse {
  success: boolean;
  message: string;
}

/**
 * Response from POST /oauth/logout-all
 */
export interface LogoutAllResponse {
  success: boolean;
  message: string;
  count: number;
}

/**
 * Decoded refresh token JWT payload (Token Ghosting)
 */
export interface RefreshTokenPayload {
  /** Session ID - points to session record in DB */
  sid: string;
  /** User ID */
  sub: string;
  /** Client ID (audience) */
  aud: string;
  /** OAuth scopes */
  scope: string;
  /** Tenant ID if session is tenant-scoped */
  tenant_id?: string;
  /** Tenant subdomain if session is tenant-scoped */
  tenant_subdomain?: string;
  /** Token type (always 'refresh' for refresh tokens) */
  token_type: 'refresh';
  /** Issued at timestamp */
  iat: number;
  /** Expiration timestamp */
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
  action: 'GRANTED' | 'REVOKED' | 'CHANGED';
  previousLicenseTypeName?: string;
  performedBy: string; // Admin user who performed the action
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
// TENANT LICENSE MANAGEMENT TYPES (M2M - Super Admin)
// =============================================================================

/**
 * User's license assignment info
 */
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

/**
 * Parameters for granting a license (M2M)
 */
export interface GrantLicenseParams {
  tenantId: string;
  userId: string;
  applicationId: string;
  licenseTypeId: string;
}

/**
 * Parameters for revoking a license (M2M)
 */
export interface RevokeLicenseParams {
  tenantId: string;
  userId: string;
  applicationId: string;
}

/**
 * Parameters for changing license type (M2M)
 */
export interface ChangeLicenseTypeParams {
  tenantId: string;
  userId: string;
  applicationId: string;
  newLicenseTypeId: string;
}

/**
 * Bulk grant license result
 */
export interface BulkGrantLicenseResult {
  userId: string;
  applicationId: string;
  success: boolean;
  error?: string;
}

/**
 * Bulk revoke license result
 */
export interface BulkRevokeLicenseResult {
  revokedCount: number;
  failures: Array<{
    userId: string;
    applicationId: string;
    error: string;
  }>;
}
