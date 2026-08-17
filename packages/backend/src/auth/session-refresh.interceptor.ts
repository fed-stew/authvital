import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Observable } from 'rxjs';
import { Request, Response } from 'express';
import * as jose from 'jose';
import { KeyService } from '../oauth/key.service';
import { AuthService } from './auth.service';
import { getSessionCookieOptions } from '../common/utils/cookie.utils';
import {
  CONSOLE_SESSION_TTL_SECONDS,
  CONSOLE_SESSION_ABSOLUTE_TTL_SECONDS,
} from './constants/token-ttl';

/**
 * Sliding re-issuance of the `idp_session` console cookie.
 *
 * Console JWTs are short-lived (CONSOLE_SESSION_TTL_SECONDS, default 1h).
 * To keep an ACTIVE console session alive without 7-day tokens, this
 * interceptor re-issues the cookie when ALL of the following hold:
 *
 *  1. The request authenticated via the `idp_session` COOKIE — never for
 *     Bearer-authenticated requests (the SPA refreshes its own in-memory
 *     token; re-issuing on Bearer traffic would resurrect sessions the
 *     browser no longer holds).
 *  2. The cookie JWT verifies (signature / issuer / expiry).
 *  3. The token is older than HALF its TTL (avoids signing on every request).
 *  4. now - session_start < CONSOLE_SESSION_ABSOLUTE_TTL_SECONDS — the
 *     absolute cap. The fresh token's expiry is additionally clamped so it
 *     can NEVER outlive session_start + absolute TTL.
 *
 * The re-issued JWT preserves the SAME sub / email / amr / session_start as
 * the original, so sliding never upgrades a session's authentication level
 * and never restarts the absolute clock.
 *
 * LEGACY SESSIONS (minted before amr / session_start existed): a missing
 * `amr` claim is carried forward as ['pwd'] (all pre-amr console logins were
 * password-authenticated — MFA logins existed, but we cannot prove them, so
 * we claim the weakest method). A missing `session_start` falls back to the
 * token's `iat`.
 *
 * Cookie options intentionally reuse getSessionCookieOptions() — the exact
 * options every login/signup/SSO/invite flow uses to SET `idp_session`.
 *
 * Registered globally (APP_INTERCEPTOR in AuthModule) so it covers the same
 * scope as JwtAuthGuard/OptionalAuthGuard cookie authentication. It runs
 * BEFORE the route handler so the Set-Cookie header lands even on handlers
 * that write the response themselves via @Res. Failures are swallowed: a
 * sliding miss must never break the actual request.
 */
@Injectable()
export class SessionRefreshInterceptor implements NestInterceptor {
  private readonly logger = new Logger(SessionRefreshInterceptor.name);
  private readonly issuer: string;

  constructor(
    private readonly keyService: KeyService,
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {
    this.issuer = this.configService.getOrThrow<string>('BASE_URL');
  }

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    if (context.getType() === 'http') {
      try {
        await this.maybeSlideSession(context);
      } catch (error) {
        // Never let sliding break the request itself.
        this.logger.debug(
          `Session slide skipped: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    return next.handle();
  }

  private async maybeSlideSession(context: ExecutionContext): Promise<void> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    // Bearer-authenticated requests never slide the cookie session.
    if (request.headers?.authorization?.startsWith('Bearer ')) {
      return;
    }

    const token = (
      request as unknown as { cookies?: Record<string, string> }
    ).cookies?.['idp_session'];
    if (!token) {
      return;
    }

    // Cheap pre-filter: decode WITHOUT verifying to check age. Only tokens
    // actually due for re-issue pay for signature verification + signing.
    let claims: jose.JWTPayload;
    try {
      claims = jose.decodeJwt(token);
    } catch {
      return; // Not a JWT — nothing to slide.
    }

    const now = Math.floor(Date.now() / 1000);
    const { iat, exp } = claims;
    if (typeof iat !== 'number' || typeof exp !== 'number' || exp <= iat) {
      return;
    }

    // Rule 3: only re-issue once the token is past half its own TTL.
    if (now < iat + (exp - iat) / 2) {
      return;
    }

    // Rule 4: never extend past the absolute session cap.
    // Legacy tokens without session_start: fall back to iat.
    const sessionStart =
      typeof claims.session_start === 'number' ? claims.session_start : iat;
    const capRemaining =
      sessionStart + CONSOLE_SESSION_ABSOLUTE_TTL_SECONDS - now;
    if (capRemaining <= 0) {
      return;
    }

    // Rule 2: the token must actually be VALID (signature/issuer/expiry) —
    // decodeJwt above proved nothing.
    let payload: jose.JWTPayload;
    try {
      payload = await this.keyService.verifyJwt(token, this.issuer);
    } catch {
      return; // Expired/forged cookie: let the guards 401 as usual.
    }

    // Legacy tokens without amr: treat as password-only (see class doc).
    const amr = Array.isArray(payload.amr) ? (payload.amr as string[]) : ['pwd'];

    // Re-mint through the ONE canonical console-JWT mint, clamping the
    // lifetime so the fresh token can NEVER outlive the absolute cap.
    const freshToken = await this.authService.generateJwt(
      payload.sub as string,
      (payload.email as string) || '',
      {
        amr,
        sessionStart,
        expiresIn: Math.min(CONSOLE_SESSION_TTL_SECONDS, capRemaining),
      },
    );

    if (!response.headersSent) {
      response.cookie('idp_session', freshToken, getSessionCookieOptions());
      this.logger.debug(
        `Re-issued idp_session for ${payload.sub} (session_start=${sessionStart})`,
      );
    }
  }
}
