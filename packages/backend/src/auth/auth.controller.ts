import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { Response, Request as ExpressRequest } from 'express';
import { AuthService } from './auth.service';
import { AuthFlowService } from './auth-flow.service';
import { MfaService } from './mfa/mfa.service';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { OptionalAuthGuard } from './guards/optional-auth.guard';
import { AuthenticatedRequest } from './interfaces/auth.interface';
import { getBaseCookieOptions } from '../common/utils/cookie.utils';
import { OAuthSessionService } from '../oauth/oauth-session.service';
import { KeyService } from '../oauth/key.service';
import * as crypto from 'crypto';
import { redirectTokens } from './redirect-tokens';

const getClearCookieOptions = getBaseCookieOptions;

/**
 * Auth Controller
 * Handles login, logout, session management, and profile
 * MFA management endpoints are in AuthMfaController
 */
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);
  private readonly issuer: string;

  constructor(
    private readonly authService: AuthService,
    private readonly authFlowService: AuthFlowService,
    private readonly prisma: PrismaService,
    private readonly mfaService: MfaService,
    private readonly oauthSessionService: OAuthSessionService,
    private readonly keyService: KeyService,
    private readonly configService: ConfigService,
  ) {
    this.issuer = this.configService.getOrThrow<string>('BASE_URL');
  }

  /**
   * Refresh Token Endpoint
   *
   * Implements Token Ghosting refresh flow:
   * 1. Read refresh_token from httpOnly cookie
   * 2. Validate JWT signature using OAuthSessionService
   * 3. Verify session exists and is not revoked/expired
   * 4. Revoke old session (Token Ghosting rotation)
   * 5. Generate new access token and refresh token
   * 6. Set new refresh_token cookie (httpOnly, secure, sameSite)
   * 7. Return { access_token, expires_in } in JSON body
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refreshToken(
    @Req() req: ExpressRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ access_token: string; expires_in: number; token_type: string }> {
    return this.authFlowService.refreshToken(req, res);
  }
  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60_000 } }) // strict: credential creation
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  /**
   * Login with email/password
   */
  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60_000 } }) // strict: brute-force target
  async login(@Body() dto: LoginDto, @Res() res: Response) {
    return this.authFlowService.login(dto, res);
  }

  /**
   * Verify MFA and complete login
   */
  @Post('mfa/verify')
  @Throttle({ default: { limit: 5, ttl: 60_000 } }) // strict: TOTP brute-force target
  @HttpCode(HttpStatus.OK)
  async verifyMfa(
    @Body() body: { challengeToken: string; code: string; redirectUri?: string; clientId?: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authFlowService.verifyMfa(body, res);
  }
  @Get('me')
  @UseGuards(OptionalAuthGuard)
  async getMe(@Req() req: AuthenticatedRequest) {
    if (!req.user) return { authenticated: false };

    const user = await this.prisma.user.findUnique({
      where: { id: req.user.id },
      include: {
        memberships: {
          where: { status: 'ACTIVE' },
          include: { tenant: { select: { id: true, name: true, slug: true } } },
        },
      },
    });

    if (!user) return { authenticated: false };

    return {
      authenticated: true,
      user: {
        id: user.id,
        email: user.email,
        givenName: user.givenName,
        familyName: user.familyName,
        displayName: user.displayName,
        pictureUrl: user.pictureUrl,
      },
      memberships: user.memberships.map((m) => ({ id: m.id, tenant: m.tenant })),
    };
  }

  @Get('apps')
  @UseGuards(OptionalAuthGuard)
  async getApps(@Req() req: AuthenticatedRequest, @Query('tenant') tenantSlug?: string) {
    if (!req.user) return { authenticated: false, applications: [] };

    // When a tenant slug is supplied (tenant-first flow), scope the apps to that
    // tenant — but only after confirming the requesting user actually has an
    // ACTIVE membership there, so we never leak apps for tenants they're not in.
    let tenantIdFilter: string | undefined;
    if (tenantSlug) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { slug: tenantSlug },
        select: { id: true },
      });

      const membership = tenant
        ? await this.prisma.membership.findFirst({
            where: { userId: req.user.id, tenantId: tenant.id, status: 'ACTIVE' },
            select: { id: true },
          })
        : null;

      if (!tenant || !membership) {
        console.log(`[getApps] User ${req.user.id} not in tenant '${tenantSlug}' → empty app list`);
        return { authenticated: true, applications: [] };
      }
      tenantIdFilter = tenant.id;
    }

    // Only surface apps the user can actually launch:
    //  - the user holds an ACTIVE AppAccess entitlement (scoped to the tenant when given)
    //  - the app is a SPA (MACHINE apps have no login UI to redirect the user to)
    // There is no "request access" flow, so apps without access are simply hidden.
    const accessGrants = await this.prisma.appAccess.findMany({
      where: {
        userId: req.user.id,
        status: 'ACTIVE',
        ...(tenantIdFilter ? { tenantId: tenantIdFilter } : {}),
      },
      select: { applicationId: true },
    });
    const accessibleAppIds = [...new Set(accessGrants.map((g) => g.applicationId))];

    if (accessibleAppIds.length === 0) {
      return { authenticated: true, applications: [] };
    }

    // clientId + initiateLoginUri live on the SPA ApplicationClient now.
    const applicationsRaw = await this.prisma.application.findMany({
      where: {
        id: { in: accessibleAppIds },
        isActive: true,
        clients: { some: { type: 'SPA' } },
      },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        brandingLogoUrl: true,
        brandingIconUrl: true,
        brandingPrimaryColor: true,
        clients: {
          where: { type: 'SPA' },
          select: { clientId: true, initiateLoginUri: true },
          take: 1,
        },
      },
      orderBy: { name: 'asc' },
    });

    const applications = applicationsRaw.map(({ clients, ...app }) => ({
      ...app,
      clientId: clients[0]?.clientId ?? null,
      initiateLoginUri: clients[0]?.initiateLoginUri ?? null,
    }));

    return { authenticated: true, applications };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(OptionalAuthGuard)
  async logout(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
    @Body('redirect_uri') redirectUri?: string,
  ) {
    const userId = req.user?.id;
    if (userId) {
      console.log(`[AUDIT] User logout: userId=${userId}, email=${req.user?.email}`);
    }

    const clearOpts = getClearCookieOptions();
    res.clearCookie('idp_session', clearOpts);
    res.clearCookie('auth_token', clearOpts);
    res.clearCookie('refresh_token', clearOpts);

    return {
      success: true,
      redirect_uri: redirectUri || null,
      loggedUser: userId ? { id: userId, email: req.user?.email } : null,
    };
  }

  @Get('logout/redirect')
  async logoutRedirect(@Query('post_logout_redirect_uri') postLogoutRedirectUri: string, @Res() res: Response) {
    const clearOpts = getClearCookieOptions();
    res.clearCookie('idp_session', clearOpts);
    res.clearCookie('auth_token', clearOpts);
    res.clearCookie('refresh_token', clearOpts);

    if (postLogoutRedirectUri) {
      try {
        const redirectUrl = new URL(postLogoutRedirectUri);
        const allowedPatterns = [
          /^https?:\/\/([a-z0-9-]+\.)?localhost(:\d+)?$/,
          /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
        ];
        const isAllowed = allowedPatterns.some((pattern) => pattern.test(redirectUrl.origin));
        if (isAllowed) {
          return res.redirect(postLogoutRedirectUri);
        }
      } catch {
        // Invalid URL - fall through
      }
    }

    res.setHeader('Content-Type', 'text/html');
    return res.send(`
      <!DOCTYPE html>
      <html><head><title>Logged Out</title><meta name="viewport" content="width=device-width, initial-scale=1">
      <style>*{box-sizing:border-box}body{font-family:system-ui,sans-serif;display:flex;align-items:center;
      justify-content:center;min-height:100vh;margin:0;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white}
      .container{text-align:center;padding:2rem;max-width:400px}.icon{width:80px;height:80px;background:rgba(255,255,255,0.2);
      border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 1.5rem;font-size:2rem}
      h1{margin:0 0 0.5rem;font-size:1.75rem;font-weight:600}p{margin:0 0 2rem;opacity:0.9}
      .btn{display:inline-block;padding:0.75rem 2rem;background:white;color:#764ba2;text-decoration:none;border-radius:8px;font-weight:500}</style>
      </head><body><div class="container"><div class="icon">👋</div><h1>You've been logged out</h1>
      <p>Your session has been securely ended.</p><a href="/" class="btn">Sign in again</a></div></body></html>
    `);
  }

  @Post('redirect-token')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async generateRedirectToken(@Req() req: AuthenticatedRequest) {
    const token = crypto.randomBytes(32).toString('hex');
    const user = await this.prisma.user.findUnique({
      where: { id: req.user.id },
      select: { email: true },
    });

    redirectTokens.set(token, {
      userId: req.user.id,
      email: req.user.email || user?.email || '',
      expiresAt: new Date(Date.now() + 30 * 1000),
    });

    return { redirectToken: token };
  }

  @Post('exchange-token')
  @HttpCode(HttpStatus.OK)
  async exchangeToken(@Body() body: { token: string }, @Res({ passthrough: true }) res: Response) {
    return this.authFlowService.exchangeToken(body, res);
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  async getProfile(@Req() req: AuthenticatedRequest) {
    return this.authService.getProfile(req.user.id);
  }

  /**
   * Update the authenticated user's OWN editable profile fields.
   * Scoped strictly to req.user.id — a caller can never edit another user.
   */
  @Patch('profile')
  @UseGuards(JwtAuthGuard)
  async updateProfile(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.authService.updateProfile(req.user.id, dto);
  }

  /**
   * List the authenticated user's OWN active sessions.
   *
   * Console-facing companion to GET /oauth/sessions (which is guarded by the
   * RS256 OAuthTokenGuard). This one runs under JwtAuthGuard so the admin
   * console's internal token works. Always scoped to req.user.id.
   */
  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  async getSessions(@Req() req: AuthenticatedRequest) {
    return this.oauthSessionService.listSessions(req.user.id);
  }

  /**
   * Revoke ONE of the authenticated user's own sessions.
   *
   * Ownership is enforced in OAuthSessionService.revokeUserSession — a session
   * that doesn't exist OR belongs to another user returns 404 (no IDOR, no
   * existence leak).
   */
  @Delete('sessions/:sessionId')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async revokeSession(
    @Req() req: AuthenticatedRequest,
    @Param('sessionId') sessionId: string,
  ) {
    return this.oauthSessionService.revokeUserSession(req.user.id, sessionId);
  }
}
