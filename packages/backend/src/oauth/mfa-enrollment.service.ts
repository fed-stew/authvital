import {
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { KeyService } from './key.service';
import { OAuthService, AuthorizeParams } from './oauth.service';
import { MfaService } from '../auth/mfa/mfa.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS, AUDIT_TARGET_TYPES } from '../audit/audit-actions';

/** Verified payload of a `mfa_enrollment_resume` token. */
export interface ResumeTokenPayload {
  sub: string;
  jti: string;
  exp: number;
  tenantId: string;
  authorizeParams: AuthorizeParams;
}

/** Shape the enrollment page renders from. */
export interface MfaEnrollmentContext {
  tenantName: string;
  tenantPolicy: string;
  gracePeriodEndsAt: string | null;
  userMfaEnabled: boolean;
  requiresSetup: boolean;
}

/**
 * MFA enrollment interrupt flow (Phase 2).
 *
 * The /oauth/authorize browser flow 302s to /auth/mfa/enroll?resume=<token>
 * when a tenant's REQUIRED MFA policy blocks code minting. This service:
 *
 *  - verifies resume tokens (signature / type / expiry / subject match),
 *  - enforces SINGLE USE via the ConsumedJti ledger (atomic insert; a unique
 *    violation means the token was already redeemed),
 *  - re-runs the compliance check and replays the original authorize request
 *    once the user is compliant or within grace.
 *
 * The actual TOTP enrollment happens via the existing /api/auth/mfa endpoints
 * (MfaController) — this service never duplicates them.
 */
@Injectable()
export class MfaEnrollmentService {
  private readonly logger = new Logger(MfaEnrollmentService.name);
  private readonly issuer: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly keyService: KeyService,
    private readonly oauthService: OAuthService,
    private readonly mfaService: MfaService,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
  ) {
    this.issuer = this.configService.getOrThrow<string>('BASE_URL');
  }

  /**
   * Verify a resume token WITHOUT consuming it.
   *
   * Checks: signature + issuer + expiry (via KeyService), token type, presence
   * of a jti (pre-hardening tokens are rejected), and that the token's subject
   * matches the already-authenticated idp_session user — a valid session for
   * user A must never redeem a token minted for user B.
   */
  async verifyResumeToken(
    token: string,
    expectedUserId: string,
  ): Promise<ResumeTokenPayload> {
    let payload: Record<string, unknown>;
    try {
      payload = await this.keyService.verifyJwt(token, this.issuer);
    } catch {
      throw new UnauthorizedException('Invalid or expired resume token');
    }

    if (payload.type !== 'mfa_enrollment_resume') {
      throw new UnauthorizedException('Invalid resume token type');
    }
    if (typeof payload.jti !== 'string' || !payload.jti) {
      throw new UnauthorizedException('Resume token is missing a jti');
    }
    if (payload.sub !== expectedUserId) {
      throw new UnauthorizedException(
        'Resume token does not belong to the authenticated user',
      );
    }
    if (
      typeof payload.tenant_id !== 'string' ||
      typeof payload.authorize_params !== 'object' ||
      payload.authorize_params === null
    ) {
      throw new UnauthorizedException('Malformed resume token');
    }

    return {
      sub: payload.sub,
      jti: payload.jti,
      exp: payload.exp as number,
      tenantId: payload.tenant_id,
      authorizeParams: payload.authorize_params as AuthorizeParams,
    };
  }

  /**
   * Build the context the enrollment page renders from.
   * Does NOT consume the jti — the page may reload freely before redeeming.
   */
  async getContext(
    userId: string,
    resumeToken: string,
  ): Promise<MfaEnrollmentContext> {
    const payload = await this.verifyResumeToken(resumeToken, userId);

    const [tenant, compliance] = await Promise.all([
      this.prisma.tenant.findUnique({
        where: { id: payload.tenantId },
        select: { name: true },
      }),
      this.mfaService.checkUserMfaCompliance(userId, payload.tenantId),
    ]);

    return {
      tenantName: tenant?.name ?? 'Your organization',
      tenantPolicy: compliance.tenantPolicy,
      gracePeriodEndsAt: compliance.gracePeriodEndsAt?.toISOString() ?? null,
      userMfaEnabled: compliance.mfaEnabled,
      requiresSetup: compliance.requiresSetup,
    };
  }

  /**
   * Redeem a resume token: consume its jti (single use), re-run the compliance
   * check, and replay the original authorize request.
   *
   * Compliant OR within grace → { redirectUrl } assembled exactly like the
   * normal authorize flow (code + state via URL.searchParams, so encoding is
   * identical). Still non-compliant and out of grace → 403 interaction_required.
   */
  async resume(
    userId: string,
    resumeToken: string,
  ): Promise<{ redirectUrl: string }> {
    const payload = await this.verifyResumeToken(resumeToken, userId);

    // Single use: consume BEFORE any side effects so a replayed token can
    // never mint a second authorization code.
    await this.consumeResumeJti(payload.jti, new Date(payload.exp * 1000));

    const compliance = await this.mfaService.checkUserMfaCompliance(
      userId,
      payload.tenantId,
    );

    if (!compliance.compliant && !compliance.withinGrace) {
      throw new ForbiddenException({
        error: 'interaction_required',
        reason: 'mfa_enrollment_required',
      });
    }

    const code = await this.oauthService.authorize(
      userId,
      payload.authorizeParams,
    );

    // Mirror OAuthController's redirect assembly (URL-encoded via searchParams).
    const redirectUrl = new URL(payload.authorizeParams.redirectUri);
    redirectUrl.searchParams.set('code', code);
    if (payload.authorizeParams.state) {
      redirectUrl.searchParams.set('state', payload.authorizeParams.state);
    }

    // Audit (non-fatal): the interrupted flow successfully resumed.
    await this.auditService.log({
      tenantId: payload.tenantId,
      actorUserId: userId,
      action: AUDIT_ACTIONS.MFA_ENROLLMENT_RESUMED,
      targetType: AUDIT_TARGET_TYPES.USER,
      targetId: userId,
      metadata: {
        clientId: payload.authorizeParams.clientId,
        mfaEnabled: compliance.mfaEnabled,
        withinGrace: compliance.withinGrace,
      },
    });

    return { redirectUrl: redirectUrl.toString() };
  }

  /**
   * Atomically record a jti as consumed. The primary-key INSERT is the
   * concurrency guard: two racing redemptions cannot both succeed.
   */
  private async consumeResumeJti(jti: string, expiresAt: Date): Promise<void> {
    try {
      await this.prisma.consumedJti.create({ data: { jti, expiresAt } });
    } catch (error) {
      // Prisma P2002 = unique constraint violation → already consumed.
      if ((error as { code?: string })?.code === 'P2002') {
        throw new UnauthorizedException(
          'Resume token has already been used',
        );
      }
      throw error;
    }
  }

  /**
   * Hourly GC of expired ledger rows. Once a token's exp has passed it can no
   * longer verify, so its ledger row no longer guards anything.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async cleanupExpiredJtis(): Promise<void> {
    const result = await this.prisma.consumedJti.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    if (result.count > 0) {
      this.logger.log(`Cleaned up ${result.count} expired consumed jti(s)`);
    }
  }
}
