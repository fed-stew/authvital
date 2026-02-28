/**
 * Default Tenant Roles
 *
 * These are the system-defined tenant roles that are auto-created during
 * instance seeding. They are marked as `isSystem: true` and cannot be deleted.
 *
 * Tenant roles are instance-wide and not tied to any specific application.
 *
 * @packageDocumentation
 */

import {
  ADMIN_PERMISSIONS,
  MEMBER_PERMISSIONS,
  type TenantPermission,
} from './permissions.js';

// =============================================================================
// ROLE DEFINITIONS
// =============================================================================

/**
 * Definition of a default tenant role.
 */
export interface DefaultTenantRole {
  /** Display name */
  name: string;
  /** URL-friendly slug (used as identifier) */
  slug: string;
  /** Human-readable description */
  description: string;
  /** Permissions granted by this role */
  permissions: string[];
}

/**
 * System tenant role slugs.
 *
 * Use these constants instead of string literals for type safety.
 *
 * @example
 * ```ts
 * import { SYSTEM_TENANT_ROLE_SLUGS } from '@authvital/shared';
 *
 * if (user.role === SYSTEM_TENANT_ROLE_SLUGS.OWNER) {
 *   // User is an owner
 * }
 * ```
 */
export const SYSTEM_TENANT_ROLE_SLUGS = {
  OWNER: 'owner',
  ADMIN: 'admin',
  MEMBER: 'member',
} as const;

/**
 * Type representing a system tenant role slug.
 */
export type SystemTenantRoleSlug =
  (typeof SYSTEM_TENANT_ROLE_SLUGS)[keyof typeof SYSTEM_TENANT_ROLE_SLUGS];

/**
 * Default tenant roles.
 *
 * These roles are created during instance seeding:
 *
 * - **Owner**: Full control over the tenant (uses wildcard `tenant:*`)
 * - **Admin**: Operational management (most permissions except delete/provision)
 * - **Member**: Basic read access
 *
 * @example
 * ```ts
 * import { DEFAULT_TENANT_ROLES } from '@authvital/shared';
 *
 * // Seed roles in database
 * for (const role of DEFAULT_TENANT_ROLES) {
 *   await db.tenantRole.create({
 *     data: {
 *       name: role.name,
 *       slug: role.slug,
 *       description: role.description,
 *       permissions: role.permissions,
 *       isSystem: true,
 *     },
 *   });
 * }
 * ```
 */
export const DEFAULT_TENANT_ROLES: DefaultTenantRole[] = [
  {
    name: 'Owner',
    slug: 'owner',
    description:
      'Full control over the tenant. Cannot be removed if last owner.',
    permissions: ['tenant:*'], // All tenant permissions (wildcard)
  },
  {
    name: 'Admin',
    slug: 'admin',
    description: 'Operational management of the tenant.',
    permissions: ADMIN_PERMISSIONS as unknown as string[],
  },
  {
    name: 'Member',
    slug: 'member',
    description: 'Standard tenant membership with minimal permissions.',
    permissions: MEMBER_PERMISSIONS as unknown as string[],
  },
];

// =============================================================================
// PERMISSION HELPERS
// =============================================================================

/**
 * Check if a permission pattern matches a specific action.
 *
 * Supports wildcard patterns like `tenant:*` and `members:*`.
 *
 * @param pattern - The permission pattern (may include wildcards)
 * @param action - The specific action to check
 * @returns True if the pattern grants access to the action
 *
 * @example
 * ```ts
 * tenantPermissionMatches('tenant:*', 'tenant:view');    // true
 * tenantPermissionMatches('tenant:*', 'tenant:delete');  // true
 * tenantPermissionMatches('members:view', 'members:invite'); // false
 * ```
 */
export function tenantPermissionMatches(
  pattern: string,
  action: string,
): boolean {
  // Specific wildcard patterns
  if (pattern === 'tenant:*') return action.startsWith('tenant');
  if (pattern === 'members:*') return action.startsWith('members');
  if (pattern === 'licenses:*') return action.startsWith('licenses');
  if (pattern === 'service-accounts:*')
    return action.startsWith('service-accounts');
  if (pattern === 'domains:*') return action.startsWith('domains');
  if (pattern === 'billing:*') return action.startsWith('billing');
  if (pattern === 'app-access:*') return action.startsWith('app-access');
  if (pattern === 'tenant:sso:*') return action.startsWith('tenant:sso');

  // Generic wildcard pattern
  if (pattern.endsWith(':*')) {
    const prefix = pattern.slice(0, -1);
    return action.startsWith(prefix);
  }

  // Exact match
  return pattern === action;
}

/**
 * Check if any permission in the list grants access to the action.
 *
 * @param permissions - Array of permission patterns
 * @param action - The specific action to check
 * @returns True if any permission grants access
 *
 * @example
 * ```ts
 * import { hasTenantPermission, OWNER_PERMISSIONS } from '@authvital/shared';
 *
 * const canInvite = hasTenantPermission(
 *   userPermissions,
 *   'members:invite'
 * );
 *
 * // Owners have wildcard, so this returns true:
 * hasTenantPermission(['tenant:*'], 'tenant:delete'); // true
 * ```
 */
export function hasTenantPermission(
  permissions: string[],
  action: string,
): boolean {
  return permissions.some((pattern) =>
    tenantPermissionMatches(pattern, action),
  );
}

/**
 * Get the role definition by slug.
 *
 * @param slug - The role slug to look up
 * @returns The role definition or undefined if not found
 */
export function getRoleBySlug(
  slug: string,
): DefaultTenantRole | undefined {
  return DEFAULT_TENANT_ROLES.find((role) => role.slug === slug);
}

/**
 * Check if a slug is a system role.
 *
 * @param slug - The slug to check
 * @returns True if the slug is a system role
 */
export function isSystemRole(slug: string): slug is SystemTenantRoleSlug {
  return Object.values(SYSTEM_TENANT_ROLE_SLUGS).includes(
    slug as SystemTenantRoleSlug,
  );
}
