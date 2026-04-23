import { Injectable, ExecutionContext, UnauthorizedException, CanActivate } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { KeyService } from '../../oauth/key.service';
import { AuthService } from '../auth.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { extractJwt } from '../utils/extract-jwt';

/**
 * JWT Authentication Guard - STRICTLY STATELESS.
 *
 * This guard enforces a strictly stateless authentication model by validating
 * access tokens exclusively from the Authorization header. It embodies the
 * split-token security architecture that separates access token transport
 * from refresh token handling for maximum security.
 *
 * === STRICT AUTHORIZATION HEADER ENFORCEMENT ===
 * Access tokens are ONLY accepted from the `Authorization: Bearer <token>` header.
 * This guard will NEVER read tokens from cookies, request body, query parameters,
 * or any other source. This is a deliberate architectural constraint that:
 *
 * 1. Prevents token leakage via XSS attacks (cookies can be stolen, headers cannot)
 * 2. Enforces clear separation between access tokens (stateless) and refresh tokens
 * 3. Ensures the guard remains completely stateless with no server-side session storage
 *
 * === NO COOKIE READING ===
 * This guard explicitly does NOT access `req.cookies` in any form. Refresh tokens
 * are handled separately by {@link CookieService} and {@link RefreshService}.
 * The guard delegates all cookie-related operations to dedicated services,
 * maintaining strict separation of concerns.
 *
 * === STATELESSNESS PRINCIPLE ===
 * This guard is designed to be strictly stateless:
 * - No server-side session storage is accessed or modified
 * - Each request is validated independently
 * - No authentication state persists between requests
 * - Token validation is performed against cryptographic signatures only
 *
 * This statelessness enables:
 * - Horizontal scalability (any server instance can validate any request)
 * - Simplified deployment (no shared session store required)
 * - Improved reliability (no session state to synchronize or expire)
 * - Better performance (no database lookups for session validation)
 *
 * === SECURITY ARCHITECTURE ===
 * - **XSS Protection**: Refresh tokens in HttpOnly cookies are immune to JavaScript
 *   theft, while access tokens (short-lived, in-memory) minimize exposure window
 * - **Separation of concerns**: Access tokens (stateless, 15-min lifespan) and refresh
 *   tokens (stateful, rotating, long-lived) follow completely different validation paths
 * - **Reduced attack surface**: Even if XSS compromises the frontend, refresh tokens
 *   cannot be exfiltrated, and access tokens expire quickly
 * - **Clear token lifecycle**: Each token type has dedicated acquisition, validation,
 *   and renewal flows, making the system auditable and maintainable
 *
 * @see {@link extractJwt} - Header-only token extraction utility
 * @see {@link CookieService} - Refresh token cookie operations (completely separate)
 * @see {@link RefreshService} - Refresh token validation and rotation
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
    // Split-token: Only accepts Authorization header (no cookies)
    const token = extractJwt(request);

    if (!token) {
      throw new UnauthorizedException('No Authorization header provided');
    }

    try {
      const payload = await this.keyService.verifyJwt(token, this.issuer);
      
      // Validate user exists
      const user = await this.authService.validateUser(payload.sub as string);
      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      // Attach user to request
      (request as any).user = {
        id: user.id,
        sub: payload.sub,
        email: payload.email || user.email,
      };

      return true;
    } catch (error) {
      throw new UnauthorizedException('Invalid token');
    }
  }
}
