import {
  Injectable,
  UnauthorizedException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { KeyService } from './key.service';
import { Prisma, RevokedReason } from '@prisma/client';

/**
 * Manages OAuth sessions using the Token Ghosting pattern.
 *
 * Token Ghosting: Refresh tokens are JWTs with a `sid` (session ID) claim
 * pointing to a revocable session record. This enables:
 * - Fast JWT verification without DB lookup (reject invalid tokens instantly)
 * - Instant session revocation via DB flag
 * - Session management UI (view/revoke active sessions)
 */
@Injectable()
export class OAuthSessionService {
  private readonly issuer: string;
  private readonly logger = new Logger(OAuthSessionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly keyService: KeyService,
    private readonly configService: ConfigService,
  ) {
    this.issuer = this.configService.getOrThrow<string>('BASE_URL');
  }

  /**
   * Generate a signed refresh token JWT with session ID (sid) claim.
   * This is the core of Token Ghosting:
   * - JWT is self-contained and can be verified without DB lookup
   * - `sid` claim points to a session record that can be revoked
   * - On refresh, verify signature first, then check session validity
   */
  async generateRefreshTokenJwt(params: {
    sid: string; // Session ID (primary key of refresh_tokens table)
    sub: string; // User ID
    aud: string; // Client ID (audience)
    scope: string; // OAuth scopes
    tenantId?: string; // Optional tenant scope
    tenantSubdomain?: string;
    expiresIn: number; // Expiration in seconds
  }): Promise<string> {
    const refreshPayload: Record<string, unknown> = {
      sid: params.sid, // Session ID - the key to Token Ghosting
      scope: params.scope,
      token_type: 'refresh', // Distinguish from access tokens
    };

    // Include tenant scope if present (for tenant-isolated refresh)
    if (params.tenantId) {
      refreshPayload.tenant_id = params.tenantId;
    }
    if (params.tenantSubdomain) {
      refreshPayload.tenant_subdomain = params.tenantSubdomain;
    }

    return this.keyService.signJwt(refreshPayload, {
      subject: params.sub,
      audience: params.aud,
      issuer: this.issuer,
      expiresIn: params.expiresIn,
    });
  }

  /**
   * Verify a refresh token JWT and extract the session ID.
   * This performs cryptographic verification WITHOUT a DB lookup.
   * Returns the payload if valid, throws if invalid/expired/forged.
   */
  async verifyRefreshTokenJwt(token: string): Promise<{
    sid: string;
    sub: string;
    aud: string;
    scope: string;
    tenantId?: string;
    tenantSubdomain?: string;
  }> {
    const payload = await this.keyService.verifyJwt(token, this.issuer);

    // Validate this is actually a refresh token
    if (payload.token_type !== 'refresh') {
      throw new UnauthorizedException(
        'Invalid token type - expected refresh token',
      );
    }

    if (!payload.sid || typeof payload.sid !== 'string') {
      throw new UnauthorizedException(
        'Invalid refresh token - missing session ID',
      );
    }

    return {
      sid: payload.sid as string,
      sub: payload.sub as string,
      aud: (Array.isArray(payload.aud)
        ? payload.aud[0]
        : payload.aud) as string,
      scope: (payload.scope as string) || 'openid profile email',
      tenantId: payload.tenant_id as string | undefined,
      tenantSubdomain: payload.tenant_subdomain as string | undefined,
    };
  }

  /**
   * Revoke a specific session by ID (Token Ghosting logout)
   * This is called when user logs out of a specific session.
   *
   * @param reason - Why the session is being revoked (audit + grace-window
   *                 eligibility). Defaults to ADMIN (session-management UI).
   */
  async revokeSession(
    sessionId: string,
    reason: RevokedReason = RevokedReason.ADMIN,
  ): Promise<{ success: boolean; message: string }> {
    const result = await this.prisma.refreshToken.updateMany({
      where: {
        id: sessionId,
        revoked: false,
      },
      data: {
        revoked: true,
        revokedAt: new Date(),
        revokedReason: reason,
      },
    });

    if (result.count === 0) {
      return {
        success: false,
        message: 'Session not found or already revoked',
      };
    }

    return { success: true, message: 'Session revoked successfully' };
  }

  /**
   * Revoke ALL sessions for a user (Token Ghosting logout-all)
   * This is called when user clicks "logout everywhere".
   */
  async revokeAllUserSessions(
    userId: string,
    applicationId?: string,
    reason: RevokedReason = RevokedReason.ADMIN,
  ): Promise<{ success: boolean; count: number }> {
    // Sessions FK to ApplicationClient now; scope by the owning application
    // (covers all of that application's clients) via a relation filter.
    const where: Prisma.RefreshTokenWhereInput = {
      userId,
      revoked: false,
    };

    // Optionally scope to a specific application
    if (applicationId) {
      where.applicationClient = { is: { applicationId } };
    }

    const result = await this.prisma.refreshToken.updateMany({
      where,
      data: {
        revoked: true,
        revokedAt: new Date(),
        revokedReason: reason,
      },
    });

    return { success: true, count: result.count };
  }

  /**
   * Revoke all tokens for a user/application-client pair
   * Used for security events (e.g., authorization code replay attack)
   */
  async revokeUserAppTokens(
    userId: string,
    applicationClientId: string,
    reason: RevokedReason = RevokedReason.REUSE_DETECTED,
  ) {
    await this.prisma.refreshToken.updateMany({
      where: {
        userId,
        applicationClientId,
        revoked: false,
      },
      data: {
        revoked: true,
        revokedAt: new Date(),
        revokedReason: reason,
      },
    });
  }

  /**
   * Get active sessions for a user (for "manage sessions" UI)
   */
  async getUserSessions(
    userId: string,
    applicationId?: string,
  ): Promise<
    Array<{
      id: string;
      createdAt: Date;
      expiresAt: Date;
      userAgent: string | null;
      ipAddress: string | null;
      tenantSubdomain: string | null;
    }>
  > {
    const where: Prisma.RefreshTokenWhereInput = {
      userId,
      revoked: false,
      expiresAt: { gt: new Date() },
    };

    if (applicationId) {
      where.applicationClient = { is: { applicationId } };
    }

    return this.prisma.refreshToken.findMany({
      where,
      select: {
        id: true,
        createdAt: true,
        expiresAt: true,
        userAgent: true,
        ipAddress: true,
        tenantSubdomain: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * List a user's active sessions in API-response shape (ISO strings).
   *
   * Thin presentation wrapper over {@link getUserSessions} so both the OAuth
   * (RS256) and console (JwtAuthGuard) surfaces render the same session shape
   * without duplicating the mapping.
   */
  async listSessions(
    userId: string,
    applicationId?: string,
  ): Promise<{
    sessions: Array<{
      id: string;
      createdAt: string;
      expiresAt: string;
      userAgent: string | null;
      ipAddress: string | null;
      tenant: string | null;
    }>;
    count: number;
  }> {
    const sessions = await this.getUserSessions(userId, applicationId);
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
   * Revoke a single session, enforcing OWNERSHIP.
   *
   * A caller may only revoke sessions belonging to their own user id. To avoid
   * leaking the existence of another user's session we treat both "missing"
   * and "not yours" as a 404. Reuses {@link revokeSession} for the actual write.
   */
  async revokeUserSession(
    userId: string,
    sessionId: string,
  ): Promise<{ success: boolean; message: string }> {
    const session = await this.prisma.refreshToken.findUnique({
      where: { id: sessionId },
      select: { userId: true },
    });

    if (!session || session.userId !== userId) {
      throw new NotFoundException('Session not found');
    }

    return this.revokeSession(sessionId);
  }

  /**
   * Revoke a refresh token (Token Ghosting JWT only)
   */
  async revokeToken(token: string, tokenTypeHint?: string): Promise<void> {
    // Only refresh tokens can be revoked (access tokens are stateless JWTs)
    if (tokenTypeHint && tokenTypeHint !== 'refresh_token') {
      return; // Access tokens cannot be revoked
    }

    try {
      const { sid } = await this.verifyRefreshTokenJwt(token);
      // RFC 7009 revocation is a client-initiated logout of this session.
      await this.prisma.refreshToken.updateMany({
        where: { id: sid, revoked: false },
        data: {
          revoked: true,
          revokedAt: new Date(),
          revokedReason: RevokedReason.LOGOUT,
        },
      });
    } catch {
      // Invalid JWT - nothing to revoke
      this.logger.debug('Token revocation skipped - not a valid JWT');
    }
  }
}
