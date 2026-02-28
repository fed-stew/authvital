import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UseGuards,
  Request,
  Res,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { MfaService } from './mfa/mfa.service';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { OptionalAuthGuard } from './guards/optional-auth.guard';
import { AuthenticatedRequest } from './interfaces/auth.interface';
import { getBaseCookieOptions, getSessionCookieOptions } from '../common/utils/cookie.utils';
import * as crypto from 'crypto';
import { redirectTokens } from './redirect-tokens';

const getIdpCookieOptions = getSessionCookieOptions;
const getClearCookieOptions = getBaseCookieOptions;

/**
 * Auth Controller
 * Handles login, logout, session management, and profile
 * MFA management endpoints are in AuthMfaController
 */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly prisma: PrismaService,
    private readonly mfaService: MfaService,
  ) {}

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

    res.cookie('auth_token', result.accessToken, getIdpCookieOptions());
    res.cookie('idp_session', result.accessToken, getIdpCookieOptions());

    console.log(`[Login] Success for ${dto.email}`);

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

    res.cookie('auth_token', result.accessToken, getIdpCookieOptions());
    res.cookie('idp_session', result.accessToken, getIdpCookieOptions());

    let redirectUrl = '/auth/app-picker';

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

    return { success: true, redirectUrl, user: result.user };
  }

  @Get('me')
  @UseGuards(OptionalAuthGuard)
  async getMe(@Request() req: AuthenticatedRequest) {
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
  async getApps(@Request() req: AuthenticatedRequest) {
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
    @Request() req: AuthenticatedRequest,
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
  async generateRedirectToken(@Request() req: AuthenticatedRequest) {
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

    const jwt = await this.authService.generateJwt(user.id, user.email || '');
    const isSecure = process.env.NODE_ENV === 'production';
    res.cookie('auth_token', jwt, {
      httpOnly: true,
      secure: isSecure,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000,
      path: '/',
    });

    console.log(`[Auth] Session established for user ${user.email} via exchange-token`);

    return {
      success: true,
      accessToken: jwt,
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
  async getProfile(@Request() req: AuthenticatedRequest) {
    return this.authService.getProfile(req.user.id);
  }
}
