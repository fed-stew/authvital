/**
 * Authentication & Authorization Type Definitions
 *
 * These types define the core authentication entities and JWT token structure
 * used throughout the AuthVital platform.
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
 * Alias for User - used in SDK context.
 */
export type AuthVitalUser = User;

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
 *
 * @example
 * ```ts
 * // Minimal payload (always present)
 * const payload: EnhancedJwtPayload = {
 *   sub: 'user_123',
 *   aud: 'client_456',
 *   iss: 'https://auth.example.com',
 *   iat: 1699900000,
 *   exp: 1699903600,
 * };
 *
 * // Full payload with tenant context and license
 * const fullPayload: EnhancedJwtPayload = {
 *   ...payload,
 *   email: 'alice@example.com',
 *   email_verified: true,
 *   name: 'Alice Smith',
 *   tenant_id: 'tenant_789',
 *   tenant_subdomain: 'acme',
 *   tenant_roles: ['admin'],
 *   license: {
 *     type: 'pro',
 *     name: 'Professional',
 *     features: ['advancedReporting', 'apiAccess'],
 *   },
 * };
 * ```
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
