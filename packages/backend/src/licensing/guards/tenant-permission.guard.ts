import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRED_TENANT_PERMISSION_KEY } from '../decorators/require-tenant-permission.decorator';

/**
 * Guard that checks if the JWT contains the required tenant permission
 *
 * Must be used AFTER JwtAuthGuard to ensure request.user is populated
 *
 * Checks:
 * 1. JWT has tenant_permissions array
 * 2. Required permission is in the array (or user has wildcard)
 * 3. If request has tenantId, it matches JWT's tenant_id
 */
@Injectable()
export class TenantPermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermission = this.reflector.get<string>(
      REQUIRED_TENANT_PERMISSION_KEY,
      context.getHandler(),
    );

    // No permission required = allow
    if (!requiredPermission) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('No authenticated user');
    }

    // Check tenant_id match if request specifies a tenant
    const requestTenantId =
      request.body?.tenantId ||
      request.query?.tenantId ||
      request.params?.tenantId;

    if (requestTenantId && user.tenant_id && requestTenantId !== user.tenant_id) {
      throw new ForbiddenException(
        'Access denied: You can only access resources in your authenticated tenant',
      );
    }

    // Check permissions
    const tenantPermissions: string[] = user.tenant_permissions || [];

    // Check for exact match or wildcard
    const hasPermission =
      tenantPermissions.includes(requiredPermission) ||
      tenantPermissions.some((p) => this.matchesWildcard(p, requiredPermission));

    if (!hasPermission) {
      throw new ForbiddenException(
        `Access denied: Missing required permission '${requiredPermission}'`,
      );
    }

    return true;
  }

  /**
   * Check if a permission pattern matches (supports wildcards)
   * e.g., "licenses:*" matches "licenses:manage"
   */
  private matchesWildcard(pattern: string, permission: string): boolean {
    if (pattern === '*') return true;
    if (!pattern.includes('*')) return pattern === permission;

    const [patternResource] = pattern.split(':');
    const [permResource] = permission.split(':');

    if (pattern.endsWith(':*')) {
      return patternResource === permResource;
    }

    return false;
  }
}
