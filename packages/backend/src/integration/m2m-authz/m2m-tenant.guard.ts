import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { M2M_TENANT_KEY, M2mTenantPolicy } from './m2m-tenant.decorator';
import { M2mTenantAuthService } from './m2m-tenant-auth.service';

/**
 * Deny-by-default tenant guard for M2M integration endpoints.
 *
 * Every integration endpoint MUST declare a tenant policy via one of the
 * `M2mTenant*` decorators. An endpoint with no declaration is rejected outright.
 */
@Injectable()
export class M2mTenantGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly svc: M2mTenantAuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const policy = this.reflector.getAllAndOverride<M2mTenantPolicy>(
      M2M_TENANT_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!policy) {
      throw new ForbiddenException(
        'Integration endpoint is missing an M2M tenant policy',
      );
    }

    const req = context.switchToHttp().getRequest();
    const clientId = req.m2m?.clientId;

    if (!clientId) {
      throw new UnauthorizedException('Missing M2M context');
    }

    switch (policy.mode) {
      case 'agnostic':
        return true;
      case 'record':
        // tenant derived from a DB record; enforced in the service layer
        return true;
      case 'cross':
        await this.svc.assertAllTenants(clientId);
        return true;
      case 'direct': {
        const tenantId =
          policy.source === 'query'
            ? req.query?.[policy.field]
            : req.body?.[policy.field];

        if (!tenantId || typeof tenantId !== 'string') {
          throw new BadRequestException(`${policy.field} is required`);
        }

        await this.svc.assertTenantAccess(clientId, tenantId);
        return true;
      }
    }
  }
}
