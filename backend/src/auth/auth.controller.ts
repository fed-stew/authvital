import {
  Controller,
  Post,
  Get,
  Delete,
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

// Alias for clarity in this controller
const getIdpCookieOptions = getSessionCookieOptions;
const getClearCookieOptions = getBaseCookieOptions;

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
   * Sets IDP session cookie and returns 302 redirect on success
   * 
   * Two modes:
   * 1. With redirectUri: redirect there after login (e.g., /oauth/authorize to complete OAuth flow)
   * 2. Without redirectUri: redirect based on user's tenants and initiateLoginUri
   */
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res() res: Response,
  ) {
    const result = await this.authService.login(dto);
    
    // Handle MFA challenge - return JSON, don't set cookies yet
    if (result.mfaRequired && result.mfaChallengeToken) {
      console.log(`[Login] MFA required for ${dto.email}`);
      return res.json({
        mfaRequired: true,
        mfaChallengeToken: result.mfaChallengeToken,
        // Pass along redirect info so client can include after MFA verification
        redirectUri: dto.redirectUri,
        clientId: dto.clientId,
      });
    }
    
    // MFA not required or already verified - set cookies and proceed
    if (!result.accessToken || !result.user) {
      throw new BadRequestException('Login failed - no access token generated');
    }
    
    // Set IDP session cookies
    res.cookie('auth_token', result.accessToken, getIdpCookieOptions());
    res.cookie('idp_session', result.accessToken, getIdpCookieOptions());
    
    console.log(`[Login] Success for ${dto.email}, redirectUri: ${dto.redirectUri || 'none'}, clientId: ${dto.clientId || 'none'}`);
    
    // MODE 1: Redirect to provided URI (typically /oauth/authorize for OAuth flow)
    if (dto.redirectUri) {
      // Only allow same-origin (relative) redirects to prevent open redirect attacks
      if (!dto.redirectUri.startsWith('/') || dto.redirectUri.startsWith('//')) {
        throw new BadRequestException('Invalid redirect URI - only same-origin paths allowed');
      }
      console.log(`[Login] Redirecting to: ${dto.redirectUri}`);
      return res.redirect(302, dto.redirectUri);
    }
    
    // Look up application config (if clientId provided)
    let app: { initiateLoginUri: string | null; redirectUris: string[] } | null = null;
    if (dto.clientId) {
      app = await this.prisma.application.findUnique({
        where: { clientId: dto.clientId },
        select: { initiateLoginUri: true, redirectUris: true },
      });
    }
    
    // MODE 2: Direct login (no redirectUri)
    // No client_id provided → user needs to pick an app
    // With client_id → redirect based on memberships
    
    // If no client_id, go straight to app-picker
    if (!dto.clientId) {
      console.log(`[Login] No clientId - 302 to app-picker`);
      return res.redirect(302, '/auth/app-picker');
    }
    
    // Get user's memberships for redirect decision
    const user = await this.prisma.user.findUnique({
      where: { id: result.user.id },
      include: {
        memberships: {
          where: { status: 'ACTIVE' },
          include: { 
            tenant: { 
              select: { id: true, name: true, slug: true } 
            } 
          },
        },
      },
    });
    
    const memberships = user?.memberships || [];
    
    // Helper to build redirect URL using initiateLoginUri
    const buildRedirectUrl = (tenantSlug: string): string => {
      if (!app?.initiateLoginUri) {
        throw new BadRequestException(
          'Application initiateLoginUri is not configured. Please set it in the admin panel.'
        );
      }
      return app.initiateLoginUri.replace('{tenant}', tenantSlug);
    };
    
    // Single tenant → redirect to app
    if (memberships.length === 1) {
      const redirectUrl = buildRedirectUrl(memberships[0].tenant.slug);
      console.log(`[Login] Single tenant - 302 to: ${redirectUrl}`);
      return res.redirect(302, redirectUrl);
    }
    
    // Multiple tenants → redirect to org picker
    if (memberships.length > 1) {
      const params = new URLSearchParams();
      params.set('client_id', dto.clientId);
      const pickerUrl = `/auth/org-picker?${params.toString()}`;
      console.log(`[Login] Multiple tenants - 302 to org-picker`);
      return res.redirect(302, pickerUrl);
    }
    
    // No tenants yet (fresh user) → go to app-picker anyway
    console.log(`[Login] No tenants - 302 to app-picker`);
    return res.redirect(302, '/auth/app-picker');
  }

  /**
   * Verify MFA and complete login
   * Takes the challenge token from login and a TOTP/backup code
   * Returns JSON with redirectUrl - frontend handles navigation
   */
  @Post('mfa/verify')
  @HttpCode(HttpStatus.OK)
  async verifyMfa(
    @Body() body: { challengeToken: string; code: string; redirectUri?: string; clientId?: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.verifyMfaAndCompleteLogin(
      body.challengeToken,
      body.code,
    );
    
    // Set IDP session cookies
    res.cookie('auth_token', result.accessToken, getIdpCookieOptions());
    res.cookie('idp_session', result.accessToken, getIdpCookieOptions());
    
    console.log(`[MFA Verify] Success for user ${result.user.id}`);
    
    // Determine where to redirect
    let redirectUrl = '/auth/app-picker';
    
    // If redirectUri was provided, use it
    if (body.redirectUri) {
      if (body.redirectUri.startsWith('/') && !body.redirectUri.startsWith('//')) {
        redirectUrl = body.redirectUri;
      }
    } else if (body.clientId) {
      // Look up application config
      const app = await this.prisma.application.findUnique({
        where: { clientId: body.clientId },
        select: { initiateLoginUri: true },
      });
      
      if (app?.initiateLoginUri && result.memberships.length === 1) {
        // Single tenant - redirect to app
        redirectUrl = app.initiateLoginUri.replace('{tenant}', result.memberships[0].tenant.slug);
      } else if (result.memberships.length > 1) {
        // Multiple tenants - org picker
        redirectUrl = `/auth/org-picker?client_id=${body.clientId}`;
      }
    }
    
    console.log(`[MFA Verify] Returning redirectUrl: ${redirectUrl}`);
    
    // Return JSON with redirect URL - frontend will navigate
    return {
      success: true,
      redirectUrl,
      user: result.user,
    };
  }

  /**
   * Get current user (if authenticated via IDP session)
   * Also returns memberships for the frontend to use
   */
  @Get('me')
  @UseGuards(OptionalAuthGuard)
  async getMe(@Request() req: AuthenticatedRequest) {
    if (!req.user) {
      return { authenticated: false };
    }

    // Get user with memberships
    const user = await this.prisma.user.findUnique({
      where: { id: req.user.id },
      include: {
        memberships: {
          where: { status: 'ACTIVE' },
          include: {
            tenant: { select: { id: true, name: true, slug: true } },
          },
        },
      },
    });

    if (!user) {
      return { authenticated: false };
    }

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
      memberships: user.memberships.map(m => ({
        id: m.id,
        tenant: m.tenant,
      })),
    };
  }

  /**
   * Get available applications for the instance
   * Used by app picker page after invitation acceptance without clientId
   */
  @Get('apps')
  @UseGuards(OptionalAuthGuard)
  async getApps(@Request() req: AuthenticatedRequest) {
    if (!req.user) {
      return { authenticated: false, applications: [] };
    }

    // Get all active applications in the instance
    const applications = await this.prisma.application.findMany({
      where: {
        isActive: true,
      },
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

    return {
      authenticated: true,
      applications,
    };
  }

  /**
   * Logout - clear all IDP session cookies and log the event
   * 
   * Accepts optional Bearer token to identify the user for audit logging.
   * Works with or without token (cookies are always cleared).
   */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(OptionalAuthGuard)
  async logout(
    @Request() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
    @Body('redirect_uri') redirectUri?: string,
  ) {
    // Log the logout event for audit trail
    const userId = req.user?.id;
    const userEmail = req.user?.email;
    const timestamp = new Date().toISOString();
    
    if (userId) {
      console.log(`[AUDIT] User logout: userId=${userId}, email=${userEmail}, timestamp=${timestamp}`);
      
      // TODO: Persist to database audit log table if needed
      // await this.prisma.auditLog.create({
      //   data: {
      //     userId,
      //     action: 'LOGOUT',
      //     ipAddress: req.ip,
      //     userAgent: req.headers['user-agent'],
      //     timestamp: new Date(),
      //   },
      // });
    } else {
      console.log(`[AUDIT] Anonymous logout (session cookie only): timestamp=${timestamp}`);
    }
    
    // Clear all auth cookies - use same HostOnly options (no domain)
    const clearOpts = getClearCookieOptions();
    res.clearCookie('idp_session', clearOpts);
    res.clearCookie('auth_token', clearOpts);
    
    console.log('[Auth] Cookies cleared for logout');
    
    return { 
      success: true,
      redirect_uri: redirectUri || null,
      loggedUser: userId ? { id: userId, email: userEmail } : null,
    };
  }

  /**
   * Redirect-based logout (GET request)
   * 
   * This is the PREFERRED logout method for cross-origin apps!
   * 
   * Why: When an app at localhost:5173 calls the IDP at localhost:8000 via fetch(),
   * the Set-Cookie headers to clear cookies may not be applied due to browser
   * third-party cookie restrictions. By navigating directly to this endpoint,
   * we ensure cookies are cleared properly (same-origin page load).
   * 
   * Usage: Navigate to /api/auth/logout/redirect?post_logout_redirect_uri=http://app.com
   * 
   * Security: Only allows redirects to trusted origins (prevents open redirect attacks)
   */
  @Get('logout/redirect')
  async logoutRedirect(
    @Query('post_logout_redirect_uri') postLogoutRedirectUri: string,
    @Res() res: Response,
  ) {
    const timestamp = new Date().toISOString();
    console.log(`[AUDIT] Redirect-based logout: timestamp=${timestamp}`);
    
    // Clear all auth cookies (HostOnly - no domain)
    const clearOpts = getClearCookieOptions();
    res.clearCookie('idp_session', clearOpts);
    res.clearCookie('auth_token', clearOpts);
    
    console.log('[Auth] Cookies cleared via redirect logout');
    
    // Security: Only allow redirects to known/trusted origins
    if (postLogoutRedirectUri) {
      try {
        const redirectUrl = new URL(postLogoutRedirectUri);
        
        // Allowed patterns for post-logout redirects:
        // - localhost subdomains (development): *.localhost, localhost:*
        // - Add production domains as needed
        const allowedPatterns = [
          /^https?:\/\/([a-z0-9-]+\.)?localhost(:\d+)?$/,  // localhost & subdomains
          /^https?:\/\/127\.0\.0\.1(:\d+)?$/,              // 127.0.0.1
          // Production patterns (add your domains here):
          // /^https:\/\/([a-z0-9-]+\.)?yourdomain\.com$/,
        ];
        
        const isAllowed = allowedPatterns.some(pattern => pattern.test(redirectUrl.origin));
        
        if (isAllowed) {
          console.log(`[Auth] Redirecting to trusted URI: ${postLogoutRedirectUri}`);
          return res.redirect(postLogoutRedirectUri);
        } else {
          console.warn(`[Auth] Blocked redirect to untrusted URI: ${postLogoutRedirectUri}`);
        }
      } catch {
        console.warn(`[Auth] Invalid redirect URI: ${postLogoutRedirectUri}`);
      }
    }
    
    // Show a nice logged out page
    res.setHeader('Content-Type', 'text/html');
    return res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Logged Out</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            * { box-sizing: border-box; }
            body {
              font-family: system-ui, -apple-system, sans-serif;
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              margin: 0;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
            }
            .container {
              text-align: center;
              padding: 2rem;
              max-width: 400px;
            }
            .icon {
              width: 80px;
              height: 80px;
              background: rgba(255,255,255,0.2);
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              margin: 0 auto 1.5rem;
              font-size: 2rem;
            }
            h1 {
              margin: 0 0 0.5rem;
              font-size: 1.75rem;
              font-weight: 600;
            }
            p {
              margin: 0 0 2rem;
              opacity: 0.9;
            }
            .btn {
              display: inline-block;
              padding: 0.75rem 2rem;
              background: white;
              color: #764ba2;
              text-decoration: none;
              border-radius: 8px;
              font-weight: 500;
              transition: transform 0.2s, box-shadow 0.2s;
            }
            .btn:hover {
              transform: translateY(-2px);
              box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="icon">👋</div>
            <h1>You've been logged out</h1>
            <p>Your session has been securely ended.</p>
            <a href="/" class="btn">Sign in again</a>
          </div>
        </body>
      </html>
    `);
  }

  // ===========================================================================
  // CROSS-DOMAIN AUTH (Redirect Token Flow)
  // ===========================================================================

  /**
   * Generate a redirect token for cross-domain auth
   * Used when user is logged into IDP and wants to access an app
   * 
   * Flow:
   * 1. User logged in at IDP (has idp_session cookie)
   * 2. IDP frontend calls this endpoint
   * 3. Returns short-lived redirect token
   * 4. User redirected to app with ?token=xxx
   * 5. App exchanges token via /auth/exchange-token
   */
  @Post('redirect-token')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async generateRedirectToken(@Request() req: AuthenticatedRequest) {
    const token = crypto.randomBytes(32).toString('hex');
    
    // Get user's email
    const user = await this.prisma.user.findUnique({
      where: { id: req.user.id },
      select: { email: true },
    });
    
    // Store token (expires in 30 seconds - just for redirect)
    redirectTokens.set(token, {
      userId: req.user.id,
      email: req.user.email || user?.email || '',
      expiresAt: new Date(Date.now() + 30 * 1000),
    });
    
    return { redirectToken: token };
  }

  /**
   * Exchange redirect token for session (sets auth_token cookie)
   * Called after signup/login to establish session for OAuth flow
   */
  @Post('exchange-token')
  @HttpCode(HttpStatus.OK)
  async exchangeToken(
    @Body() body: { token: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const { token } = body;
    
    if (!token) {
      return { success: false, error: 'Token is required' };
    }
    
    const tokenData = redirectTokens.get(token);
    
    if (!tokenData) {
      return { success: false, error: 'Invalid or expired token' };
    }
    
    if (tokenData.expiresAt < new Date()) {
      redirectTokens.delete(token);
      return { success: false, error: 'Token has expired' };
    }
    
    // Delete used token (one-time use)
    redirectTokens.delete(token);
    
    // Get full user data with memberships
    const user = await this.prisma.user.findUnique({
      where: { id: tokenData.userId },
      include: {
        memberships: {
          where: { status: 'ACTIVE' },
          include: {
            tenant: { select: { id: true, name: true, slug: true } },
          },
        },
      },
    });
    
    if (!user) {
      return { success: false, error: 'User not found' };
    }
    
    // Generate JWT for IDP session
    const jwt = await this.authService.generateJwt(
      user.id,
      user.email || '',
    );
    
    // Set auth_token cookie for IDP session (used by OAuth flow)
    const isSecure = process.env.NODE_ENV === 'production';
    res.cookie('auth_token', jwt, {
      httpOnly: true,
      secure: isSecure,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
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
      memberships: user.memberships.map(m => ({
        id: m.id,
        tenant: m.tenant,
      })),
    };
  }

  /**
   * Get authenticated user's profile
   */
  @Get('profile')
  @UseGuards(JwtAuthGuard)
  async getProfile(@Request() req: AuthenticatedRequest) {
    return this.authService.getProfile(req.user.id);
  }

  // ===========================================================================
  // MFA MANAGEMENT (for authenticated users)
  // ===========================================================================

  /**
   * Get current MFA status for the authenticated user
   */
  @Get('mfa/status')
  @UseGuards(JwtAuthGuard)
  async getMfaStatus(@Request() req: AuthenticatedRequest) {
    return this.mfaService.getUserMfaStatus(req.user.id);
  }

  /**
   * Start MFA setup - generates secret and QR code
   * Returns the secret and backup codes (only shown once!)
   */
  @Post('mfa/setup')
  @UseGuards(JwtAuthGuard)
  async setupMfa(@Request() req: AuthenticatedRequest) {
    const user = await this.prisma.user.findUnique({
      where: { id: req.user.id },
      select: { email: true },
    });

    if (!user?.email) {
      throw new BadRequestException('User email is required for MFA setup');
    }

    return this.mfaService.generateSetup(user.email);
  }

  /**
   * Complete MFA setup by verifying the first TOTP code
   * This enables MFA for the user
   */
  @Post('mfa/enable')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async enableMfa(
    @Request() req: AuthenticatedRequest,
    @Body() body: { secret: string; code: string; backupCodes: string[] },
  ) {
    const { secret, code, backupCodes } = body;

    if (!secret || !code || !backupCodes?.length) {
      throw new BadRequestException('Secret, code, and backup codes are required');
    }

    return this.mfaService.enableMfaForUser(req.user.id, secret, code, backupCodes);
  }

  /**
   * Disable MFA for the user (requires valid TOTP code)
   */
  @Delete('mfa/disable')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async disableMfa(
    @Request() req: AuthenticatedRequest,
    @Body() body: { code: string },
  ) {
    if (!body.code) {
      throw new BadRequestException('Verification code is required');
    }

    return this.mfaService.disableMfaForUser(req.user.id, body.code);
  }

  /**
   * Regenerate backup codes (requires valid TOTP code)
   * Returns new backup codes - store them safely!
   */
  @Post('mfa/backup-codes')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async regenerateBackupCodes(
    @Request() req: AuthenticatedRequest,
    @Body() body: { code: string },
  ) {
    if (!body.code) {
      throw new BadRequestException('TOTP code is required to regenerate backup codes');
    }

    return this.mfaService.regenerateBackupCodes(req.user.id, body.code);
  }
}
