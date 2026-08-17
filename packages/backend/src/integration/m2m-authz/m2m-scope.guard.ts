import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRE_SCOPES_KEY } from './require-scopes.decorator';

/**
 * Deny-by-default scope guard for M2M integration endpoints.
 *
 * Every integration endpoint MUST declare its required scopes via
 * {@link RequireScopes}. An endpoint with no declaration is rejected outright so
 * a forgotten annotation can never accidentally expose an endpoint.
 */
@Injectable()
export class M2mScopeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(
      REQUIRE_SCOPES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required || required.length === 0) {
      throw new ForbiddenException(
        'Integration endpoint is missing a scope requirement',
      );
    }

    const req = context.switchToHttp().getRequest();

    if (!req.m2m) {
      throw new UnauthorizedException('Missing M2M context');
    }

    const granted = new Set<string>(
      String(req.m2m.scope ?? '')
        .split(' ')
        .filter(Boolean),
    );

    const missing = required.filter((scope) => !granted.has(scope));

    if (missing.length > 0) {
      throw new ForbiddenException(
        `insufficient_scope: requires [${required.join(', ')}]`,
      );
    }

    return true;
  }
}
