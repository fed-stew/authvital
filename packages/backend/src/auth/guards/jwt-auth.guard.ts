import { Injectable, ExecutionContext, UnauthorizedException, CanActivate, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { KeyService } from '../../oauth/key.service';
import { AuthService } from '../auth.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { extractSessionJwt } from '../utils/extract-jwt';

/**
 * JWT Authentication Guard.
 *
 * Authenticates a request by cryptographically verifying an RS256 access
 * token against the rotating signing keys managed by KeyManagerService
 * (ACTIVE key signs; PASSIVE keys remain verifiable until archived). The
 * token is accepted from EITHER of two first-party sources, in this order
 * (see {@link extractSessionJwt}):
 *
 *   1. `Authorization: Bearer <token>` header — the in-memory access token the
 *      SPA attaches once it is warm.
 *   2. The `idp_session` httpOnly cookie — the durable console/IdP browser
 *      session set on every login / signup / SSO / invite-accept flow. This is
 *      what keeps the console authenticated across full page reloads (the
 *      in-memory Bearer token does not survive a reload, and the password-login
 *      flow issues no refresh_token cookie, so the cookie is the ONLY thing
 *      that lets a reloaded console re-authenticate).
 *
 * This mirrors {@link OptionalAuthGuard} and the OAuth authorize redirect, both
 * of which already read `idp_session`, so console routes authenticate
 * consistently whether they are optional- or hard-guarded.
 *
 * === SECURITY ===
 * `idp_session` is httpOnly (so XSS cannot read/exfiltrate it — the usual
 * argument against JS-readable token cookies does not apply) and sameSite
 * (cross-site fetches do not carry it, mitigating CSRF). We deliberately read
 * ONLY `idp_session`, never `super_admin_session` or any other cookie.
 *
 * === VALIDATION MODEL (mostly stateless, one DB check) ===
 * Signature, issuer, and expiry are verified purely cryptographically — no
 * server-side session store is consulted. However, this guard is NOT fully
 * stateless: after signature verification it performs ONE per-request database
 * lookup (AuthService.validateUser) to confirm the token's subject still
 * exists. This is deliberate: tokens are otherwise irrevocable for their
 * lifetime, so the existence check is what cuts off deleted/deactivated users
 * immediately instead of letting them ride out the remainder of their token.
 *
 * === TOKEN LIFETIME ===
 * Console session tokens (both the Bearer JWT and the `idp_session` cookie
 * value) live for CONSOLE_SESSION_TTL_SECONDS (currently 7 days) — see
 * `auth/constants/token-ttl.ts`, which also documents the coupling between
 * this TTL and the passive signing-key lifetime in KeyManagerService.
 *
 * @see {@link extractSessionJwt} - Header/cookie token extraction utility
 * @see CONSOLE_SESSION_TTL_SECONDS - Console session TTL (auth/constants/token-ttl.ts)
 *
 * @example
 * // Apply to entire controller (all routes protected)
 * @UseGuards(JwtAuthGuard)
 * @Controller('api/protected')
 * export class ProtectedController {}
 *
 * @example
 * // Apply to single route
 * @UseGuards(JwtAuthGuard)
 * @Get('profile')
 * getProfile(@Req() req: RequestWithUser) {
 *   return req.user;
 * }
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);
  private readonly issuer: string;

  constructor(
    private readonly reflector: Reflector,
    private readonly keyService: KeyService,
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {
    this.issuer = this.configService.getOrThrow<string>('BASE_URL');
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if route is marked as public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

        const request = context.switchToHttp().getRequest<Request>();
    // Accept the access token from the Authorization header OR the durable
    // `idp_session` cookie (see extractSessionJwt for the why + security notes).
    const token = extractSessionJwt(request);

    if (!token) {
      throw new UnauthorizedException('No authentication token provided');
    }

    try {
      const payload = await this.keyService.verifyJwt(token, this.issuer);
      
      // Validate user exists
      const user = await this.authService.validateUser(payload.sub as string);
      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      // Attach user to request.
      //
      // We propagate the tenant-scoped claims straight from the *verified* JWT
      // payload. These claims (tenant_id / tenant_permissions / tenant_roles)
      // are minted by the OAuth token service for tenant-scoped tokens and are
      // the contract PermissionGuard depends on. The original code dropped them
      // here, which silently disabled every @RequirePermission check in the app.
      (request as any).user = {
        id: user.id,
        sub: payload.sub,
        email: payload.email || user.email,
        given_name: payload.given_name,
        family_name: payload.family_name,
        scope: payload.scope,
        tenant_id: payload.tenant_id,
        tenant_subdomain: payload.tenant_subdomain,
        tenant_roles: payload.tenant_roles,
        tenant_permissions: payload.tenant_permissions,
        app_roles: payload.app_roles,
        // MFA claims minted by oauth-token.service. MfaComplianceGuard uses
        // these verified claims as its fast path (no DB hit): amr including
        // 'otp' proves MFA, and mfa_grace_expires_at marks an open grace
        // window for the token's tenant.
        amr: payload.amr,
        mfa_grace_expires_at: payload.mfa_grace_expires_at,
      };

      return true;
    } catch (error) {
      // Log the underlying reason (signature vs issuer vs expiry vs missing
      // user) at debug level so ops can diagnose — never log token contents.
      this.logger.debug(
        `Token verification failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new UnauthorizedException('Invalid token');
    }
  }
}
