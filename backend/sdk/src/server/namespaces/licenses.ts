/**
 * @authvader/sdk - Licenses Namespace (User License Management 🎫)
 *
 * Comprehensive license management for users and tenants.
 * Combines user-scoped operations (JWT auth) and admin operations (M2M).
 */

import type { BaseClient } from '../base-client';
import { createUserLicenseOperations } from './licenses-user';
import { createAdminLicenseOperations } from './licenses-admin';

// Re-export types for convenience
export * from './licenses-types';

/**
 * Creates the licenses namespace with all license-related methods.
 *
 * Combines:
 * - User-scoped operations (JWT auth): grant, revoke, check, etc.
 * - Admin operations (M2M): tenant overview, bulk operations, etc.
 *
 * @param client - The base client instance for making authenticated requests
 * @returns Object containing all license methods
 */
export function createLicensesNamespace(client: BaseClient) {
  const userOps = createUserLicenseOperations(client);
  const adminOps = createAdminLicenseOperations(client);

  return {
    // User-scoped operations (JWT auth)
    ...userOps,

    // Admin operations (M2M)
    ...adminOps,
  };
}

export type LicensesNamespace = ReturnType<typeof createLicensesNamespace>;
