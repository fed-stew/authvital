/**
 * @authvader/sdk - Unified Server SDK
 *
 * Single entry point for all server-side AuthVader operations.
 * Configure once, use everywhere.
 *
 * @example
 * ```ts
 * import { createAuthVader } from '@authvader/sdk/server';
 *
 * const authvader = createAuthVader({
 *   authVaderHost: process.env.AV_HOST,
 *   clientId: process.env.AV_CLIENT_ID,
 *   clientSecret: process.env.AV_CLIENT_SECRET,
 * });
 *
 * // Validate JWT from incoming request (uses cached JWKS, no IDP call)
 * const { user } = await authvader.getCurrentUser(request);
 *
 * // Machine-to-machine calls (uses client_credentials automatically)
 * const members = await authvader.memberships.listForTenant('tenant-123');
 *
 * // Get user's tenants with login URIs ready for OAuth redirect
 * // The appendClientId option automatically adds ?client_id=... to each initiateLoginUri
 * const tenants = await authvader.memberships.listTenantsForUser(userId, {
 *   appendClientId: true, // Uses clientId from SDK config
 * });
 * // Result: tenant.initiateLoginUri = "https://acme.app.com/login?client_id=your-client-id"
 * ```
 */

import {
  BaseClient,
  type AuthVaderConfig,
  type GetCurrentUserResult,
  type ValidatedClaims,
  type RequestLike,
} from './base-client';
import {
  createInvitationsNamespace,
  createMembershipsNamespace,
  createPermissionsNamespace,
  createEntitlementsNamespace,
  createLicensesNamespace,
  createSessionsNamespace,
} from './namespaces';

// Re-export types from base-client for backwards compatibility
export type { AuthVaderConfig, GetCurrentUserResult, ValidatedClaims, RequestLike };

// =============================================================================
// AUTHVADER CLIENT
// =============================================================================

/**
 * Main AuthVader SDK client.
 *
 * Extends BaseClient with namespaced APIs for:
 * - Invitations (send, list, resend, revoke)
 * - Memberships (list, validate, roles)
 * - Permissions (check, list)
 * - Entitlements (quotas, features)
 * - Licenses (grant, revoke, check)
 * - Sessions (list, revoke, logout)
 */
export class AuthVader extends BaseClient {
  // ===========================================================================
  // NAMESPACED APIS
  // ===========================================================================

  readonly invitations = createInvitationsNamespace(this);
  readonly memberships = createMembershipsNamespace(this);
  readonly permissions = createPermissionsNamespace(this);
  readonly entitlements = createEntitlementsNamespace(this);
  readonly licenses = createLicensesNamespace(this);
  readonly sessions = createSessionsNamespace(this);

  // ===========================================================================
  // PERMISSION HELPERS (Read from JWT - No API call!)
  // ===========================================================================

  /**
   * Check tenant permission from JWT (no API call)
   * Returns true if user has the specified tenant permission.
   *
   * Reads from the `tenant_permissions` claim in the JWT.
   * Wildcards are supported (e.g., `licenses:*` matches `licenses:manage`).
   *
   * @example
   * ```ts
   * if (await authvader.hasTenantPermission(req, 'licenses:manage')) {
   *   // User can manage licenses - show admin UI
   * }
   * ```
   */
  async hasTenantPermission(request: RequestLike, permission: string): Promise<boolean> {
    const { user } = await this.getCurrentUser(request);
    if (!user) return false;
    return this.jwtValidator.hasTenantPermission(user, permission);
  }

  /**
   * Check app permission from JWT (no API call)
   * Returns true if user has the specified app permission.
   *
   * Reads from the `app_permissions` claim in the JWT.
   *
   * @example
   * ```ts
   * if (await authvader.hasAppPermission(req, 'projects:create')) {
   *   // User can create projects
   * }
   * ```
   */
  async hasAppPermission(request: RequestLike, permission: string): Promise<boolean> {
    const { user } = await this.getCurrentUser(request);
    if (!user) return false;
    return this.jwtValidator.hasAppPermission(user, permission);
  }

  /**
   * Check feature from JWT license claim (no API call)
   * Returns true if the feature is enabled in the user's license.
   *
   * Reads from the `license.features` array in the JWT.
   *
   * @example
   * ```ts
   * if (await authvader.hasFeatureFromJwt(req, 'sso')) {
   *   // User's tenant has SSO enabled
   * }
   * ```
   */
  async hasFeatureFromJwt(request: RequestLike, featureKey: string): Promise<boolean> {
    const { user } = await this.getCurrentUser(request);
    if (!user) return false;
    return this.jwtValidator.hasFeature(user, featureKey);
  }

  /**
   * Get license type from JWT (no API call)
   * Returns the license type slug (e.g., 'pro', 'enterprise') or null.
   *
   * Reads from the `license.type` claim in the JWT.
   *
   * @example
   * ```ts
   * const licenseType = await authvader.getLicenseTypeFromJwt(req);
   * if (licenseType === 'enterprise') {
   *   // Show enterprise features
   * }
   * ```
   */
  async getLicenseTypeFromJwt(request: RequestLike): Promise<string | null> {
    const { user } = await this.getCurrentUser(request);
    if (!user) return null;
    return this.jwtValidator.getLicenseType(user);
  }

  /**
   * Get all tenant permissions from JWT (no API call)
   * Returns the array of tenant permissions granted to the user.
   *
   * @example
   * ```ts
   * const permissions = await authvader.getTenantPermissions(req);
   * console.log(permissions); // ['licenses:view', 'members:invite', ...]
   * ```
   */
  async getTenantPermissions(request: RequestLike): Promise<string[]> {
    const { user } = await this.getCurrentUser(request);
    return (user?.tenant_permissions as string[]) ?? [];
  }

  /**
   * Get all app permissions from JWT (no API call)
   * Returns the array of app permissions granted to the user.
   *
   * @example
   * ```ts
   * const permissions = await authvader.getAppPermissions(req);
   * console.log(permissions); // ['projects:create', 'datasets:read', ...]
   * ```
   */
  async getAppPermissions(request: RequestLike): Promise<string[]> {
    const { user } = await this.getCurrentUser(request);
    return (user?.app_permissions as string[]) ?? [];
  }

  /**
   * Get all tenant roles from JWT (no API call)
   * Returns the array of tenant role slugs for the user.
   *
   * @example
   * ```ts
   * const roles = await authvader.getTenantRoles(req);
   * console.log(roles); // ['owner', 'admin']
   * ```
   */
  async getTenantRoles(request: RequestLike): Promise<string[]> {
    const { user } = await this.getCurrentUser(request);
    return (user?.tenant_roles as string[]) ?? [];
  }

  /**
   * Get all app roles from JWT (no API call)
   * Returns the array of app role slugs for the user.
   *
   * @example
   * ```ts
   * const roles = await authvader.getAppRoles(req);
   * console.log(roles); // ['editor', 'viewer']
   * ```
   */
  async getAppRoles(request: RequestLike): Promise<string[]> {
    const { user } = await this.getCurrentUser(request);
    return (user?.app_roles as string[]) ?? [];
  }

  // ===========================================================================
  // MANAGEMENT URLs (extract tenantId from JWT)
  // ===========================================================================

  /**
   * Get URL for tenant members management page
   * Extracts tenantId from the request JWT
   */
  async getMembersUrl(req: RequestLike): Promise<string> {
    const { tenantId } = await this.validateRequest(req);
    return `${this.config.authVaderHost}/tenant/${tenantId}/members`;
  }

  /**
   * Get URL for tenant applications management page
   * Extracts tenantId from the request JWT
   */
  async getApplicationsUrl(req: RequestLike): Promise<string> {
    const { tenantId } = await this.validateRequest(req);
    return `${this.config.authVaderHost}/tenant/${tenantId}/applications`;
  }

  /**
   * Get URL for tenant settings page
   * Extracts tenantId from the request JWT
   */
  async getSettingsUrl(req: RequestLike): Promise<string> {
    const { tenantId } = await this.validateRequest(req);
    return `${this.config.authVaderHost}/tenant/${tenantId}/settings`;
  }

  /**
   * Get URL for tenant overview page
   * Extracts tenantId from the request JWT
   */
  async getOverviewUrl(req: RequestLike): Promise<string> {
    const { tenantId } = await this.validateRequest(req);
    return `${this.config.authVaderHost}/tenant/${tenantId}/overview`;
  }

  /**
   * Get URL for user account settings page
   * (Does not require tenantId)
   */
  getAccountSettingsUrl(): string {
    return `${this.config.authVaderHost}/account/settings`;
  }

  /**
   * Get all management URLs at once
   * Extracts tenantId from the request JWT
   *
   * @example
   * ```typescript
   * const urls = await authvader.getManagementUrls(req);
   * res.json({ urls });
   * // {
   * //   overview: 'https://auth.example.com/tenant/abc/overview',
   * //   members: 'https://auth.example.com/tenant/abc/members',
   * //   applications: 'https://auth.example.com/tenant/abc/applications',
   * //   settings: 'https://auth.example.com/tenant/abc/settings',
   * //   accountSettings: 'https://auth.example.com/account/settings',
   * // }
   * ```
   */
  async getManagementUrls(req: RequestLike): Promise<{
    overview: string;
    members: string;
    applications: string;
    settings: string;
    accountSettings: string;
  }> {
    const { tenantId } = await this.validateRequest(req);
    const base = this.config.authVaderHost;
    return {
      overview: `${base}/tenant/${tenantId}/overview`,
      members: `${base}/tenant/${tenantId}/members`,
      applications: `${base}/tenant/${tenantId}/applications`,
      settings: `${base}/tenant/${tenantId}/settings`,
      accountSettings: `${base}/account/settings`,
    };
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create an AuthVader client instance.
 *
 * Configure once at startup, use everywhere.
 *
 * @example
 * ```ts
 * // lib/authvader.ts
 * import { createAuthVader } from '@authvader/sdk/server';
 *
 * export const authvader = createAuthVader({
 *   authVaderHost: process.env.AV_HOST!,
 *   clientId: process.env.AV_CLIENT_ID!,
 *   clientSecret: process.env.AV_CLIENT_SECRET!,
 * });
 *
 * // Then use it anywhere:
 * import { authvader } from '@/lib/authvader';
 *
 * // Validate JWT from request (uses cached JWKS, no IDP auth needed)
 * const { user } = await authvader.getCurrentUser(request);
 *
 * // M2M calls (uses client_credentials automatically)
 * const members = await authvader.memberships.listForTenant('tenant-123');
 * ```
 */
export function createAuthVader(config: AuthVaderConfig): AuthVader {
  return new AuthVader(config);
}
