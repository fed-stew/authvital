import { SetMetadata } from '@nestjs/common';

export const REQUIRED_TENANT_PERMISSION_KEY = 'required_tenant_permission';

/**
 * Decorator to specify required tenant permission for an endpoint
 *
 * @example
 * @RequireTenantPermission('licenses:manage')
 * async grantLicense() { ... }
 */
export function RequireTenantPermission(permission: string) {
  return SetMetadata(REQUIRED_TENANT_PERMISSION_KEY, permission);
}
