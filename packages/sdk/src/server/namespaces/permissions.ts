/**
 * @authvital/sdk - Permissions Namespace
 *
 * Check and list user permissions for tenant-scoped operations.
 */

import type { BaseClient, RequestLike } from '../base-client';
import type {
  CheckPermissionResult,
  CheckPermissionsResult,
  UserPermissions,
} from '../types';

/**
 * Creates the permissions namespace with all permission-related methods.
 *
 * @param client - The base client instance for making authenticated requests
 * @returns Object containing all permission methods
 */
export function createPermissionsNamespace(client: BaseClient) {
  return {
    /**
     * Check if the authenticated user has a specific permission
     *
     * @param request - The incoming HTTP request
     * @param permission - The permission to check (e.g., 'users:write')
     *
     * @example
     * ```ts
     * app.post('/api/users', async (req, res) => {
     *   const { allowed } = await authvital.permissions.check(req, 'users:write');
     *   if (!allowed) return res.status(403).json({ error: 'Forbidden' });
     *   // ... create user
     * });
     * ```
     */
    check: async (request: RequestLike, permission: string): Promise<CheckPermissionResult> => {
      const claims = await client.validateRequest(request);
      return client.request<CheckPermissionResult>('POST', '/api/integration/check-permission', {
        userId: claims.sub,
        tenantId: claims.tenantId,
        permission,
      });
    },

    /**
     * Check multiple permissions at once for the authenticated user
     *
     * @param request - The incoming HTTP request
     * @param permissions - Array of permissions to check
     *
     * @example
     * ```ts
     * const { results } = await authvital.permissions.checkMany(req, ['users:read', 'users:write']);
     * // results = { 'users:read': true, 'users:write': false }
     * ```
     */
    checkMany: async (
      request: RequestLike,
      permissions: string[],
    ): Promise<CheckPermissionsResult> => {
      const claims = await client.validateRequest(request);
      return client.request('POST', '/api/integration/check-permissions', {
        userId: claims.sub,
        tenantId: claims.tenantId,
        permissions,
      });
    },

    /**
     * Get all permissions for the authenticated user
     *
     * @param request - The incoming HTTP request
     *
     * @example
     * ```ts
     * app.get('/api/my-permissions', async (req, res) => {
     *   const perms = await authvital.permissions.list(req);
     *   res.json(perms);
     * });
     * ```
     */
    list: async (request: RequestLike): Promise<UserPermissions> => {
      const claims = await client.validateRequest(request);
      const params = new URLSearchParams({ userId: claims.sub, tenantId: claims.tenantId });
      return client.request<UserPermissions>(
        'GET',
        `/api/integration/user-permissions?${params.toString()}`,
      );
    },
  };
}

export type PermissionsNamespace = ReturnType<typeof createPermissionsNamespace>;
