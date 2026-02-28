/**
 * Re-export default tenant roles from shared package
 *
 * @see @authvital/shared for canonical definitions
 */
export {
  type DefaultTenantRole,
  SYSTEM_TENANT_ROLE_SLUGS,
  type SystemTenantRoleSlug,
  DEFAULT_TENANT_ROLES,
  tenantPermissionMatches,
  hasTenantPermission,
  getRoleBySlug,
  isSystemRole,
} from '@authvital/shared';
