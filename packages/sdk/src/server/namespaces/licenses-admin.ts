/**
 * @authvital/sdk - Admin License Operations (M2M)
 *
 * M2M (machine-to-machine) license operations for tenant administration.
 * These operations require M2M authentication with licensing permissions.
 */

import type { BaseClient } from '../base-client';
import type {
  TenantLicenseOverview,
  UserLicenseAssignment,
  SubscriptionSummary,
  MemberWithLicenses,
  AvailableLicenseType,
  GrantLicenseParams,
  RevokeLicenseParams,
  ChangeLicenseTypeParams,
  BulkGrantLicenseResult,
  BulkRevokeLicenseResult,
} from '../types';

/**
 * Creates M2M admin license operations.
 *
 * @param client - The base client instance for making authenticated requests
 * @returns Object containing M2M admin license methods
 */
export function createAdminLicenseOperations(client: BaseClient) {
  return {
    /**
     * Get full license overview for a tenant
     *
     * Returns all subscriptions (inventory) and utilization stats.
     * Requires M2M authentication.
     *
     * @example
     * ```ts
     * const overview = await authvital.licenses.getTenantOverview('tenant-123');
     * console.log(`Using ${overview.totalSeatsAssigned} of ${overview.totalSeatsOwned} seats`);
     * ```
     */
    getTenantOverview: async (tenantId: string): Promise<TenantLicenseOverview> => {
      return client.request<TenantLicenseOverview>(
        'GET',
        `/api/licensing/tenants/${encodeURIComponent(tenantId)}/license-overview`,
      );
    },

    /**
     * Get all license assignments for a user in a tenant
     *
     * @example
     * ```ts
     * const licenses = await authvital.licenses.getUserLicenses('tenant-123', 'user-456');
     * licenses.forEach(l => console.log(`Has ${l.licenseTypeName} for ${l.applicationId}`));
     * ```
     */
    getUserLicenses: async (
      tenantId: string,
      userId: string,
    ): Promise<UserLicenseAssignment[]> => {
      return client.request<UserLicenseAssignment[]>(
        'GET',
        `/api/licensing/tenants/${encodeURIComponent(tenantId)}/users/${encodeURIComponent(userId)}/licenses`,
      );
    },

    /**
     * Get all subscriptions for a tenant
     *
     * Returns the tenant's "wallet" - all their purchased license seats.
     *
     * @example
     * ```ts
     * const subscriptions = await authvital.licenses.getTenantSubscriptions('tenant-123');
     * subscriptions.forEach(sub => {
     *   console.log(`${sub.applicationName}: ${sub.quantityAvailable} seats available`);
     * });
     * ```
     */
    getTenantSubscriptions: async (tenantId: string): Promise<SubscriptionSummary[]> => {
      return client.request<SubscriptionSummary[]>(
        'GET',
        `/api/licensing/tenants/${encodeURIComponent(tenantId)}/subscriptions`,
      );
    },

    /**
     * Get tenant members with their license assignments
     *
     * Returns all members along with their license status for each application.
     * Useful for admin dashboards.
     *
     * @example
     * ```ts
     * const members = await authvital.licenses.getMembersWithLicenses('tenant-123');
     * members.forEach(member => {
     *   console.log(`${member.user.email} has ${member.licenses.length} licenses`);
     * });
     * ```
     */
    getMembersWithLicenses: async (tenantId: string): Promise<MemberWithLicenses[]> => {
      return client.request<MemberWithLicenses[]>(
        'GET',
        `/api/licensing/tenants/${encodeURIComponent(tenantId)}/members-with-licenses`,
      );
    },

    /**
     * Get available license types for tenant provisioning
     *
     * Returns all ACTIVE license types across all applications that the tenant
     * could purchase/provision. Includes info about existing subscriptions.
     *
     * @example
     * ```ts
     * const available = await authvital.licenses.getAvailableLicenseTypes('tenant-123');
     * available.forEach(type => {
     *   if (type.hasSubscription) {
     *     console.log(`Already have: ${type.name} (${type.existingSubscription?.quantityPurchased} seats)`);
     *   } else {
     *     console.log(`Can add: ${type.name}`);
     *   }
     * });
     * ```
     */
    getAvailableLicenseTypes: async (tenantId: string): Promise<AvailableLicenseType[]> => {
      return client.request<AvailableLicenseType[]>(
        'GET',
        `/api/licensing/tenants/${encodeURIComponent(tenantId)}/available-license-types`,
      );
    },

    /**
     * Grant a license to a user (M2M version)
     *
     * Assigns a seat from the tenant's subscription to a user.
     * Requires M2M authentication with licensing permissions.
     *
     * @throws Error if no seats available or user already has a license for this app
     *
     * @example
     * ```ts
     * const assignment = await authvital.licenses.grantToUser({
     *   tenantId: 'tenant-123',
     *   userId: 'user-456',
     *   applicationId: 'app-789',
     *   licenseTypeId: 'pro-license',
     * });
     * ```
     */
    grantToUser: async (params: GrantLicenseParams): Promise<UserLicenseAssignment> => {
      return client.request<UserLicenseAssignment>('POST', '/api/licensing/licenses/grant', params);
    },

    /**
     * Revoke a license from a user (M2M version)
     *
     * Returns the seat to the tenant's pool.
     *
     * @example
     * ```ts
     * await authvital.licenses.revokeFromUser({
     *   tenantId: 'tenant-123',
     *   userId: 'user-456',
     *   applicationId: 'app-789',
     * });
     * ```
     */
    revokeFromUser: async (params: RevokeLicenseParams): Promise<void> => {
      await client.request<void>('POST', '/api/licensing/licenses/revoke', params);
    },

    /**
     * Change a user's license type (M2M version)
     *
     * Moves a user from one license type to another for the same application.
     *
     * @example
     * ```ts
     * const newAssignment = await authvital.licenses.changeUserType({
     *   tenantId: 'tenant-123',
     *   userId: 'user-456',
     *   applicationId: 'app-789',
     *   newLicenseTypeId: 'enterprise-license',
     * });
     * ```
     */
    changeUserType: async (params: ChangeLicenseTypeParams): Promise<UserLicenseAssignment> => {
      return client.request<UserLicenseAssignment>(
        'POST',
        '/api/licensing/licenses/change-type',
        params,
      );
    },

    /**
     * Bulk grant licenses to multiple users
     *
     * @example
     * ```ts
     * const results = await authvital.licenses.grantBulk([
     *   { tenantId: 'tenant-123', userId: 'user-1', applicationId: 'app-789', licenseTypeId: 'pro' },
     *   { tenantId: 'tenant-123', userId: 'user-2', applicationId: 'app-789', licenseTypeId: 'pro' },
     * ]);
     * results.forEach(r => console.log(`${r.userId}: ${r.success ? 'Success' : r.error}`));
     * ```
     */
    grantBulk: async (assignments: GrantLicenseParams[]): Promise<BulkGrantLicenseResult[]> => {
      return client.request<BulkGrantLicenseResult[]>('POST', '/api/licensing/licenses/grant-bulk', {
        assignments,
      });
    },

    /**
     * Bulk revoke licenses from multiple users
     *
     * @example
     * ```ts
     * const result = await authvital.licenses.revokeBulk([
     *   { tenantId: 'tenant-123', userId: 'user-1', applicationId: 'app-789' },
     *   { tenantId: 'tenant-123', userId: 'user-2', applicationId: 'app-789' },
     * ]);
     * console.log(`Revoked ${result.revokedCount} licenses`);
     * result.failures.forEach(f => console.error(`Failed: ${f.error}`));
     * ```
     */
    revokeBulk: async (revocations: RevokeLicenseParams[]): Promise<BulkRevokeLicenseResult> => {
      return client.request<BulkRevokeLicenseResult>(
        'POST',
        '/api/licensing/licenses/revoke-bulk',
        {
          revocations,
        },
      );
    },
  };
}
