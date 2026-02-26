/**
 * @authvader/sdk - Entitlements Namespace (The Gatekeeper 🛡️)
 *
 * Check quotas, features, and entitlements for tenant-scoped operations.
 */

import type { BaseClient, RequestLike } from '../base-client';
import type { QuotaCheckResult } from '../types';

/**
 * Creates the entitlements namespace with all entitlement-related methods.
 *
 * @param client - The base client instance for making authenticated requests
 * @returns Object containing all entitlement methods
 */
export function createEntitlementsNamespace(client: BaseClient) {
  return {
    /**
     * Check if a quota-based action is allowed
     *
     * This is the main "gatekeeper" function. Use it before any quota-consuming action.
     *
     * @param request - The incoming HTTP request
     * @param featureKey - The quota to check (e.g., 'seats', 'projects')
     * @param options - Optional: appScope and incrementCount
     *
     * @example
     * ```ts
     * // Before adding a team member
     * const check = await authvader.entitlements.canPerform(req, 'seats');
     * if (!check.allowed) {
     *   return res.status(403).json({ error: check.reason });
     * }
     * // Add the member...
     * await authvader.entitlements.incrementUsage(req, 'seats');
     * ```
     */
    canPerform: async (
      request: RequestLike,
      featureKey: string,
      _options?: { appScope?: string; incrementCount?: number },
    ): Promise<QuotaCheckResult> => {
      const claims = await client.validateRequest(request);

      // Special handling for 'seats' - use the license check endpoint
      if (featureKey === 'seats') {
        const params = new URLSearchParams({
          tenantId: claims.tenantId,
          clientId: client.config.clientId,
        });

        const seatsResult = await client.request<{
          memberCount: number;
          totalSeatsOwned: number;
          totalSeatsAssigned: number;
          totalSeatsAvailable: number;
          licensingMode: 'FREE' | 'PER_SEAT' | 'TENANT_WIDE' | 'UNKNOWN';
          unlimited: boolean;
          subscriptions: Array<{
            applicationId: string;
            licenseType: string;
            seatsOwned: number;
            seatsAssigned: number;
            seatsAvailable: number;
          }>;
        }>('GET', `/api/integration/check-seats?${params.toString()}`);

        // If the app has no licensing mode, always allow (unless max is set)
        if (seatsResult.unlimited) {
          return {
            allowed: true,
            reason: undefined,
            currentUsage: seatsResult.memberCount,
            limit: undefined,
          };
        }

        const canAddSeat = seatsResult.totalSeatsAvailable > 0;

        return {
          allowed: canAddSeat,
          reason: canAddSeat
            ? undefined
            : 'No available seats. Upgrade your subscription to add more team members.',
          currentUsage: seatsResult.totalSeatsAssigned,
          limit: seatsResult.totalSeatsOwned,
        };
      }

      // For other features, this would call quota/billing endpoints
      // For now, default to allowed for non-seats quotas
      return {
        allowed: true,
        reason: undefined,
        currentUsage: 0,
        limit: undefined,
      };
    },

    // Note: The following methods reference billing endpoints that don't exist yet.
    // They should be implemented if/when billing features are added.
    // For now, we keep them for API compatibility but they'll throw errors.
    //
    // TODO: If billing is ever needed, implement:
    // - /billing/tenants/{tenantId}/check-feature/{featureKey}
    // - /billing/tenants/{tenantId}/check-app-access/{applicationId}
    // - /billing/tenants/{tenantId}/status
    // - /billing/tenants/{tenantId}/usage/increment

    /**
     * Decrement usage for a quota (call after removing resource)
     *
     * @param request - The incoming HTTP request
     * @param featureKey - The quota to decrement (e.g., 'seats')
     * @param options - Optional: appScope and amount to decrement by
     *
     * @example
     * ```ts
     * // After removing a team member
     * await authvader.entitlements.decrementUsage(req, 'seats');
     * ```
     */
    decrementUsage: async (
      request: RequestLike,
      featureKey: string,
      options?: { appScope?: string; by?: number },
    ): Promise<{ newUsage: number }> => {
      const claims = await client.validateRequest(request);
      return client.request('POST', `/billing/tenants/${claims.tenantId}/usage/decrement`, {
        featureKey,
        appScope: options?.appScope || 'global',
        value: options?.by || 1,
      });
    },
  };
}

export type EntitlementsNamespace = ReturnType<typeof createEntitlementsNamespace>;
