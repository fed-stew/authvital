import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  Param,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  NotFoundException,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Response, Request } from 'express';
import { OAuthService } from './oauth.service';
import { OAuthTokenGuard } from './oauth-token.guard';
import { PrismaService } from '../prisma/prisma.service';
import { getBaseCookieOptions } from '../common/utils/cookie.utils';

/**
 * OAuth Session Controller
 * Handles session management, logout, and userinfo endpoints
 */
@Controller('oauth')
export class OAuthSessionController {
  constructor(
    private readonly oauthService: OAuthService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * UserInfo Endpoint (OIDC)
   */
  @Get('userinfo')
  @UseGuards(OAuthTokenGuard)
  async userinfo(@Req() req: Request & { user: { id: string } }) {
    return this.oauthService.getUserInfo(req.user.id);
  }

  /**
   * Tenants Endpoint
   */
  @Get('tenants')
  @UseGuards(OAuthTokenGuard)
  async getTenants(@Req() req: Request & { user: { id: string } }) {
    return this.oauthService.getTenants(req.user.id);
  }

  /**
   * Logout Endpoint - Revoke current session (Token Ghosting)
   */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body('refresh_token') refreshTokenBody?: string,
  ) {
    const refreshToken = req.cookies?.['refresh_token'] || refreshTokenBody;

    if (!refreshToken) {
      this.clearAuthCookies(res);
      return { success: true, message: 'Logged out (no active session)' };
    }

    try {
      const { sid } = await this.oauthService.verifyRefreshTokenJwt(refreshToken);
      const result = await this.oauthService.revokeSession(sid);
      this.clearAuthCookies(res);
      return result;
    } catch (error) {
      this.clearAuthCookies(res);
      return { success: true, message: 'Logged out' };
    }
  }

  /**
   * Logout All Endpoint - Revoke all sessions for the user
   */
  @Post('logout-all')
  @UseGuards(OAuthTokenGuard)
  @HttpCode(HttpStatus.OK)
  async logoutAll(
    @Req() req: Request & { user: { id: string } },
    @Res({ passthrough: true }) res: Response,
    @Body('application_id') applicationId?: string,
  ) {
    const result = await this.oauthService.revokeAllUserSessions(req.user.id, applicationId);
    this.clearAuthCookies(res);
    return { success: true, message: `Revoked ${result.count} session(s)`, count: result.count };
  }

  /**
   * Get Active Sessions
   */
  @Get('sessions')
  @UseGuards(OAuthTokenGuard)
  async getSessions(
    @Req() req: Request & { user: { id: string } },
    @Query('application_id') applicationId?: string,
  ) {
    const sessions = await this.oauthService.getUserSessions(req.user.id, applicationId);

    return {
      sessions: sessions.map((s) => ({
        id: s.id,
        createdAt: s.createdAt.toISOString(),
        expiresAt: s.expiresAt.toISOString(),
        userAgent: s.userAgent,
        ipAddress: s.ipAddress,
        tenant: s.tenantSubdomain,
      })),
      count: sessions.length,
    };
  }

  /**
   * Revoke Specific Session
   */
  @Post('sessions/:sessionId/revoke')
  @UseGuards(OAuthTokenGuard)
  @HttpCode(HttpStatus.OK)
  async revokeSessionById(
    @Req() req: Request & { user: { id: string } },
    @Param('sessionId') sessionId: string,
  ) {
    const session = await this.prisma.refreshToken.findUnique({
      where: { id: sessionId },
      select: { userId: true },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (session.userId !== req.user.id) {
      throw new UnauthorizedException("Cannot revoke another user's session");
    }

    return this.oauthService.revokeSession(sessionId);
  }

  private clearAuthCookies(res: Response) {
    const cookieOptions = getBaseCookieOptions();
    res.clearCookie('auth_token', cookieOptions);
    res.clearCookie('refresh_token', cookieOptions);
  }
}
