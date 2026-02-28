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
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response, Request } from 'express';
import { OAuthService } from './oauth.service';
import { KeyService } from './key.service';
import { PrismaService } from '../prisma/prisma.service';
import { getBaseCookieOptions } from '../common/utils/cookie.utils';

/**
 * OAuth Controller
 * Core OAuth/OIDC endpoints: authorize, token, introspect, revoke
 * Session management is in OAuthSessionController
 */
@Controller('oauth')
export class OAuthController {
  private readonly issuer: string;

  constructor(
    private readonly oauthService: OAuthService,
    private readonly keyService: KeyService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.issuer = this.configService.getOrThrow<string>('BASE_URL');
  }

  /**
   * Tenant-Scoped Authorization Endpoint
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
    const authToken = req.cookies?.['auth_token'];
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
    const authToken = req.cookies?.['auth_token'];
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
        return this.sendSilentRefreshResponse(res, { code, state }, targetOrigin);
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

      const finalRedirectUrl = new URL(redirectUri);
      finalRedirectUrl.searchParams.set('code', code);
      if (state) finalRedirectUrl.searchParams.set('state', state);

      return res.redirect(finalRedirectUrl.toString());
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        const clearOpts = getBaseCookieOptions();
        res.clearCookie('auth_token', clearOpts);
        res.clearCookie('idp_session', clearOpts);

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
      const errorParams = new URLSearchParams();
      errorParams.set('error', error);
      if (errorDescription) errorParams.set('error_description', errorDescription);
      const separator = safeRedirect.includes('?') ? '&' : '?';
      return res.redirect(`${safeRedirect}${separator}${errorParams.toString()}`);
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

      const cookieOptions = { ...getBaseCookieOptions(), maxAge: tokens.expires_in * 1000 };
      res.cookie('auth_token', tokens.access_token, cookieOptions);

      if (tokens.refresh_token) {
        res.cookie('refresh_token', tokens.refresh_token, {
          ...getBaseCookieOptions(),
          maxAge: 30 * 24 * 60 * 60 * 1000,
        });
      }

      return res.redirect(safeRedirect);
    } catch (err) {
      const errorParams = new URLSearchParams();
      errorParams.set('error', 'token_exchange_failed');
      errorParams.set('error_description', err instanceof Error ? err.message : 'Unknown error');
      const separator = safeRedirect.includes('?') ? '&' : '?';
      return res.redirect(`${safeRedirect}${separator}${errorParams.toString()}`);
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
    data: { code?: string; error?: string; error_description?: string; state?: string },
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
