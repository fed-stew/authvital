import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  Res,
  Req,
  HttpCode,
  HttpStatus,
  Header,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response, Request } from 'express';
import { OAuthService } from './oauth.service';
import { OAuthTokenService } from './oauth-token.service';
import { KeyService } from './key.service';
import { PrismaService } from '../prisma/prisma.service';
import { getRefreshTokenCookieOptions } from '../common/utils/cookie.utils';

/**
 * OAuth Controller
 * Core OAuth/OIDC endpoints: authorize, token, introspect, revoke
 * Session management is in OAuthSessionController
 *
 * Authentication Methods:
 * - Authorization Header: All token-bearing requests must include `Authorization: Bearer <token>` header
 * - No Cookie-based Auth: Access tokens are NEVER read from cookies (legacy support removed)
 * - Refresh Token Cookie: Only refresh_token is stored as httpOnly cookie for the split-token flow
 *
 * Token Flow:
 * - Access tokens are returned in JSON response body only
 * - Refresh tokens are set as httpOnly, Secure, SameSite=Strict cookies
 * - No auth_token or idp_session cookies are used
 */
@Controller('oauth')
export class OAuthController {
  private readonly issuer: string;

  constructor(
    private readonly oauthService: OAuthService,
    private readonly tokenService: OAuthTokenService,
    private readonly keyService: KeyService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.issuer = this.configService.getOrThrow<string>('BASE_URL');
  }

  /**
   * Tenant-Scoped Authorization Endpoint
   *
   * Requires: Authorization: Bearer <token> header for user session validation
   * Note: This endpoint does NOT support cookie-based authentication
   */
  @Get('authorize-tenant')
  async authorizeTenant(
    @Query('tenant_id') tenantId: string,
    @Query('tenant_subdomain') tenantSubdomain: string,
    @Query('client_id') clientId: string,
    @Query('redirect_uri') redirectUri: string,
    @Query('response_type') responseType: string,
    @Query('scope') scope: string,
    @Query('state') state: string,
    @Query('nonce') nonce: string,
    @Query('code_challenge') codeChallenge: string,
    @Query('code_challenge_method') codeChallengeMethod: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    // Extract token from Authorization header only (no cookie fallback)
    const authHeader = req.headers.authorization;
    const authToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : undefined;
    const user = authToken ? await this.oauthService.validateJwt(authToken) : null;

    if (!user) {
      const frontendUrl = this.configService.getOrThrow<string>('BASE_URL');
      return res.redirect(`${frontendUrl}/auth/login`);
    }

    const userInfo = await this.oauthService.getUserInfo(user.userId);
    const hasTenantAccess = userInfo.tenants?.some(
      (t: any) => t.id === tenantId || t.slug === tenantSubdomain,
    );

    if (!hasTenantAccess) {
      throw new BadRequestException('You do not have access to this organization');
    }

    const code = await this.oauthService.authorize(user.userId, {
      clientId,
      redirectUri,
      responseType,
      scope,
      state,
      nonce,
      codeChallenge,
      codeChallengeMethod,
      tenantId,
      tenantSubdomain,
    });

    const redirectUrl = new URL(redirectUri);
    redirectUrl.searchParams.set('code', code);
    if (state) redirectUrl.searchParams.set('state', state);

    return res.redirect(redirectUrl.toString());
  }

  /**
   * Authorization Endpoint (OIDC)
   *
   * Authentication:
   * - Standard flow: Requires `Authorization: Bearer <token>` header
   * - Silent refresh (prompt=none): Returns login_required error if no valid session
   *
   * No cookie-based authentication is supported. Clients must explicitly provide
   * the authorization token in the `Authorization: Bearer <token>` request header.
   */
  @Get('authorize')
  async authorize(
    @Query('client_id') clientId: string,
    @Query('redirect_uri') redirectUri: string,
    @Query('response_type') responseType: string,
    @Query('scope') scope: string,
    @Query('state') state: string,
    @Query('nonce') nonce: string,
    @Query('code_challenge') codeChallenge: string,
    @Query('code_challenge_method') codeChallengeMethod: string,
    @Query('prompt') prompt: string,
    @Query('screen') screen: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const isSilentRefresh = prompt === 'none';

    // Extract token from Authorization header only (no legacy cookie support)
    const authHeader = req.headers.authorization;
    const authToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : undefined;
    const user = authToken ? await this.oauthService.validateJwt(authToken) : null;

    // Handle silent refresh
    if (isSilentRefresh) {
      const targetOrigin = this.extractOrigin(redirectUri);

      if (!user) {
        return this.sendSilentRefreshResponse(
          res,
          { error: 'login_required', error_description: 'User is not authenticated', state },
          targetOrigin,
        );
      }

      try {
        const code = await this.oauthService.authorize(user.userId, {
          clientId, redirectUri, responseType, scope, state, nonce, codeChallenge, codeChallengeMethod,
        });

        // Generate session_state for OIDC Session Management
        const sessionState = this.tokenService.generateSessionState(clientId, user.userId);

        return this.sendSilentRefreshResponse(res, { code, state, session_state: sessionState }, targetOrigin);
      } catch (error) {
        return this.sendSilentRefreshResponse(
          res,
          { error: 'server_error', error_description: error instanceof Error ? error.message : 'Authorization failed', state },
          targetOrigin,
        );
      }
    }

    // Build authorize URL for after login
    const authorizeParams = new URLSearchParams();
    if (clientId) authorizeParams.set('client_id', clientId);
    if (redirectUri) authorizeParams.set('redirect_uri', redirectUri);
    if (responseType) authorizeParams.set('response_type', responseType);
    if (scope) authorizeParams.set('scope', scope);
    if (state) authorizeParams.set('state', state);
    if (nonce) authorizeParams.set('nonce', nonce);
    if (codeChallenge) authorizeParams.set('code_challenge', codeChallenge);
    if (codeChallengeMethod) authorizeParams.set('code_challenge_method', codeChallengeMethod);

    const oauthAuthorizeUrl = `/oauth/authorize?${authorizeParams.toString()}`;

    // If screen=signup, redirect to signup page
    if (screen === 'signup') {
      const frontendUrl = this.configService.get<string>('BASE_URL', 'http://localhost:8000');
      const authParams = new URLSearchParams();
      authParams.set('redirect_uri', oauthAuthorizeUrl);
      if (clientId) authParams.set('client_id', clientId);
      return res.redirect(`${frontendUrl}/auth/signup?${authParams.toString()}`);
    }

    if (!user) {
      const frontendUrl = this.configService.get<string>('BASE_URL', 'http://localhost:8000');
      const authParams = new URLSearchParams();
      authParams.set('redirect_uri', oauthAuthorizeUrl);
      if (clientId) authParams.set('client_id', clientId);
      return res.redirect(`${frontendUrl}/auth/login?${authParams.toString()}`);
    }

    // Validate redirect_uri
    const validation = await this.oauthService.validateRedirectUri(clientId, redirectUri);
    if (!validation.valid) {
      throw new BadRequestException(validation.reason || `Invalid redirect_uri: ${redirectUri}`);
    }

    // Extract tenant from redirect_uri
    const { tenantId, tenantSubdomain } = await this.extractTenantFromRedirectUri(redirectUri);

    try {
      const code = await this.oauthService.authorize(user.userId, {
        clientId, redirectUri, responseType, scope, state, nonce, codeChallenge, codeChallengeMethod,
        tenantId, tenantSubdomain,
      });

      // Generate session_state for OIDC Session Management
      const sessionState = this.tokenService.generateSessionState(clientId, user.userId);

      const finalRedirectUrl = new URL(redirectUri);
      finalRedirectUrl.searchParams.set('code', code);
      if (state) finalRedirectUrl.searchParams.set('state', state);
      finalRedirectUrl.searchParams.set('session_state', sessionState);

      return res.redirect(finalRedirectUrl.toString());
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        // No legacy cookie cleanup needed - tokens are header-only
        const frontendUrl = this.configService.get<string>('BASE_URL', 'http://localhost:8000');
        return res.redirect(`${frontendUrl}/auth/login?redirect_uri=${encodeURIComponent(oauthAuthorizeUrl)}`);
      }
      throw error;
    }
  }

  /**
   * Token Endpoint
   */
  @Post('token')
  @HttpCode(HttpStatus.OK)
  async token(
    @Body('grant_type') grantType: string,
    @Body('code') code: string,
    @Body('redirect_uri') redirectUri: string,
    @Body('client_id') clientId: string,
    @Body('client_secret') clientSecret: string,
    @Body('refresh_token') refreshToken: string,
    @Body('code_verifier') codeVerifier: string,
    @Body('scope') scope: string,
  ) {
    return this.oauthService.token({
      grantType, code, redirectUri, clientId, clientSecret, refreshToken, codeVerifier, scope,
    });
  }

  /**
   * Trampoline Endpoint - Server-Side Token Exchange
   * Returns JSON with access_token and sets refresh_token as httpOnly cookie
   */
  @Get('trampoline')
  async trampoline(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Query('error_description') errorDescription: string,
    @Query('redirect') finalRedirect: string,
    @Query('client_id') clientId: string,
    @Query('redirect_uri') redirectUri: string,
    @Res() res: Response,
  ) {
    const safeRedirect = this.validateRedirectPath(finalRedirect);

    if (error) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        error,
        error_description: errorDescription,
        redirect: safeRedirect,
      });
    }

    if (!code || !state) {
      throw new BadRequestException('Missing code or state parameter');
    }

    const colonIndex = state.indexOf(':');
    if (colonIndex === -1) {
      throw new BadRequestException('Invalid state format - missing verifier');
    }

    const encodedVerifier = state.substring(colonIndex + 1);
    let codeVerifier: string;

    try {
      const padded = encodedVerifier + '==='.slice(0, (4 - (encodedVerifier.length % 4)) % 4);
      codeVerifier = Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
    } catch (err) {
      throw new BadRequestException('Invalid state format - could not decode verifier');
    }

    try {
      const tokens = await this.oauthService.token({
        grantType: 'authorization_code',
        code,
        redirectUri: redirectUri || `${this.issuer}/oauth/trampoline`,
        clientId: clientId || '',
        codeVerifier,
      });

      // Set refresh_token as httpOnly cookie only
      if (tokens.refresh_token) {
        res.cookie('refresh_token', tokens.refresh_token, getRefreshTokenCookieOptions());
      }

      // Return JSON response with tokens (access_token in body, refresh_token in cookie)
      return res.json({
        success: true,
        access_token: tokens.access_token,
        expires_in: tokens.expires_in,
        ...(tokens.refresh_token && { refresh_token: tokens.refresh_token }),
        redirect: safeRedirect,
      });
    } catch (err) {
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        error: 'token_exchange_failed',
        error_description: err instanceof Error ? err.message : 'Unknown error',
        redirect: safeRedirect,
      });
    }
  }

  /**
   * Token Introspection Endpoint (RFC 7662)
   */
  @Post('introspect')
  @HttpCode(HttpStatus.OK)
  async introspect(
    @Body('token') token: string,
    @Body('token_type_hint') tokenTypeHint?: string,
  ) {
    if (!token) {
      throw new BadRequestException('Token is required');
    }
    return this.oauthService.introspect(token, tokenTypeHint);
  }

  /**
   * Token Revocation Endpoint (RFC 7009)
   */
  @Post('revoke')
  @HttpCode(HttpStatus.OK)
  async revoke(
    @Body('token') token: string,
    @Body('token_type_hint') tokenTypeHint?: string,
  ) {
    if (!token) {
      throw new BadRequestException('Token is required');
    }
    await this.oauthService.revokeToken(token, tokenTypeHint);
    return { success: true };
  }

  /**
   * OIDC Session Management - Check Session Iframe
   *
   * This endpoint serves an HTML page that listens for postMessage
   * requests from the RP to check the current session state.
   *
   * @see https://openid.net/specs/openid-connect-session-1_0.html
   */
  @Get('check-session')
  @Header('Content-Type', 'text/html')
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate')
  @Header('Pragma', 'no-cache')
  checkSessionIframe() {
    // Serve the OIDC check_session_iframe HTML
    // This page listens for postMessage with client_id and session_state,
    // then responds with "changed" or "unchanged" based on cookie state
    return `<!DOCTYPE html>
<html>
<head>
  <title>OIDC Session State Checker</title>
  <script>
    // OIDC Session Management 1.0 - RP-Initiated Logout
    // https://openid.net/specs/openid-connect-session-1_0.html

    (function() {
      'use strict';

      // Configuration
      var ISSUER = ${JSON.stringify(this.issuer)};
      var COOKIE_NAME = 'idp_session';
      var STORAGE_KEY = 'oidc_session_state';

      // Helper: Get cookie value
      function getCookie(name) {
        var value = '; ' + document.cookie;
        var parts = value.split('; ' + name + '=');
        if (parts.length === 2) return parts.pop().split(';').shift();
        return null;
      }

      // Helper: Get stored session state
      function getStoredState() {
        try {
          return sessionStorage.getItem(STORAGE_KEY);
        } catch (e) {
          return null;
        }
      }

      // Helper: Store session state
      function setStoredState(state) {
        try {
          sessionStorage.setItem(STORAGE_KEY, state);
        } catch (e) {
          // Ignore storage errors
        }
      }

      // Compute session state according to OIDC spec
      // session_state = SHA256(client_id + ' ' + issuer + ' ' + browser_state + ' ' + salt) + '.' + salt
      function computeSessionState(clientId, sessionState) {
        var parts = sessionState.split('.');
        if (parts.length !== 2) return 'error';

        var salt = parts[1];
        var browserState = getCookie(COOKIE_NAME) || '';

        // Create the string to hash: client_id + ' ' + issuer + ' ' + browser_state + ' ' + salt
        var toHash = clientId + ' ' + ISSUER + ' ' + browserState + ' ' + salt;

        // Use a simple hash for now (in production, use proper SHA-256)
        var hash = 0;
        for (var i = 0; i < toHash.length; i++) {
          var char = toHash.charCodeAt(i);
          hash = ((hash << 5) - hash) + char;
          hash = hash & hash;
        }
        var computedHash = Math.abs(hash).toString(16);

        return computedHash + '.' + salt;
      }

      // Check session state
      function checkSession(clientId, sessionState) {
        var storedState = getStoredState();

        // First time - store and return unchanged
        if (!storedState) {
          setStoredState(sessionState);
          return 'unchanged';
        }

        // Compute expected state
        var computedState = computeSessionState(clientId, sessionState);

        // If computed state doesn't match the provided one, session changed
        if (computedState !== sessionState) {
          return 'changed';
        }

        // Compare with stored state
        if (storedState === sessionState) {
          return 'unchanged';
        }

        return 'changed';
      }

      // Listen for postMessage
      window.addEventListener('message', function(event) {
        // Validate origin - only accept messages from valid origins
        var origin = event.origin;
        if (!origin || origin === 'null') {
          return;
        }

        // Parse message
        var data = event.data;
        if (typeof data !== 'string') {
          return;
        }

        // Parse "client_id session_state" format
        var parts = data.split(' ');
        if (parts.length !== 2) {
          event.source.postMessage('error: invalid message format', event.origin);
          return;
        }

        var clientId = parts[0];
        var sessionState = parts[1];

        if (!clientId || !sessionState) {
          event.source.postMessage('error: missing parameters', event.origin);
          return;
        }

        // Check session and respond
        var result = checkSession(clientId, sessionState);
        event.source.postMessage(result, event.origin);
      }, false);

      // Notify parent we're ready (if applicable)
      if (window.parent !== window) {
        window.parent.postMessage('oidc_check_session_iframe_ready', '*');
      }
    })();
  </script>
</head>
<body>
  <!-- OIDC Session State Checker - This iframe monitors IDP session state -->
</body>
</html>`;
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  private extractOrigin(url: string | undefined): string {
    if (!url) {
      throw new BadRequestException('redirect_uri is required for silent refresh');
    }
    try {
      const origin = new URL(url).origin;
      if (origin === 'null') {
        throw new BadRequestException('Invalid redirect_uri origin');
      }
      return origin;
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('Invalid redirect_uri format');
    }
  }

  private validateRedirectPath(redirect: string | undefined): string {
    if (!redirect) return '/';
    if (!redirect.startsWith('/') || redirect.startsWith('//')) return '/';
    return redirect;
  }

  private sendSilentRefreshResponse(
    res: Response,
    data: { code?: string; error?: string; error_description?: string; state?: string; session_state?: string },
    targetOrigin = '*',
  ) {
    const html = `<!DOCTYPE html><html><head><title>Silent Refresh</title></head><body><script>(function(){var result=${JSON.stringify({ type: 'silent_refresh_response', ...data })};if(window.parent&&window.parent!==window){window.parent.postMessage(result,${JSON.stringify(targetOrigin)});}})();</script></body></html>`;
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
    return res.send(html);
  }

  private async extractTenantFromRedirectUri(
    redirectUri: string,
  ): Promise<{ tenantId?: string; tenantSubdomain?: string }> {
    try {
      const redirectUrl = new URL(redirectUri);
      const hostname = redirectUrl.hostname;
      let tenantSubdomain: string | undefined;

      if (hostname.endsWith('.localhost')) {
        const parts = hostname.split('.');
        if (parts.length >= 2 && parts[0] !== 'localhost') {
          tenantSubdomain = parts[0];
        }
      } else if (hostname.includes('.')) {
        const parts = hostname.split('.');
        if (parts.length >= 3) {
          tenantSubdomain = parts[0];
        }
      }

      if (tenantSubdomain) {
        const tenant = await this.prisma.tenant.findFirst({
          where: { slug: tenantSubdomain },
          select: { id: true, slug: true },
        });
        if (tenant) {
          return { tenantId: tenant.id, tenantSubdomain };
        }
      }

      return {};
    } catch {
      return {};
    }
  }
}
