import { ADMIN_PERMISSIONS, MEMBER_PERMISSIONS } from "./permissions";

/**
 * Default Tenant Roles for the instance
 * These are auto-created during seeding and marked as isSystem: true
 * Tenant roles are instance-wide and not tied to any specific application
 */

export interface DefaultTenantRole {
  name: string;
  slug: string;
  description: string;
  permissions: string[];
}

export const SYSTEM_TENANT_ROLE_SLUGS = {
  OWNER: "owner",
  ADMIN: "admin",
  MEMBER: "member",
} as const;

export type SystemTenantRoleSlug =
  (typeof SYSTEM_TENANT_ROLE_SLUGS)[keyof typeof SYSTEM_TENANT_ROLE_SLUGS];

export const DEFAULT_TENANT_ROLES: DefaultTenantRole[] = [
  {
    name: "Owner",
    slug: "owner",
    description:
      "Full control over the tenant. Cannot be removed if last owner.",
    permissions: ["tenant:*"], // All tenant permissions (wildcard)
  },
  {
    name: "Admin",
    slug: "admin",
    description: "Operational management of the tenant.",
    permissions: ADMIN_PERMISSIONS,
  },
  {
    name: "Member",
    slug: "member",
    description: "Standard tenant membership with minimal permissions.",
    permissions: MEMBER_PERMISSIONS,
  },
];

/**
 * Helper to check if a tenant permission matches (supports wildcards)
 */
export function tenantPermissionMatches(pattern: string, action: string): boolean {
  if (pattern === 'tenant:*') return action.startsWith('tenant');
  if (pattern === 'members:*') return action.startsWith('members');
  if (pattern === 'licenses:*') return action.startsWith('licenses');
  if (pattern === 'service-accounts:*') return action.startsWith('service-accounts');
  if (pattern === 'domains:*') return action.startsWith('domains');
  if (pattern === 'billing:*') return action.startsWith('billing');
  if (pattern === 'app-access:*') return action.startsWith('app-access');
  if (pattern === 'tenant:sso:*') return action.startsWith('tenant:sso');
  if (pattern.endsWith(':*')) {
    const prefix = pattern.slice(0, -1);
    return action.startsWith(prefix);
  }
  return pattern === action;
}

/**
 * Check if any permission in the list grants access to the action
 */
export function hasTenantPermission(
  permissions: string[],
  action: string,
): boolean {
  return permissions.some((pattern) =>
    tenantPermissionMatches(pattern, action),
  );
}
