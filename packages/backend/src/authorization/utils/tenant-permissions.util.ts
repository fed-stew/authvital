import { OWNER_PERMISSIONS, SYSTEM_TENANT_ROLE_SLUGS } from '@authvital/shared';

/**
 * Minimal shape of a tenant role needed to resolve effective permissions.
 */
export interface TenantRoleLike {
  slug: string;
  permissions: string[];
}

/**
 * Does this set of tenant roles include the owner role?
 */
export function membershipIsOwner(roles: { slug: string }[]): boolean {
  return roles.some((r) => r.slug === SYSTEM_TENANT_ROLE_SLUGS.OWNER);
}

/**
 * Resolve the EFFECTIVE tenant permissions for a membership's roles.
 *
 * The owner is "god" within a tenant. The seeded owner role stores the
 * `['tenant:*']` wildcard, but that wildcard does NOT cross permission
 * namespaces (`tenantPermissionMatches('tenant:*', 'licenses:manage')` is
 * false), so a naive flatMap would leave owners unable to manage licenses,
 * members, domains, etc. on any DB-guarded route.
 *
 * The JWT claim path already expands owners to the full `OWNER_PERMISSIONS`
 * set; this helper is the single source of truth so the live-DB guard path
 * (TenantAccessGuard / MembershipTenantGuard / PermissionsService) agrees with
 * it. Non-owners get their explicit role permissions, de-duplicated.
 */
export function resolveEffectiveTenantPermissions(
  roles: TenantRoleLike[],
): string[] {
  const explicit = roles.flatMap((r) => r.permissions ?? []);
  if (membershipIsOwner(roles)) {
    return [...new Set([...(OWNER_PERMISSIONS as unknown as string[]), ...explicit])];
  }
  return [...new Set(explicit)];
}
