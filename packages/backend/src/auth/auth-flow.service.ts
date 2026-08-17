import {
  Injectable,
  Logger,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response, Request as ExpressRequest } from 'express';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import {
  getBaseCookieOptions,
  getRefreshTokenCookieOptions,
  getSessionCookieOptions,
} from '../common/utils/cookie.utils';
import { OAuthSessionService } from '../oauth/oauth-session.service';
import { KeyService } from '../oauth/key.service';
import { redirectTokens } from './redirect-tokens';
import { ensureInternalClient } from './internal-client';
import { CONSOLE_SESSION_TTL_SECONDS } from './constants/token-ttl';

const getClearCookieOptions = getBaseCookieOptions;
const getRefreshCookieOptions = getRefreshTokenCookieOptions;

/**
 * AuthFlowService
 *
 * Holds the fat, HTTP-coupled handler bodies extracted from AuthController
 * (thin-controller pattern). Route strings, guards and decorators remain on
 * the controller; the logic here is byte-for-byte the original handler code.
 */
@Injectable()
export class AuthFlowService {
  private readonly logger = new Logger(AuthFlowService.name);
  private readonly issuer: string;

  constructor(
    private readonly authService: AuthService,
    private readonly prisma: PrismaService,
    private readonly oauthSessionService: OAuthSessionService,
    private readonly keyService: KeyService,
    private readonly configService: ConfigService,
  ) {
    this.issuer = this.configService.getOrThrow<string>('BASE_URL');
  }

  async refreshToken(
    req: ExpressRequest,
    res: Response,
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
        applicationClient: { include: { application: true } },
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

    if (!session.applicationClient.application.isActive) {
      this.logger.warn(`[Refresh] Application ${session.applicationClient.clientId} is disabled`);
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
        expiresAt: new Date(Date.now() + session.applicationClient.refreshTokenTtl * 1000),
        userId: session.userId,
        applicationClientId: session.applicationClientId,
        revoked: false,
        tenantId: session.tenantId,
        tenantSubdomain: session.tenantSubdomain,
        // Preserve the ORIGINAL session's amr across rotations.
        amr: session.amr,
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
      aud: session.applicationClient.clientId,
      scope: session.scope || 'openid profile email',
      tenantId: session.tenantId || undefined,
      tenantSubdomain: session.tenantSubdomain || undefined,
      expiresIn: session.applicationClient.refreshTokenTtl,
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

    // Re-stamp the ORIGINAL session's amr (RFC 8176). Legacy rows carry an
    // empty array → treated as password-only.
    accessTokenPayload.amr = session.amr.length > 0 ? session.amr : ['pwd'];

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
              where: {
                role: {
                  applicationId: session.applicationClient.application.id,
                },
              },
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
      audience: session.applicationClient.clientId,
      issuer: this.issuer,
      expiresIn: session.applicationClient.accessTokenTtl,
    });

    // 7. Set new refresh_token cookie (httpOnly, secure, sameSite)
    res.cookie('refresh_token', newRefreshToken, getRefreshCookieOptions());

    this.logger.debug(`[Refresh] Token rotation complete for user ${session.user.id}, session ${newSession.id}`);

    // 8. Return access token in JSON body (NO access token cookie!)
    return {
      access_token: accessToken,
      expires_in: session.applicationClient.accessTokenTtl,
      token_type: 'Bearer',
    };
  }

  async login(dto: LoginDto, res: Response) {
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
    res.cookie('idp_session', result.accessToken, getSessionCookieOptions());

    // Handle redirect flows
    if (dto.redirectUri) {
      if (!dto.redirectUri.startsWith('/') || dto.redirectUri.startsWith('//')) {
        throw new BadRequestException('Invalid redirect URI');
      }
      return res.redirect(302, dto.redirectUri);
    }

    // No client_id hint → TENANT-FIRST login selection. The absence of a
    // client_id is the signal for this flow; the OAuth/app-first path below
    // (client_id present) is left untouched.
    if (!dto.clientId) {
      return res.redirect(302, await this.resolveNoHintRedirect(result.user.id));
    }

    // client_id present (app-first / OAuth continuation) — unchanged behavior.
    // clientId + these OAuth fields live on ApplicationClient now.
    const app = await this.prisma.applicationClient.findUnique({
      where: { clientId: dto.clientId },
      select: { clientId: true, initiateLoginUri: true, redirectUris: true },
    });

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
      // app was looked up by dto.clientId, so pass the same value through.
      params.set('client_id', dto.clientId);
      return res.redirect(302, `/auth/org-picker?${params.toString()}`);
    }

    return res.redirect(302, '/auth/app-picker');
  }

  /**
   * Tenant-first login selection for the NO-client_id (hint-less) path.
   * Returns the path/URL to redirect the user to after a hint-less login.
   *
   * Decision tree:
   *  - many tenants           → '/auth/org-picker' (no client_id → tenant-first)
   *  - 1 tenant, 1 app        → auto-launch the single app's initiateLoginUri
   *  - 1 tenant, 0 or many    → '/auth/app-picker?tenant=<slug>&tenant_name=<name>'
   *  - 0 tenants              → '/auth/app-picker' (graceful empty state)
   */
  private async resolveNoHintRedirect(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        memberships: {
          where: { status: 'ACTIVE' },
          include: { tenant: { select: { id: true, name: true, slug: true } } },
        },
      },
    });

    const memberships = user?.memberships || [];

    // Many tenants → let the user pick one first (no client_id ⇒ tenant-first).
    if (memberships.length > 1) {
      console.log(`[Login] ${memberships.length} tenants, no client_id → tenant-first org-picker`);
      return '/auth/org-picker';
    }

    // No tenants → graceful empty state via the app-picker.
    if (memberships.length === 0) {
      console.log('[Login] No active tenants → app-picker empty state');
      return '/auth/app-picker';
    }

    // Exactly one tenant → resolve launchable apps scoped to that tenant.
    const tenant = memberships[0].tenant;
    const appPickerUrl = `/auth/app-picker?tenant=${tenant.slug}&tenant_name=${encodeURIComponent(tenant.name)}`;

    const accessGrants = await this.prisma.appAccess.findMany({
      where: { userId, tenantId: tenant.id, status: 'ACTIVE' },
      select: { applicationId: true },
    });
    const accessibleAppIds = [...new Set(accessGrants.map((g) => g.applicationId))];

    if (accessibleAppIds.length === 0) {
      console.log(`[Login] Single tenant ${tenant.slug}, no accessible apps → app-picker`);
      return appPickerUrl;
    }

    // Launchable = active application with a SPA client that has an initiateLoginUri.
    const launchableApps = await this.prisma.application.findMany({
      where: {
        id: { in: accessibleAppIds },
        isActive: true,
        clients: { some: { type: 'SPA', initiateLoginUri: { not: null } } },
      },
      select: {
        clients: {
          where: { type: 'SPA', initiateLoginUri: { not: null } },
          select: { initiateLoginUri: true },
          take: 1,
        },
      },
    });

    if (launchableApps.length === 1) {
      const initiateLoginUri = launchableApps[0].clients[0]?.initiateLoginUri;
      if (initiateLoginUri) {
        const url = initiateLoginUri.replace('{tenant}', tenant.slug);
        console.log(`[Login] Single tenant ${tenant.slug}, single app → auto-launch ${url}`);
        return url;
      }
    }

    console.log(`[Login] Single tenant ${tenant.slug}, ${launchableApps.length} launchable apps → app-picker`);
    return appPickerUrl;
  }

  async verifyMfa(
    body: { challengeToken: string; code: string; redirectUri?: string; clientId?: string },
    res: Response,
  ) {
    const result = await this.authService.verifyMfaAndCompleteLogin(body.challengeToken, body.code);

    // Set refresh token as httpOnly cookie if available
    // Note: refreshToken will be returned by auth service in split-token architecture
    const mfaResult = result as typeof result & { refreshToken?: string };
    if (mfaResult.refreshToken) {
      res.cookie('refresh_token', mfaResult.refreshToken, getRefreshTokenCookieOptions());
    }
    res.cookie('idp_session', result.accessToken, getSessionCookieOptions());

    // Matches the console JWT expiry (rolling window; see token-ttl.ts)
    const expiresIn = CONSOLE_SESSION_TTL_SECONDS;

    // Handle redirect flow
    let redirectUrl: string | null = null;
    if (body.redirectUri && body.redirectUri.startsWith('/') && !body.redirectUri.startsWith('//')) {
      redirectUrl = body.redirectUri;
    } else if (body.clientId) {
      const app = await this.prisma.applicationClient.findUnique({
        where: { clientId: body.clientId },
        select: { initiateLoginUri: true },
      });

      if (app?.initiateLoginUri && result.memberships.length === 1) {
        redirectUrl = app.initiateLoginUri.replace('{tenant}', result.memberships[0].tenant.slug);
      } else if (result.memberships.length > 1) {
        redirectUrl = `/auth/org-picker?client_id=${body.clientId}`;
      }
    } else if (!body.redirectUri && !body.clientId) {
      // No redirectUri and no client_id → same tenant-first tree as login().
      redirectUrl = await this.resolveNoHintRedirect(result.user.id);
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

  async exchangeToken(body: { token: string }, res: Response) {
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

    // Generate access token, inheriting the originating session's amr and
    // session_start (this exchange is a handoff, not a fresh authentication).
    const accessToken = await this.authService.generateJwt(user.id, user.email || '', {
      amr: tokenData.amr,
      sessionStart: tokenData.sessionStart,
    });

    // Internal auth-flow sessions are not tied to a customer OAuth app, so they
    // hang off the reserved internal ApplicationClient. Get-or-create keeps this
    // working after a fresh migrate+seed and self-heals if the row is missing.
    const internalClient = await ensureInternalClient(this.prisma);

    // Create refresh token session (Token Ghosting)
    const refreshTokenRecord = await this.prisma.refreshToken.create({
      data: {
        scope: 'openid profile email',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        userId: user.id,
        applicationClientId: internalClient.id,
        revoked: false,
        amr: tokenData.amr ?? ['pwd'],
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

    // Matches the console JWT expiry (rolling window; see token-ttl.ts)
    const expiresIn = CONSOLE_SESSION_TTL_SECONDS;

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
}
