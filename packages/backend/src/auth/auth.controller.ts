import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UseGuards,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  BadRequestException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response, Request as ExpressRequest } from 'express';
import { AuthService } from './auth.service';
import { MfaService } from './mfa/mfa.service';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { OptionalAuthGuard } from './guards/optional-auth.guard';
import { AuthenticatedRequest } from './interfaces/auth.interface';
import { getBaseCookieOptions, getRefreshTokenCookieOptions } from '../common/utils/cookie.utils';
import { OAuthSessionService } from '../oauth/oauth-session.service';
import { KeyService } from '../oauth/key.service';
import * as crypto from 'crypto';
import { redirectTokens } from './redirect-tokens';

const getClearCookieOptions = getBaseCookieOptions;
const getRefreshCookieOptions = getRefreshTokenCookieOptions;

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
    // 1. Read refresh_token from httpOnly cookie
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const refreshToken = (req as any).cookies?.['refresh_token'];

    if (!refreshToken) {
      this.logger.debug('[Refresh] No refresh_token cookie found');
      throw new UnauthorizedException('No refresh token provided');
    }

    let jwtPayload: {
      sid: string;
      sub: string;
      aud: string;
      scope: string;
      tenantId?: string;
      tenantSubdomain?: string;
    };

    // 2. Validate JWT using OAuthSessionService (verifyRefreshTokenJwt)
    try {
      jwtPayload = await this.oauthSessionService.verifyRefreshTokenJwt(refreshToken);
      this.logger.debug(`[Refresh] Verified refresh JWT, session ID: ${jwtPayload.sid}`);
    } catch (error) {
      this.logger.debug(`[Refresh] JWT verification failed: ${error}`);
      // Clear the invalid refresh_token cookie
      res.clearCookie('refresh_token', getClearCookieOptions());
      throw new UnauthorizedException('Invalid refresh token');
    }

    // 3. Lookup session in database and verify validity
    const session = await this.prisma.refreshToken.findUnique({
      where: { id: jwtPayload.sid },
      include: {
        user: {
          include: {
            memberships: {
              where: { status: 'ACTIVE' },
              include: { tenant: true },
            },
          },
        },
        application: true,
      },
    });

    if (!session) {
      this.logger.debug(`[Refresh] Session ${jwtPayload.sid} not found in database`);
      res.clearCookie('refresh_token', getClearCookieOptions());
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Check if session is revoked or expired (Token Ghosting "ghost check")
    if (session.revoked || session.revokedAt) {
      this.logger.warn(`[Token Ghosting] Session ${session.id} has been revoked`);
      res.clearCookie('refresh_token', getClearCookieOptions());
      throw new UnauthorizedException('Session has been revoked');
    }

    if (session.expiresAt < new Date()) {
      this.logger.debug(`[Refresh] Session ${session.id} has expired`);
      res.clearCookie('refresh_token', getClearCookieOptions());
      throw new UnauthorizedException('Session expired');
    }

    if (!session.application.isActive) {
      this.logger.warn(`[Refresh] Application ${session.application.clientId} is disabled`);
      res.clearCookie('refresh_token', getClearCookieOptions());
      throw new UnauthorizedException('Application is disabled');
    }

    // 4. Revoke old refresh token (Token Ghosting rotation)
    await this.prisma.refreshToken.update({
      where: { id: session.id },
      data: {
        revoked: true,
        revokedAt: new Date(),
      },
    });
    this.logger.debug(`[Token Ghosting] Revoked old session ${session.id}`);

    // 5. Create new refresh token session
    const newSession = await this.prisma.refreshToken.create({
      data: {
        scope: session.scope,
        expiresAt: new Date(Date.now() + session.application.refreshTokenTtl * 1000),
        userId: session.userId,
        applicationId: session.applicationId,
        revoked: false,
        tenantId: session.tenantId,
        tenantSubdomain: session.tenantSubdomain,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        userAgent: (req as any).headers?.['user-agent'] || null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ipAddress: (req as any).ip || null,
      },
    });

    // Generate new refresh token JWT with new session ID
    const newRefreshToken = await this.oauthSessionService.generateRefreshTokenJwt({
      sid: newSession.id,
      sub: session.user.id,
      aud: session.application.clientId,
      scope: session.scope || 'openid profile email',
      tenantId: session.tenantId || undefined,
      tenantSubdomain: session.tenantSubdomain || undefined,
      expiresIn: session.application.refreshTokenTtl,
    });

    // 6. Generate new access token using KeyService
    const scopes = (session.scope || 'openid profile email').split(' ');

    // Build access token payload
    const accessTokenPayload: Record<string, unknown> = {
      scope: session.scope || 'openid profile email',
    };

    // Include tenant scope if present
    if (session.tenantId) {
      accessTokenPayload.tenant_id = session.tenantId;
    }
    if (session.tenantSubdomain) {
      accessTokenPayload.tenant_subdomain = session.tenantSubdomain;
    }

    // Add user claims based on scopes
    if (scopes.includes('email')) {
      accessTokenPayload.email = session.user.email;
    }
    if (scopes.includes('profile')) {
      accessTokenPayload.given_name = session.user.givenName;
      accessTokenPayload.family_name = session.user.familyName;
    }

    // Add roles/permissions if tenant-scoped
    if (session.tenantId) {
      const membership = session.user.memberships.find(
        (m) => m.tenant.id === session.tenantId,
      );
      if (membership) {
        // Fetch roles for this membership
        const membershipWithRoles = await this.prisma.membership.findFirst({
          where: {
            userId: session.userId,
            tenantId: session.tenantId,
            status: 'ACTIVE',
          },
          include: {
            membershipTenantRoles: {
              include: {
                tenantRole: {
                  select: { slug: true, permissions: true },
                },
              },
            },
            membershipRoles: {
              where: { role: { applicationId: session.applicationId } },
              include: { role: { select: { slug: true } } },
            },
          },
        });

        if (membershipWithRoles) {
          const tenantRoles = membershipWithRoles.membershipTenantRoles.map(
            (mtr) => mtr.tenantRole.slug,
          );
          const tenantPermissions = membershipWithRoles.membershipTenantRoles.flatMap(
            (mtr) => mtr.tenantRole.permissions,
          );
          const appRoles = membershipWithRoles.membershipRoles.map((mr) => mr.role.slug);

          if (tenantRoles.length > 0) {
            accessTokenPayload.tenant_roles = tenantRoles;
            accessTokenPayload.tenant_permissions = [...new Set(tenantPermissions)];
          }
          if (appRoles.length > 0) {
            accessTokenPayload.app_roles = appRoles;
          }
        }
      }
    }

    // Sign the access token
    const accessToken = await this.keyService.signJwt(accessTokenPayload, {
      subject: session.user.id,
      audience: session.application.clientId,
      issuer: this.issuer,
      expiresIn: session.application.accessTokenTtl,
    });

    // 7. Set new refresh_token cookie (httpOnly, secure, sameSite)
    res.cookie('refresh_token', newRefreshToken, getRefreshCookieOptions());

    this.logger.debug(`[Refresh] Token rotation complete for user ${session.user.id}, session ${newSession.id}`);

    // 8. Return access token in JSON body (NO access token cookie!)
    return {
      access_token: accessToken,
      expires_in: session.application.accessTokenTtl,
      token_type: 'Bearer',
    };
  }

  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  /**
   * Login with email/password
   */
  @Post('login')
  async login(@Body() dto: LoginDto, @Res() res: Response) {
    const result = await this.authService.login(dto);

    if (result.mfaRequired && result.mfaChallengeToken) {
      console.log(`[Login] MFA required for ${dto.email}`);
      return res.json({
        mfaRequired: true,
        mfaChallengeToken: result.mfaChallengeToken,
        redirectUri: dto.redirectUri,
        clientId: dto.clientId,
      });
    }

    if (!result.accessToken || !result.user) {
      throw new BadRequestException('Login failed - no access token generated');
    }

    // Set refresh token as httpOnly cookie if available
    // Note: refreshToken will be returned by auth service in split-token architecture
    const loginResult = result as typeof result & { refreshToken?: string };
    if (loginResult.refreshToken) {
      res.cookie('refresh_token', loginResult.refreshToken, getRefreshTokenCookieOptions());
    }

    console.log(`[Login] Success for ${dto.email}`);

    // Handle redirect flows - no access token cookies, just redirect
    if (dto.redirectUri) {
      if (!dto.redirectUri.startsWith('/') || dto.redirectUri.startsWith('//')) {
        throw new BadRequestException('Invalid redirect URI');
      }
      return res.redirect(302, dto.redirectUri);
    }

    let app: { initiateLoginUri: string | null; redirectUris: string[] } | null = null;
    if (dto.clientId) {
      app = await this.prisma.application.findUnique({
        where: { clientId: dto.clientId },
        select: { initiateLoginUri: true, redirectUris: true },
      });
    }

    if (!dto.clientId) {
      return res.redirect(302, '/auth/app-picker');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: result.user.id },
      include: {
        memberships: {
          where: { status: 'ACTIVE' },
          include: { tenant: { select: { id: true, name: true, slug: true } } },
        },
      },
    });

    const memberships = user?.memberships || [];

    const buildRedirectUrl = (tenantSlug: string): string => {
      if (!app?.initiateLoginUri) {
        throw new BadRequestException('Application initiateLoginUri is not configured.');
      }
      return app.initiateLoginUri.replace('{tenant}', tenantSlug);
    };

    if (memberships.length === 1) {
      const redirectUrl = buildRedirectUrl(memberships[0].tenant.slug);
      return res.redirect(302, redirectUrl);
    }

    if (memberships.length > 1) {
      const params = new URLSearchParams();
      params.set('client_id', dto.clientId);
      return res.redirect(302, `/auth/org-picker?${params.toString()}`);
    }

    return res.redirect(302, '/auth/app-picker');
  }

  /**
   * Verify MFA and complete login
   */
  @Post('mfa/verify')
  @HttpCode(HttpStatus.OK)
  async verifyMfa(
    @Body() body: { challengeToken: string; code: string; redirectUri?: string; clientId?: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.verifyMfaAndCompleteLogin(body.challengeToken, body.code);

    // Set refresh token as httpOnly cookie if available
    // Note: refreshToken will be returned by auth service in split-token architecture
    const mfaResult = result as typeof result & { refreshToken?: string };
    if (mfaResult.refreshToken) {
      res.cookie('refresh_token', mfaResult.refreshToken, getRefreshTokenCookieOptions());
    }

    // Calculate expires_in (7 days in seconds - matches JWT expiry)
    const expiresIn = 7 * 24 * 60 * 60;

    // Handle redirect flow
    let redirectUrl: string | null = null;
    if (body.redirectUri && body.redirectUri.startsWith('/') && !body.redirectUri.startsWith('//')) {
      redirectUrl = body.redirectUri;
    } else if (body.clientId) {
      const app = await this.prisma.application.findUnique({
        where: { clientId: body.clientId },
        select: { initiateLoginUri: true },
      });

      if (app?.initiateLoginUri && result.memberships.length === 1) {
        redirectUrl = app.initiateLoginUri.replace('{tenant}', result.memberships[0].tenant.slug);
      } else if (result.memberships.length > 1) {
        redirectUrl = `/auth/org-picker?client_id=${body.clientId}`;
      }
    }

    // If redirect URL is set, redirect without returning JSON
    if (redirectUrl) {
      return res.redirect(302, redirectUrl);
    }

    // Return JSON response with access token in body
    return {
      success: true,
      access_token: result.accessToken,
      expires_in: expiresIn,
      user: result.user,
      memberships: result.memberships,
    };
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
  async getApps(@Req() req: AuthenticatedRequest) {
    if (!req.user) return { authenticated: false, applications: [] };

    const applications = await this.prisma.application.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        clientId: true,
        initiateLoginUri: true,
        brandingLogoUrl: true,
        brandingIconUrl: true,
        brandingPrimaryColor: true,
      },
      orderBy: { name: 'asc' },
    });

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
    const { token } = body;
    if (!token) return { success: false, error: 'Token is required' };

    const tokenData = redirectTokens.get(token);
    if (!tokenData) return { success: false, error: 'Invalid or expired token' };
    if (tokenData.expiresAt < new Date()) {
      redirectTokens.delete(token);
      return { success: false, error: 'Token has expired' };
    }

    redirectTokens.delete(token);

    const user = await this.prisma.user.findUnique({
      where: { id: tokenData.userId },
      include: {
        memberships: {
          where: { status: 'ACTIVE' },
          include: { tenant: { select: { id: true, name: true, slug: true } } },
        },
      },
    });

    if (!user) return { success: false, error: 'User not found' };

    // Generate access token
    const accessToken = await this.authService.generateJwt(user.id, user.email || '');

    // Create refresh token session (Token Ghosting)
    const refreshTokenRecord = await this.prisma.refreshToken.create({
      data: {
        scope: 'openid profile email',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        userId: user.id,
        applicationId: 'internal', // internal app for auth flows
        revoked: false,
      },
    });

    // Generate signed refresh JWT with session ID
    const refreshToken = await this.oauthSessionService.generateRefreshTokenJwt({
      sid: refreshTokenRecord.id,
      sub: user.id,
      aud: 'internal',
      scope: 'openid profile email',
      expiresIn: 30 * 24 * 60 * 60, // 30 days
    });

    // Set refresh token as httpOnly cookie
    res.cookie('refresh_token', refreshToken, getRefreshTokenCookieOptions());

    console.log(`[Auth] Session established for user ${user.email} via exchange-token`);

    // Calculate expires_in (7 days in seconds - matches JWT expiry)
    const expiresIn = 7 * 24 * 60 * 60;

    return {
      success: true,
      access_token: accessToken,
      expires_in: expiresIn,
      user: {
        id: user.id,
        email: user.email,
        givenName: user.givenName,
        familyName: user.familyName,
        name: [user.givenName, user.familyName].filter(Boolean).join(' ') || user.email,
      },
      memberships: user.memberships.map((m) => ({ id: m.id, tenant: m.tenant })),
    };
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  async getProfile(@Req() req: AuthenticatedRequest) {
    return this.authService.getProfile(req.user.id);
  }
}
