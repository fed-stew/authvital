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

// =============================================================================
// TYPES
// =============================================================================

export interface Membership {
  id: string;
  userId: string;
  tenantId: string;
  status: string;
  email?: string;
  givenName?: string;
  familyName?: string;
  roles?: Array<{ slug: string; name: string }>;
  tenantRoles?: Array<{ slug: string; name: string }>;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

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
   */
  async validateMembership(params: { userId: string; tenantId: string }): Promise<{ valid: boolean; membership?: Membership }> {
    return this.m2mGet('/api/integration/validate-membership', params);
  }

  /**
   * List all members of a tenant.
   */
  async listTenantMembers(params: {
    tenantId: string;
    status?: 'ACTIVE' | 'INVITED' | 'SUSPENDED';
    includeRoles?: boolean;
  }): Promise<{ memberships: Membership[] }> {
    return this.m2mGet('/api/integration/tenant-memberships', {
      tenantId: params.tenantId,
      status: params.status,
      includeRoles: params.includeRoles,
    });
  }

  /**
   * List all tenant memberships for a user (which tenants they belong to).
   * If userId is omitted, uses the user associated with the M2M token context.
   */
  async listUserMemberships(params: {
    userId?: string;
    tenantId?: string;
    clientId?: string;
    status?: 'ACTIVE' | 'INVITED' | 'SUSPENDED';
    includeRoles?: boolean;
  }): Promise<{ memberships: Membership[] }> {
    return this.m2mGet('/api/integration/application-memberships', {
      clientId: params.clientId || this.client.config.clientId,
      userId: params.userId,
      tenantId: params.tenantId,
      status: params.status,
      includeRoles: params.includeRoles,
    });
  }

  /**
   * Get user's tenants (lighter weight than full memberships).
   */
  async listUserTenants(params: { userId: string }): Promise<unknown> {
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
   */
  async setMemberRole(params: {
    membershipId: string;
    roleSlug: string;
    tenantId?: string;
  }): Promise<unknown> {
    return this.m2mPost('/api/integration/set-member-role', {
      membershipId: params.membershipId,
      roleSlug: params.roleSlug,
      tenantId: params.tenantId,
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
   * Check if a user has a specific feature enabled.
   */
  async checkFeature(params: {
    userId: string;
    tenantId: string;
    featureKey: string;
    applicationId?: string;
  }): Promise<{ allowed: boolean }> {
    return this.m2mGet('/api/integration/check-feature', params);
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
   */
  async sendInvitation(params: {
    tenantId: string;
    email: string;
    roleId?: string;
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
   */
  async revokeInvitation(params: { invitationId: string }): Promise<{ success: boolean }> {
    return this.m2mDelete(`/api/integration/invitation/${params.invitationId}`);
  }

  /**
   * Resend an invitation email.
   */
  async resendInvitation(params: { invitationId: string }): Promise<{ success: boolean }> {
    return this.m2mPost(`/api/integration/invitation/${params.invitationId}/resend`);
  }

  // ===========================================================================
  // LICENSING
  // ===========================================================================

  /**
   * Grant a license to a user.
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

  /**
   * Check a user's license for an application.
   */
  async checkLicense(params: {
    userId: string;
    tenantId: string;
    applicationId: string;
  }): Promise<{ hasLicense: boolean; licenseType?: string }> {
    return this.m2mGet('/api/integration/licenses/check', params);
  }

  /**
   * Check if a user has a specific feature via their license.
   */
  async checkLicenseFeature(params: {
    userId: string;
    tenantId: string;
    applicationId: string;
    featureKey: string;
  }): Promise<{ hasFeature: boolean }> {
    return this.m2mGet('/api/integration/licenses/feature', params);
  }

  /**
   * Get licensed users for an application.
   */
  async getAppLicensedUsers(params: {
    tenantId: string;
    applicationId: string;
  }): Promise<{ users: unknown[] }> {
    return this.m2mGet(`/api/integration/licenses/apps/${params.applicationId}/users`, {
      tenantId: params.tenantId,
    });
  }

  /**
   * Count licensed users for an application.
   */
  async countLicensedUsers(params: {
    tenantId: string;
    applicationId: string;
  }): Promise<{ count: number }> {
    return this.m2mGet(`/api/integration/licenses/apps/${params.applicationId}/count`, {
      tenantId: params.tenantId,
    });
  }

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
