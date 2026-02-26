import { SetMetadata } from '@nestjs/common';

export const REQUIRED_PERMISSION_KEY = 'required_permission';
export const REQUIRED_PERMISSIONS_KEY = 'required_permissions';

/**
 * Decorator to mark a route as requiring a specific permission
 *
 * Usage:
 * @RequirePermission('members:invite')
 * @Post('invite')
 * async inviteMember() { ... }
 */
export const RequirePermission = (permission: string) =>
  SetMetadata(REQUIRED_PERMISSION_KEY, permission);

/**
 * Decorator to mark a route as requiring multiple permissions (all must match)
 *
 * Usage:
 * @RequirePermissions(['members:view', 'licenses:manage'])
 * @Post('assign-license')
 * async assignLicense() { ... }
 */
export const RequirePermissions = (permissions: string[]) =>
  SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions);

/**
 * Decorator to mark a route as requiring ANY of the specified permissions
 */
export const REQUIRED_ANY_PERMISSION_KEY = 'required_any_permission';
export const RequireAnyPermission = (permissions: string[]) =>
  SetMetadata(REQUIRED_ANY_PERMISSION_KEY, permissions);
