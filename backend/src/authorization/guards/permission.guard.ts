import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Request } from 'express';
import { Reflector } from '@nestjs/core';
import {
  REQUIRED_PERMISSION_KEY,
  REQUIRED_PERMISSIONS_KEY,
  REQUIRED_ANY_PERMISSION_KEY,
} from '../decorators/require-permission.decorator';
import { hasTenantPermission } from '../constants/default-tenant-roles';

/**
 * PermissionGuard - Enforces permission requirements on routes
 *
 * Must be used AFTER JwtAuthGuard to ensure request.user is populated.
 *
 * Supports:
 * - Single permission (@RequirePermission)
 * - Multiple permissions - all required (@RequirePermissions)
 * - Multiple permissions - any required (@RequireAnyPermission)
 *
 * Checks:
 * 1. JWT has tenant_permissions array
 * 2. Required permission(s) are in the array (supports wildcards)
 * 3. If request has tenantId, it matches JWT's tenant_id
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('No authenticated user');
    }

    // Get tenant permissions from JWT
    const tenantPermissions: string[] = user.tenant_permissions || [];

    // Check for single required permission
    const requiredPermission = this.reflector.get<string>(
      REQUIRED_PERMISSION_KEY,
      context.getHandler(),
    );

    if (requiredPermission) {
      this.checkTenantIdMatch(request, user);
      if (!this.hasPermission(tenantPermissions, requiredPermission)) {
        throw new ForbiddenException(
          `Access denied: Missing required permission '${requiredPermission}'`,
        );
      }
      return true;
    }

    // Check for multiple required permissions (all must match)
    const requiredPermissions = this.reflector.get<string[]>(
      REQUIRED_PERMISSIONS_KEY,
      context.getHandler(),
    );

    if (requiredPermissions && requiredPermissions.length > 0) {
      this.checkTenantIdMatch(request, user);
      for (const permission of requiredPermissions) {
        if (!this.hasPermission(tenantPermissions, permission)) {
          throw new ForbiddenException(
            `Access denied: Missing required permission '${permission}'`,
          );
        }
      }
      return true;
    }

    // Check for any required permission (at least one must match)
    const requiredAnyPermissions = this.reflector.get<string[]>(
      REQUIRED_ANY_PERMISSION_KEY,
      context.getHandler(),
    );

    if (requiredAnyPermissions && requiredAnyPermissions.length > 0) {
      this.checkTenantIdMatch(request, user);
      const hasAny = requiredAnyPermissions.some((permission) =>
        this.hasPermission(tenantPermissions, permission),
      );
      if (!hasAny) {
        throw new ForbiddenException(
          `Access denied: Missing one of required permissions: ${requiredAnyPermissions.join(', ')}`,
        );
      }
      return true;
    }

    // No permission requirements = allow
    return true;
  }

  /**
   * Check if tenant ID in request matches JWT tenant
   */
  private checkTenantIdMatch(
    request: Request,
    user: { tenant_id?: string; sub: string },
  ): void {
    const requestTenantId =
      (request.body as Record<string, unknown>)?.tenantId ||
      (request.query as Record<string, unknown>)?.tenantId ||
      (request.params as Record<string, unknown>)?.tenantId;

    if (requestTenantId && user.tenant_id && requestTenantId !== user.tenant_id) {
      throw new ForbiddenException(
        'Access denied: You can only access resources in your authenticated tenant',
      );
    }
  }

  /**
   * Check if user has permission (supports wildcards)
   */
  private hasPermission(tenantPermissions: string[], required: string): boolean {
    return hasTenantPermission(tenantPermissions, required);
  }
}
