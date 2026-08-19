/**
 * @authvital/server - Integration API Client
 *
 * Server-to-server integration API for managing tenants, memberships,
 * roles, licenses, permissions, and invitations.
 *
 * All methods use M2M authentication (Client Credentials Grant).
 * These map to AuthVital's /api/integration/* endpoints.
 */

import type { ServerClient } from './server-client.js';
import type {
  ApplicationMembershipsResponse,
  TenantMembershipsResponse,
  UserTenantsResponse,
} from '@authvital/shared';

// =============================================================================
// TYPES
// =============================================================================

// Membership wire shapes are shared with the backend - single source of truth.
// These replace the old (inaccurate) flat `Membership` interface: the API
// actually returns NESTED records with `user`, `tenant`, and `roles` objects.
export type {
  ApplicationMembership,
  ApplicationMembershipsResponse,
  MembershipRole,
  MembershipTenant,
  MembershipUser,
  TenantMembership,
  TenantMembershipsResponse,
  UserTenantMembership,
  UserTenantsResponse,
} from '@authvital/shared';

export interface ApplicationRole {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
}

export interface ApplicationRolesResult {
  applicationId: string;
  applicationName: string;
  clientId: string;
  roles: ApplicationRole[];
}

export interface TenantRole {
  slug: string;
  name: string;
  description?: string;
  isDefault?: boolean;
}

export interface Invitation {
  id: string;
  email: string;
  status: string;
  roleId?: string;
  expiresAt?: string;
  createdAt?: string;
  [key: string]: unknown;
}

export interface LicenseHolder {
  userId: string;
  email?: string;
  givenName?: string;
  familyName?: string;
  licenseType: string;
  grantedAt?: string;
  [key: string]: unknown;
}

export interface UserLicense {
  id: string;
  applicationId: string;
  licenseTypeId: string;
  licenseTypeName?: string;
  grantedAt?: string;
  [key: string]: unknown;
}

export interface LicenseUsageOverview {
  totalSeats: number;
  usedSeats: number;
  availableSeats: number;
  applications: Array<{
    applicationId: string;
    applicationName: string;
    totalSeats: number;
    usedSeats: number;
  }>;
  [key: string]: unknown;
}

export interface SeatCheckResult {
  allowed: boolean;
  currentUsage?: number;
  limit?: number;
  reason?: string;
  wouldTriggerOverage?: boolean;
  overagePriceId?: string | null;
}

export interface PermissionCheckResult {
  allowed: boolean;
  permission: string;
}

export interface BulkPermissionCheckResult {
  results: Record<string, boolean>;
  allAllowed: boolean;
}

// =============================================================================
// INTEGRATION CLIENT
// =============================================================================

/**
 * Integration API client for server-to-server operations.
 *
 * Uses M2M (Client Credentials) authentication automatically.
 * All methods handle token acquisition transparently.
 *
 * @example
 * ```typescript
 * const client = createServerClient({ ... });
 *
 * // List tenant memberships
 * const members = await client.integration.listTenantMembers({ tenantId: '...' });
 *
 * // Check permissions
 * const result = await client.integration.checkPermission({
 *   userId: '...', tenantId: '...', permission: 'projects:create'
 * });
 * ```
 */
export class IntegrationClient {
  constructor(private readonly client: ServerClient) {}

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  /**
   * Make an M2M-authenticated GET request to the integration API.
   */
  private async m2mGet<T>(path: string, query?: Record<string, string | number | boolean | undefined>): Promise<T> {
    const token = await this.client.getClientCredentialsToken();
    if (!token) {
      throw new Error('Failed to obtain M2M token');
    }

    const url = this.buildUrl(path, query);
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: `HTTP ${response.status}` }));
      throw new Error(`Integration API error: ${(error as any).message || response.status}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Make an M2M-authenticated POST request to the integration API.
   */
  private async m2mPost<T>(path: string, body?: unknown, query?: Record<string, string | number | boolean | undefined>): Promise<T> {
    const token = await this.client.getClientCredentialsToken();
    if (!token) {
      throw new Error('Failed to obtain M2M token');
    }

    const url = this.buildUrl(path, query);
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: `HTTP ${response.status}` }));
      throw new Error(`Integration API error: ${(error as any).message || response.status}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Make an M2M-authenticated DELETE request to the integration API.
   */
  private async m2mDelete<T>(path: string, query?: Record<string, string | number | boolean | undefined>): Promise<T> {
    const token = await this.client.getClientCredentialsToken();
    if (!token) {
      throw new Error('Failed to obtain M2M token');
    }

    const url = this.buildUrl(path, query);
    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: `HTTP ${response.status}` }));
      throw new Error(`Integration API error: ${(error as any).message || response.status}`);
    }

    // DELETE might return 204 No Content
    const text = await response.text();
    return text ? JSON.parse(text) : ({} as T);
  }

  private buildUrl(path: string, query?: Record<string, string | number | boolean | undefined>): string {
    const base = this.client.config.authVitalHost;
    const url = new URL(path.startsWith('/') ? path : `/${path}`, base);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      }
    }
    return url.toString();
  }

  // ===========================================================================
  // MEMBERSHIPS
  // ===========================================================================

  /**
   * Validate that a user is a member of a tenant.
   *
   * Maps to `GET /api/integration/validate-membership`. The backend returns
   * `{ isMember, membership }` (a minimal membership record, or null when the
   * user has no membership at all) - return type corrected (was the
   * non-existent `{ valid, membership? }` with a flat Membership shape).
   */
  async validateMembership(params: { userId: string; tenantId: string }): Promise<{
    isMember: boolean;
    membership: { id: string; status: string; joinedAt: string | null } | null;
  }> {
    return this.m2mGet('/api/integration/validate-membership', params);
  }

  /**
   * List all members of a tenant.
   *
   * Maps to `GET /api/integration/tenant-memberships`. Each membership is a
   * nested record with `user` and `roles` (app roles, including
   * `applicationId`/`applicationName`).
   */
  async listTenantMembers(params: {
    tenantId: string;
    status?: 'ACTIVE' | 'INVITED' | 'SUSPENDED';
    includeRoles?: boolean;
  }): Promise<TenantMembershipsResponse> {
    return this.m2mGet('/api/integration/tenant-memberships', {
      tenantId: params.tenantId,
      status: params.status,
      includeRoles: params.includeRoles,
    });
  }

  /**
   * List memberships that hold roles for an APPLICATION (identified by
   * clientId, defaulting to this SDK's configured clientId).
   *
   * Maps to `GET /api/integration/application-memberships`. Each membership is
   * a nested record with `user`, `tenant`, and `roles` (only the roles
   * belonging to the queried application).
   *
   * Filtering semantics (all filters applied server-side):
   * - `userId` omitted -> memberships for ALL users with roles on the app.
   *   (Client-credentials tokens have no user, so there is no "token user"
   *   fallback - omitting userId is the "everyone on my app" query.)
   * - `userId` provided -> only that user's memberships.
   * - `tenantId` / `status` narrow further.
   */
  async listUserMemberships(params: {
    userId?: string;
    tenantId?: string;
    clientId?: string;
    status?: 'ACTIVE' | 'INVITED' | 'SUSPENDED';
    includeRoles?: boolean;
  }): Promise<ApplicationMembershipsResponse> {
    return this.m2mGet('/api/integration/application-memberships', {
      clientId: params.clientId || this.client.config.clientId,
      userId: params.userId,
      tenantId: params.tenantId,
      status: params.status,
      includeRoles: params.includeRoles,
    });
  }

  /**
   * Get user's tenants (which tenants a user belongs to).
   *
   * Maps to `GET /api/integration/user-tenants`. Each membership is a nested
   * record with `tenant` and `roles` (app roles, including
   * `applicationId`/`applicationName`).
   */
  async listUserTenants(params: { userId: string }): Promise<UserTenantsResponse> {
    return this.m2mGet('/api/integration/user-tenants', params);
  }

  // ===========================================================================
  // ROLES
  // ===========================================================================

  /**
   * Get application roles by client ID.
   */
  async getApplicationRoles(params: {
    clientId: string;
    tenantId?: string;
  }): Promise<ApplicationRolesResult> {
    return this.m2mGet(`/api/integration/roles/${params.clientId}`, {
      tenantId: params.tenantId,
    });
  }

  /**
   * Get tenant roles.
   */
  async getTenantRoles(params?: { tenantId?: string }): Promise<{ roles: TenantRole[] }> {
    return this.m2mGet('/api/integration/tenant-roles', params);
  }

  /**
   * Set a member's role.
   *
   * Maps to `POST /api/integration/set-member-role` (M2MAuthGuard). The
   * controller requires the body fields `{ membershipId, roleId, applicationId }`
   * (all three, else it 400s), so this method sends exactly those. Previously
   * it sent `roleSlug`/`tenantId`, which the controller ignores - every call
   * 400'd on the missing `roleId`/`applicationId`.
   *
   * ⚠️ KNOWN BACKEND WIRING BUG (Phase 4 follow-up, backend not touched here):
   * the controller forwards the body positionally to
   * `rolesService.setMemberRole(membershipId, roleId, applicationId)`, but the
   * service signature is `(membershipId, roleSlug, callerUserId)`. So today the
   * service looks up the role by **slug** using the value we pass as `roleId`,
   * and treats `applicationId` as the **caller's userId** for the role-hierarchy
   * check. Until the backend is fixed, callers must effectively pass a role
   * *slug* in `roleId` and an acting *userId* in `applicationId` for the call to
   * succeed. This method matches the documented controller contract; the
   * backend positional mismatch is flagged for Phase 4.
   */
  async setMemberRole(params: {
    membershipId: string;
    roleId: string;
    applicationId: string;
  }): Promise<{
    success: boolean;
    message: string;
    role: { id: string; name: string; slug: string };
  }> {
    return this.m2mPost('/api/integration/set-member-role', {
      membershipId: params.membershipId,
      roleId: params.roleId,
      applicationId: params.applicationId,
    });
  }

  // ===========================================================================
  // PERMISSIONS
  // ===========================================================================

  /**
   * Check a single permission for a user in a tenant.
   */
  async checkPermission(params: {
    userId: string;
    tenantId: string;
    permission: string;
    applicationId?: string;
  }): Promise<PermissionCheckResult> {
    return this.m2mPost('/api/integration/check-permission', params);
  }

  /**
   * Check multiple permissions at once.
   */
  async checkPermissions(params: {
    userId: string;
    tenantId: string;
    permissions: string[];
    applicationId?: string;
  }): Promise<BulkPermissionCheckResult> {
    return this.m2mPost('/api/integration/check-permissions', params);
  }

  /**
   * Get all permissions for a user.
   */
  async getUserPermissions(params: {
    userId: string;
    tenantId: string;
  }): Promise<{ permissions: string[] }> {
    return this.m2mGet('/api/integration/user-permissions', params);
  }

  /**
   * Check whether a TENANT has access to a feature (tenant-level entitlement).
   *
   * Maps to the M2M endpoint `GET /api/integration/check-feature`, which reads
   * `tenantId` + `feature` (+ optional `applicationId`) from the query.
   *
   * This is a tenant-wide entitlement check, NOT per-user, so no `userId` is
   * sent (the endpoint does not accept one). Previously this method sent
   * `featureKey`/`userId` - the backend reads neither, so the required `feature`
   * check failed and every call 400'd. Return shape also corrected to match the
   * controller (`hasAccess`, not `allowed`).
   */
  async checkFeature(params: {
    tenantId: string;
    feature: string;
    applicationId?: string;
  }): Promise<{ hasAccess: boolean; licenseType: string | null; reason?: string }> {
    return this.m2mGet('/api/integration/check-feature', {
      tenantId: params.tenantId,
      feature: params.feature,
      applicationId: params.applicationId,
    });
  }

  /**
   * Check seat availability (can a new member be added?).
   */
  async checkSeats(params: {
    tenantId: string;
    applicationId?: string;
  }): Promise<SeatCheckResult> {
    return this.m2mGet('/api/integration/check-seats', params);
  }

  /**
   * Get subscription status for a tenant.
   */
  async getSubscriptionStatus(params: {
    tenantId: string;
    applicationId?: string;
  }): Promise<unknown> {
    return this.m2mGet('/api/integration/subscription-status', params);
  }

  // ===========================================================================
  // INVITATIONS
  // ===========================================================================

  /**
   * Send an invitation to join a tenant.
   *
   * Maps to `POST /api/integration/invite` (M2MAuthGuard). The invitation
   * SERVICE consumes `{ email, tenantId, roleId, expiresInDays?, clientId?,
   * givenName?, familyName? }` and REQUIRES a singular `roleId` (a TenantRole
   * id - it 400s without one). This method therefore sends `roleId` (singular),
   * which is what actually reaches the service.
   *
   * ⚠️ NOTE (Phase 4 backend cleanup): the controller's inline body *type*
   * advertises `{ tenantId, email, roleIds?: string[], applicationId?,
   * invitedById? }`, but that annotation has no runtime effect (it is a plain
   * TS type, not a validated class DTO), so the raw body is forwarded verbatim
   * to the service which reads `roleId`/`clientId`. Matching the service (the
   * real runtime contract) is what makes the call succeed; the controller
   * type/service drift is flagged for a backend fix.
   */
  async sendInvitation(params: {
    tenantId: string;
    email: string;
    roleId: string;
    clientId?: string;
    expiresInDays?: number;
    givenName?: string;
    familyName?: string;
  }): Promise<{ sub: string; expiresAt: string }> {
    return this.m2mPost('/api/integration/invite', params);
  }

  /**
   * List pending invitations for a tenant.
   */
  async listInvitations(params: { tenantId: string }): Promise<{ invitations: Invitation[] }> {
    return this.m2mGet('/api/integration/invitations', params);
  }

  /**
   * Delete/revoke an invitation.
   *
   * Maps to `DELETE /api/integration/invitation/:invitationId` (M2MAuthGuard).
   * The service returns `{ success, message }` - return type corrected (was
   * `{ success }`).
   */
  async revokeInvitation(params: { invitationId: string }): Promise<{ success: boolean; message: string }> {
    return this.m2mDelete(`/api/integration/invitation/${params.invitationId}`);
  }

  /**
   * Resend an invitation email.
   *
   * Maps to `POST /api/integration/invitation/:invitationId/resend`
   * (M2MAuthGuard). The service returns only `{ expiresAt }` (a fresh token is
   * generated server-side, never returned) - return type corrected (was the
   * non-existent `{ success }`).
   */
  async resendInvitation(params: { invitationId: string }): Promise<{ expiresAt: string }> {
    return this.m2mPost(`/api/integration/invitation/${params.invitationId}/resend`);
  }

  // ===========================================================================
  // LICENSING
  // ===========================================================================

  /**
   * Grant a license to a user.
   *
   * Verified against `POST /api/integration/grant-license` (M2MAuthGuard):
   * body `{ userId, tenantId, applicationId, licenseTypeId }` - all required.
   */
  async grantLicense(params: {
    userId: string;
    tenantId: string;
    applicationId: string;
    licenseTypeId: string;
  }): Promise<unknown> {
    return this.m2mPost('/api/integration/grant-license', params);
  }

  /**
   * Revoke a license from a user.
   *
   * Verified against `POST /api/integration/revoke-license` (M2MAuthGuard):
   * body `{ userId, tenantId, applicationId }` - all required.
   */
  async revokeLicense(params: {
    userId: string;
    tenantId: string;
    applicationId: string;
  }): Promise<unknown> {
    return this.m2mPost('/api/integration/revoke-license', params);
  }

  /**
   * Change a user's license type.
   *
   * Verified against `POST /api/integration/change-license-type`
   * (M2MAuthGuard): body `{ userId, tenantId, applicationId, newLicenseTypeId }`.
   */
  async changeLicenseType(params: {
    userId: string;
    tenantId: string;
    applicationId: string;
    newLicenseTypeId: string;
  }): Promise<unknown> {
    return this.m2mPost('/api/integration/change-license-type', params);
  }

  /**
   * Get all licenses for a user.
   */
  async getUserLicenses(params: {
    userId: string;
    tenantId: string;
  }): Promise<{ licenses: UserLicense[] }> {
    return this.m2mGet('/api/integration/user-licenses', params);
  }

  /**
   * Get all license holders for an application.
   */
  async getLicenseHolders(params: {
    tenantId: string;
    applicationId: string;
  }): Promise<{ holders: LicenseHolder[] }> {
    return this.m2mGet('/api/integration/license-holders', params);
  }

  /**
   * Get license usage overview for a tenant.
   */
  async getUsageOverview(params: {
    tenantId: string;
  }): Promise<LicenseUsageOverview> {
    return this.m2mGet('/api/integration/usage-overview', params);
  }

  // NOTE: The per-user entitlement READS (checkLicense, checkLicenseFeature,
  // getAppLicensedUsers, countLicensedUsers) used to live here but were broken
  // over M2M: their endpoints (`/api/integration/licenses/*`) are guarded by
  // `JwtAuthGuard + TenantPermissionGuard(licenses:view)` and derive `tenantId`
  // from the USER JWT (`@JwtTenantId`), so an M2M client-credentials token is
  // rejected. They have been rehomed to `ServerClient` (see checkLicense /
  // checkLicenseFeature / getAppLicensedUsers / countLicensedUsers there),
  // which sends the end user's access token. There is one correct home.

  // ===========================================================================
  // MFA
  // ===========================================================================

  /**
   * Get MFA status for a user.
   */
  async getUserMfaStatus(params: {
    userId: string;
  }): Promise<{ enabled: boolean; methods?: string[] }> {
    return this.m2mGet('/api/integration/user-mfa-status', params);
  }
}
