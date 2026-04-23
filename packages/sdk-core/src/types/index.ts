/**
 * @authvital/core - Type Definitions
 *
 * All TypeScript interfaces and types for the AuthVital platform.
 * These types are environment-agnostic and can be used in any context.
 *
 * @packageDocumentation
 */

// =============================================================================
// USER TYPES
// =============================================================================

/**
 * Core user entity.
 *
 * Represents a user account in the AuthVital system.
 */
export interface User {
  /** Unique user identifier (sub claim in JWT) */
  id: string;
  /** User's email address */
  email: string;
  /** Whether MFA is enabled for this user */
  mfaEnabled: boolean;
  /** User profile data (custom claims) */
  profile: Record<string, unknown>;
  /** When the user was created (ISO 8601 date string) */
  createdAt: string;
}

/**
 * User info extracted from JWT payload.
 *
 * Contains common user fields extracted from an AuthVital JWT.
 */
export interface UserInfo {
  /** User ID (sub claim) */
  id: string;
  /** User's email address */
  email: string | null;
  /** Whether email is verified */
  emailVerified: boolean;
  /** User's first name */
  givenName: string | null;
  /** User's last name */
  familyName: string | null;
  /** User's full display name */
  name: string | null;
  /** Profile picture URL */
  picture: string | null;
  /** Current tenant ID */
  tenantId: string | null;
  /** Tenant subdomain */
  tenantSubdomain: string | null;
  /** Tenant roles assigned to the user */
  tenantRoles: string[];
  /** Application roles assigned to the user */
  appRoles: string[];
  /** License type (e.g., 'pro', 'enterprise') */
  licenseType: string | null;
  /** Features enabled for the user's license */
  licenseFeatures: string[];
}

/**
 * Alias for User - used in SDK context.
 */
export type AuthVitalUser = User;

/**
 * Basic user info for client-side components.
 * Simplified from the full User type for UI purposes.
 */
export interface ClientUser {
  id: string;
  email: string | null;
  givenName: string | null;
  familyName: string | null;
  fullName: string | null;
  imageUrl?: string | null;
  isAnonymous: boolean;
  createdAt?: string;
  updatedAt?: string;
}

// =============================================================================
// AUTH RESPONSE TYPES
// =============================================================================

/**
 * Response from authentication endpoints.
 *
 * Returned after successful login, containing the access token and user info.
 */
export interface AuthResponse {
  /** The JWT access token */
  accessToken: string;
  /** Basic user information */
  user: {
    id: string;
    email: string;
  };
}

/**
 * OAuth 2.0 token response.
 *
 * Standard token response format following RFC 6749.
 */
export interface TokenResponse {
  /** The access token */
  access_token: string;
  /** Token type (always "Bearer") */
  token_type: string;
  /** Token lifetime in seconds */
  expires_in: number;
  /** Optional refresh token */
  refresh_token?: string;
  /** Optional ID token (OpenID Connect) */
  id_token?: string;
  /** Granted OAuth scopes */
  scope?: string;
}

// =============================================================================
// JWT TYPES
// =============================================================================

/**
 * License information included in JWT tokens.
 *
 * When a user has an active license for the current application,
 * this information is embedded in their JWT.
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
 * Enhanced JWT payload with OIDC standard claims.
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

  /** Allow additional custom claims */
  [key: string]: unknown;
}

/**
 * JWT header structure.
 */
export interface JwtHeader {
  alg: string;
  typ?: string;
  kid?: string;
}

/**
 * Generic JWT payload structure.
 */
export interface JwtPayload {
  iss?: string;
  sub?: string;
  aud?: string | string[];
  exp?: number;
  nbf?: number;
  iat?: number;
  jti?: string;
  [key: string]: unknown;
}

/**
 * JWKS key structure.
 */
export interface JwksKey {
  kty: string;
  kid: string;
  use?: string;
  alg?: string;
  n?: string;
  e?: string;
  x5c?: string[];
}

/**
 * JWKS response structure.
 */
export interface Jwks {
  keys: JwksKey[];
}

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
 * Tenant info for client-side components.
 */
export interface ClientTenant {
  id: string;
  name: string;
  slug: string;
  imageUrl?: string | null;
  role: string;
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
// MEMBERSHIP TYPES
// =============================================================================

/**
 * Membership status values.
 */
export type MembershipStatusType = 'active' | 'invited' | 'suspended' | 'inactive';

/**
 * User's membership in a tenant.
 *
 * Represents the relationship between a user and a tenant.
 */
export interface Membership {
  /** Unique membership identifier */
  id: string;
  /** Current membership status */
  status: MembershipStatusType;
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

/**
 * Client-side membership representation.
 */
export interface ClientMembership {
  id: string;
  tenant: ClientTenant;
  role: string;
  joinedAt: string;
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
// LICENSING TYPES
// =============================================================================

/**
 * Subscription status values.
 */
export type SubscriptionStatusType = 'active' | 'canceled' | 'past_due' | 'unpaid' | 'paused' | 'trialing';

/**
 * Subscription summary for a tenant.
 */
export interface SubscriptionSummary {
  /** Subscription ID */
  id: string;
  /** Subscription status */
  status: SubscriptionStatusType;
  /** Plan name */
  planName: string;
  /** Current period start */
  currentPeriodStart: string;
  /** Current period end */
  currentPeriodEnd: string;
  /** Whether subscription auto-renews */
  autoRenew: boolean;
}

/**
 * License type definition.
 */
export interface LicenseType {
  /** License type ID */
  id: string;
  /** License type name */
  name: string;
  /** License type slug */
  slug: string;
  /** Description */
  description: string | null;
  /** Features enabled by this license */
  features: string[];
}

/**
 * License type status for availability checking.
 */
export interface LicenseTypeStatus {
  /** License type ID */
  id: string;
  /** License type name */
  name: string;
  /** License type slug */
  slug: string;
  /** Whether this license type is available */
  available: boolean;
  /** Current usage count */
  usedCount: number;
  /** Maximum allowed (null for unlimited) */
  maxAllowed: number | null;
}

/**
 * Member with their assigned licenses.
 */
export interface MemberWithLicenses {
  /** Membership ID */
  membershipId: string;
  /** User ID */
  userId: string;
  /** User email */
  email: string | null;
  /** User name */
  name: string | null;
  /** Membership status */
  status: MembershipStatusType;
  /** Assigned licenses */
  licenses: Array<{
    /** License assignment ID */
    assignmentId: string;
    /** License type ID */
    licenseTypeId: string;
    /** License type name */
    licenseTypeName: string;
    /** License type slug */
    licenseTypeSlug: string;
  }>;
}

/**
 * Tenant license overview.
 */
export interface TenantLicenseOverview {
  /** Tenant ID */
  tenantId: string;
  /** Tenant name */
  tenantName: string;
  /** Active subscription */
  subscription: SubscriptionSummary | null;
  /** Available license types */
  licenseTypes: LicenseTypeStatus[];
  /** Members with licenses */
  members: MemberWithLicenses[];
}

/**
 * Available license type for assignment.
 */
export interface AvailableLicenseType {
  /** License type ID */
  id: string;
  /** License type name */
  name: string;
  /** License type slug */
  slug: string;
  /** Description */
  description: string | null;
  /** Features enabled */
  features: string[];
  /** Whether this license is available for assignment */
  available: boolean;
  /** Current usage */
  usedCount: number;
  /** Maximum allowed */
  maxAllowed: number | null;
}

// =============================================================================
// API RESPONSE TYPES
// =============================================================================

/**
 * Paginated response wrapper.
 *
 * Standard pagination structure used for list endpoints.
 *
 * @typeParam T - The type of items in the list
 */
export interface PaginatedResponse<T> {
  /** Array of items for the current page */
  data: T[];
  /** Pagination metadata */
  meta: {
    /** Total number of items across all pages */
    total: number;
    /** Current page number (1-indexed) */
    page: number;
    /** Number of items per page */
    pageSize: number;
    /** Total number of pages */
    totalPages: number;
  };
}

/**
 * Standard API error response.
 *
 * Returned when an API request fails.
 */
export interface ApiError {
  /** HTTP status code */
  statusCode: number;
  /** Error message */
  message: string;
  /** Error code for programmatic handling */
  error?: string;
  /** Additional error details (validation errors, etc.) */
  details?: Record<string, unknown>;
  /** Request timestamp */
  timestamp?: string;
  /** Request path */
  path?: string;
}

/**
 * Standard API success response wrapper.
 *
 * Used for endpoints that need to wrap their response in a standard format.
 *
 * @typeParam T - The type of the response data
 */
export type ApiResponse<T> =
  | {
      /** Indicates successful response */
      success: true;
      /** Response data */
      data: T;
    }
  | {
      /** Indicates failed response */
      success: false;
      /** Error details */
      error: ApiError;
    };

// =============================================================================
// OAUTH TYPES
// =============================================================================

/**
 * OAuth configuration.
 */
export interface OAuthConfig {
  /** AuthVital server URL */
  authVitalHost: string;
  /** OAuth Client ID */
  clientId: string;
  /** OAuth Redirect URI */
  redirectUri: string;
  /** OAuth scopes */
  scope?: string;
}

/**
 * Authorization URL parameters.
 */
export interface AuthorizeUrlParams {
  /** AuthVital server URL */
  authVitalHost: string;
  /** OAuth Client ID */
  clientId: string;
  /** OAuth Redirect URI */
  redirectUri: string;
  /** OAuth state parameter (CSRF protection) */
  state: string;
  /** PKCE code challenge */
  codeChallenge: string;
  /** OAuth scopes */
  scope?: string;
  /** OIDC nonce */
  nonce?: string;
}

/**
 * Token exchange parameters.
 */
export interface TokenExchangeParams {
  /** AuthVital server URL */
  authVitalHost: string;
  /** OAuth Client ID */
  clientId: string;
  /** OAuth Client Secret (optional for public clients) */
  clientSecret?: string;
  /** Authorization code */
  code: string;
  /** PKCE code verifier */
  codeVerifier: string;
  /** OAuth Redirect URI */
  redirectUri: string;
}

/**
 * Refresh token parameters.
 */
export interface RefreshTokenParams {
  /** AuthVital server URL */
  authVitalHost: string;
  /** OAuth Client ID */
  clientId: string;
  /** OAuth Client Secret (optional for public clients) */
  clientSecret?: string;
  /** Refresh token */
  refreshToken: string;
}

/**
 * State payload for OAuth state parameter.
 */
export interface StatePayload {
  /** CSRF nonce */
  csrf: string;
  /** Optional app-specific state */
  appState?: string;
}

/**
 * Base options for building auth URLs.
 */
export interface AuthUrlOptions {
  /** AuthVital server URL (e.g., https://auth.myapp.com) */
  authVitalHost: string;
  /** OAuth client_id for your application */
  clientId: string;
  /** Optional: Where to redirect after auth completes */
  redirectUri?: string;
  /** Optional: Pre-fill the email field */
  email?: string;
}

/**
 * Options for building login URLs.
 */
export interface LoginUrlOptions extends AuthUrlOptions {
  /** Optional: Hint for which tenant to log into */
  tenantHint?: string;
}

/**
 * Options for building signup URLs.
 */
export interface SignupUrlOptions extends LoginUrlOptions {
  /** Optional: Invitation token (for accepting team invites) */
  inviteToken?: string;
}

/**
 * Options for logout URL.
 */
export interface LogoutUrlOptions {
  /** AuthVital server URL (e.g., https://auth.myapp.com) */
  authVitalHost: string;
  /** Optional: Where to redirect after logout completes */
  postLogoutRedirectUri?: string;
}

/**
 * Authorization flow result.
 */
export interface AuthorizationFlowResult {
  /** Authorization URL to redirect to */
  authorizeUrl: string;
  /** State parameter (for verification) */
  state: string;
  /** PKCE code verifier */
  codeVerifier: string;
  /** PKCE code challenge */
  codeChallenge: string;
}

// =============================================================================
// JWT VALIDATION TYPES
// =============================================================================

/**
 * JWT validator configuration.
 */
export interface JwtValidatorConfig {
  /** AuthVital IDP URL (e.g., "https://auth.example.com") */
  authVitalHost: string;
  /** Cache TTL in seconds (default: 3600 = 1 hour) */
  cacheTtl?: number;
  /** Expected audience (client_id) - optional but recommended */
  audience?: string;
  /** Expected issuer - defaults to authVitalHost */
  issuer?: string;
}

/**
 * Token validation result.
 */
export interface ValidateTokenResult {
  /** Whether the token is valid */
  valid: boolean;
  /** Decoded payload if valid */
  payload?: JwtPayload;
  /** Error message if invalid */
  error?: string;
}

/**
 * Current user result from authorization header.
 */
export interface GetCurrentUserResult {
  /** Whether the request is authenticated */
  authenticated: boolean;
  /** The decoded JWT payload if authenticated */
  user: JwtPayload | null;
  /** Error message if authentication failed */
  error?: string;
}

// =============================================================================
// SYNC EVENT TYPES
// =============================================================================

/**
 * Sync event types constant.
 */
export const SYNC_EVENT_TYPES = {
  // Invitations
  INVITE_CREATED: 'invite.created',
  INVITE_ACCEPTED: 'invite.accepted',
  INVITE_DELETED: 'invite.deleted',
  INVITE_EXPIRED: 'invite.expired',

  // Subjects (users, service accounts, etc.)
  SUBJECT_CREATED: 'subject.created',
  SUBJECT_UPDATED: 'subject.updated',
  SUBJECT_DELETED: 'subject.deleted',
  SUBJECT_DEACTIVATED: 'subject.deactivated',

  // Memberships (tenant membership)
  MEMBER_JOINED: 'member.joined',
  MEMBER_LEFT: 'member.left',
  MEMBER_ROLE_CHANGED: 'member.role_changed',
  MEMBER_SUSPENDED: 'member.suspended',
  MEMBER_ACTIVATED: 'member.activated',

  // App Access
  APP_ACCESS_GRANTED: 'app_access.granted',
  APP_ACCESS_REVOKED: 'app_access.revoked',
  APP_ACCESS_ROLE_CHANGED: 'app_access.role_changed',

  // Licenses
  LICENSE_ASSIGNED: 'license.assigned',
  LICENSE_REVOKED: 'license.revoked',
  LICENSE_CHANGED: 'license.changed',
} as const;

/**
 * Sync event type values.
 */
export type SyncEventType = (typeof SYNC_EVENT_TYPES)[keyof typeof SYNC_EVENT_TYPES];

/**
 * Base event structure for all sync events.
 */
export interface BaseSyncEvent<T extends SyncEventType, D> {
  /** Unique event ID */
  id: string;
  /** Event type */
  type: T;
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Tenant ID where event occurred */
  tenant_id: string;
  /** Application ID the event is relevant to */
  application_id: string;
  /** Event-specific data */
  data: D;
}

// =============================================================================
// DOMAIN TYPES
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

// =============================================================================
// UTILITY TYPES
// =============================================================================

/**
 * Nullable partial type helper.
 */
export type Nullable<T> = T | null;

/**
 * Deep partial type helper.
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};
