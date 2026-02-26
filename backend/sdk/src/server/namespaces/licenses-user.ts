/**
 * @authvader/sdk - User License Operations
 *
 * User-scoped license operations that use JWT authentication.
 * For M2M admin operations, see licenses-admin.ts
 */

import type { BaseClient, RequestLike } from '../base-client';
import type {
  LicenseGrantResponse,
  LicenseRevokeResponse,
  LicenseCheckResponse,
  LicenseFeatureResponse,
  LicensedUser,
  LicenseHolder,
  LicenseAuditLogResponse,
  UsageOverviewResponse,
  UsageTrendEntry,
  UserLicenseListItem,
} from './licenses-types';

/**
 * Creates user-scoped license operations.
 *
 * @param client - The base client instance for making authenticated requests
 * @returns Object containing user-scoped license methods
 */
export function createUserLicenseOperations(client: BaseClient) {
  return {
    /**
     * Grant a license to a user
     *
     * @param request - The incoming HTTP request
     * @param options - License grant options
     *
     * @example
     * ```ts
     * // Grant pro license to a team member
     * await authvader.licenses.grant(req, {
     *   userId: 'user-123',
     *   applicationId: 'app-456',
     *   licenseTypeId: 'license-pro',
     * });
     * ```
     */
    grant: async (
      request: RequestLike,
      options: {
        userId?: string;
        applicationId: string;
        licenseTypeId: string;
      },
    ): Promise<LicenseGrantResponse> => {
      const claims = await client.validateRequest(request);
      return client.request('POST', '/api/integration/licenses/grant', {
        tenantId: claims.tenantId,
        userId: options.userId || claims.sub,
        applicationId: options.applicationId,
        licenseTypeId: options.licenseTypeId,
      });
    },

    /**
     * Revoke a license from a user
     *
     * @param request - The incoming HTTP request
     * @param options - License revoke options
     *
     * @example
     * ```ts
     * await authvader.licenses.revoke(req, {
     *   userId: 'user-123',
     *   applicationId: 'app-456',
     * });
     * ```
     */
    revoke: async (
      request: RequestLike,
      options: {
        userId?: string;
        applicationId: string;
      },
    ): Promise<LicenseRevokeResponse> => {
      const claims = await client.validateRequest(request);
      return client.request('POST', '/api/integration/licenses/revoke', {
        tenantId: claims.tenantId,
        userId: options.userId || claims.sub,
        applicationId: options.applicationId,
      });
    },

    /**
     * Change a user's license type
     *
     * @param request - The incoming HTTP request
     * @param options - License change options
     *
     * @example
     * ```ts
     * // Upgrade user from basic to pro
     * await authvader.licenses.changeType(req, {
     *   userId: 'user-123',
     *   applicationId: 'app-456',
     *   newLicenseTypeId: 'license-pro',
     * });
     * ```
     */
    changeType: async (
      request: RequestLike,
      options: {
        userId?: string;
        applicationId: string;
        newLicenseTypeId: string;
      },
    ): Promise<LicenseRevokeResponse> => {
      const claims = await client.validateRequest(request);
      return client.request('POST', '/api/integration/licenses/change-type', {
        tenantId: claims.tenantId,
        userId: options.userId || claims.sub,
        applicationId: options.applicationId,
        newLicenseTypeId: options.newLicenseTypeId,
      });
    },

    /**
     * Get all licenses for a user
     *
     * @param request - The incoming HTTP request
     * @param userId - User ID (optional, defaults to authenticated user)
     *
     * @returns List of license assignments with license type details
     *
     * @example
     * ```ts
     * const licenses = await authvader.licenses.listForUser(req);
     * // [{ id: 'assignment-1', licenseType: 'pro', applicationId: 'app-1', ... }]
     * ```
     */
    listForUser: async (request: RequestLike, userId?: string): Promise<UserLicenseListItem[]> => {
      const claims = await client.validateRequest(request);
      return client.request(
        'GET',
        `/api/integration/licenses/tenants/${claims.tenantId}/users/${userId || claims.sub}`,
      );
    },

    /**
     * Check if a user has a license (uses tenant from JWT)
     *
     * This endpoint validates the JWT and checks if the user
     * (or specified user) has a valid license for the application.
     *
     * @param request - The incoming HTTP request with JWT
     * @param userId - User to check (or omit to check authenticated user)
     * @param applicationId - Application to check
     *
     * @returns License check result with hasLicense flag and license details
     *
     * @example
     * ```ts
     * const result = await authvader.licenses.check(req, undefined, 'my-app-id');
     * if (result.hasLicense) {
     *   console.log('User has', result.licenseType, 'license');
     * }
     * ```
     */
    check: async (
      request: RequestLike,
      userId: string | undefined,
      applicationId: string,
    ): Promise<LicenseCheckResponse> => {
      await client.getCurrentUser(request); // Validates JWT

      const params = new URLSearchParams();
      if (userId) params.set('userId', userId);
      params.set('applicationId', applicationId);

      return client.authenticatedRequest(
        request,
        'GET',
        `/api/integration/licenses/check?${params.toString()}`,
      );
    },

    /**
     * Check if user has a specific feature enabled
     *
     * This validates the JWT and checks if the user's license
     * includes the specified feature.
     *
     * @param request - The incoming HTTP request with JWT
     * @param userId - User to check (or omit to check authenticated user)
     * @param applicationId - Application to check
     * @param featureKey - Feature to check (e.g., 'sso', 'audit_logs')
     *
     * @returns Result with hasFeature boolean
     *
     * @example
     * ```ts
     * const { hasFeature } = await authvader.licenses.hasFeature(req, undefined, 'my-app-id', 'sso');
     * if (hasFeature) {
     *   // Show SSO option
     * }
     * ```
     */
    hasFeature: async (
      request: RequestLike,
      userId: string | undefined,
      applicationId: string,
      featureKey: string,
    ): Promise<LicenseFeatureResponse> => {
      await client.getCurrentUser(request);

      const params = new URLSearchParams();
      if (userId) params.set('userId', userId);
      params.set('applicationId', applicationId);
      params.set('featureKey', featureKey);

      return client.authenticatedRequest<LicenseFeatureResponse>(
        request,
        'GET',
        `/api/integration/licenses/feature?${params.toString()}`,
      );
    },

    /**
     * Get all licensed users for an app in the authenticated tenant
     *
     * Returns all users with valid licenses for the specified application.
     * The tenant is extracted from the JWT.
     *
     * @param request - The incoming HTTP request with JWT
     * @param applicationId - Application ID
     *
     * @returns List of licensed users with license details
     *
     * @example
     * ```ts
     * const users = await authvader.licenses.getAppLicensedUsers(req, 'my-app-id');
     * users.forEach(u => console.log(u.email, '-', u.licenseType));
     * ```
     */
    getAppLicensedUsers: async (
      request: RequestLike,
      applicationId: string,
    ): Promise<LicensedUser[]> => {
      await client.getCurrentUser(request);

      return client.authenticatedRequest(
        request,
        'GET',
        `/api/integration/licenses/apps/${encodeURIComponent(applicationId)}/users`,
      );
    },

    /**
     * Count licensed users for an app in the authenticated tenant
     *
     * @param request - The incoming HTTP request with JWT
     * @param applicationId - Application ID
     *
     * @returns Count of users with licenses
     *
     * @example
     * ```ts
     * const { count } = await authvader.licenses.countLicensedUsers(req, 'my-app-id');
     * console.log(`${count} users have licenses`);
     * ```
     */
    countLicensedUsers: async (
      request: RequestLike,
      applicationId: string,
    ): Promise<{ count: number }> => {
      await client.getCurrentUser(request);

      return client.authenticatedRequest(
        request,
        'GET',
        `/api/integration/licenses/apps/${encodeURIComponent(applicationId)}/count`,
      );
    },

    /**
     * Get the license type for a user (local check - API call)
     *
     * This is a convenience wrapper around `check` for getting just the license type.
     *
     * @param request - The incoming HTTP request with JWT
     * @param userId - User to check (or omit to check authenticated user)
     * @param applicationId - Application to check
     *
     * @returns License type slug or null
     *
     * @example
     * ```ts
     * const licenseType = await authvader.licenses.getUserLicenseType(req, undefined, 'my-app-id');
     * if (licenseType === 'enterprise') {
     *   // Show enterprise features
     * }
     * ```
     */
    getUserLicenseType: async (
      request: RequestLike,
      userId: string | undefined,
      applicationId: string,
    ): Promise<string | null> => {
      const params = new URLSearchParams();
      if (userId) params.set('userId', userId);
      params.set('applicationId', applicationId);

      const result = await client.authenticatedRequest<LicenseCheckResponse>(
        request,
        'GET',
        `/api/integration/licenses/check?${params.toString()}`,
      );
      return result.licenseType;
    },

    /**
     * Get all license holders for an application
     *
     * @param request - The incoming HTTP request
     * @param applicationId - Application ID
     *
     * @returns List of all users with licenses for the application
     *
     * @example
     * ```ts
     * const holders = await authvader.licenses.getHolders(req, 'app-456');
     * // [{ userId: 'user-1', licenseType: 'pro', ... }, ...]
     * ```
     */
    getHolders: async (request: RequestLike, applicationId: string): Promise<LicenseHolder[]> => {
      const claims = await client.validateRequest(request);
      return client.request(
        'GET',
        `/api/integration/licenses/tenants/${claims.tenantId}/applications/${applicationId}/holders`,
      );
    },

    /**
     * Get license audit log
     *
     * @param request - The incoming HTTP request
     * @param options - Filter options
     *
     * @returns Audit log entries with pagination
     *
     * @example
     * ```ts
     * const auditLog = await authvader.licenses.getAuditLog(req, {
     *   userId: 'user-123',
     *   limit: 50,
     * });
     * ```
     */
    getAuditLog: async (
      request: RequestLike,
      options?: {
        userId?: string;
        applicationId?: string;
        limit?: number;
        offset?: number;
      },
    ): Promise<LicenseAuditLogResponse> => {
      const claims = await client.validateRequest(request);
      const params = new URLSearchParams({
        limit: (options?.limit || 50).toString(),
        offset: (options?.offset || 0).toString(),
      });
      if (options?.userId) params.append('userId', options.userId);
      if (options?.applicationId) params.append('applicationId', options.applicationId);
      return client.request(
        'GET',
        `/api/integration/licenses/tenants/${claims.tenantId}/audit-log?${params.toString()}`,
      );
    },

    /**
     * Get usage overview for tenant
     *
     * @param request - The incoming HTTP request
     *
     * @returns Usage overview with seat counts and utilization
     *
     * @example
     * ```ts
     * const usage = await authvader.licenses.getUsageOverview(req);
     * // { totalSeats: 10, seatsAssigned: 8, utilization: 80, ... }
     * ```
     */
    getUsageOverview: async (request: RequestLike): Promise<UsageOverviewResponse> => {
      const claims = await client.validateRequest(request);
      return client.request(
        'GET',
        `/api/integration/licenses/tenants/${claims.tenantId}/usage-overview`,
      );
    },

    /**
     * Get usage trends for tenant
     *
     * @param request - The incoming HTTP request
     * @param days - Number of days to look back (default: 30)
     *
     * @returns Daily usage data
     *
     * @example
     * ```ts
     * const trends = await authvader.licenses.getUsageTrends(req, 30);
     * // [{ date: '2024-01-01', seatsAssigned: 8, ... }, ...]
     * ```
     */
    getUsageTrends: async (request: RequestLike, days?: number): Promise<UsageTrendEntry[]> => {
      const claims = await client.validateRequest(request);
      const params = new URLSearchParams({ days: (days || 30).toString() });
      return client.request(
        'GET',
        `/api/integration/licenses/tenants/${claims.tenantId}/usage-trends?${params.toString()}`,
      );
    },
  };
}
