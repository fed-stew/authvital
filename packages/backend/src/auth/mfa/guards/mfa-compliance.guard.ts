import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { MfaService } from '../mfa.service';

/**
 * Defense-in-depth check that a user meets the tenant's MFA policy.
 *
 * PRIMARY enforcement happens at token mint time (oauth.service /
 * oauth-token.service): the authorize flow interrupts un-enrolled users into
 * the hosted MFA enrollment page, grace-period mints stamp `amr` and
 * `mfa_grace_expires_at` claims onto the token, and refresh-time re-checks
 * reject non-compliant sessions with `interaction_required`. A tenant-scoped
 * token in hand therefore already implies policy compliance (or an open grace
 * window).
 *
 * This guard remains as a second layer for routes that handle tenant
 * resources but may be reached with NON-tenant-scoped tokens (org-less or
 * legacy tokens minted before the claims existed), where mint-time
 * enforcement never ran for the target tenant.
 *
 * Evaluation order:
 * 1. FAST PATH (no DB hit) — trust the verified JWT claims attached to
 *    `request.user` by JwtAuthGuard:
 *    - `amr` includes 'otp'  → user has MFA; compliant under any policy.
 *    - `mfa_grace_expires_at` in the future AND the token is scoped to the
 *      requested tenant → minted under that tenant's open grace window.
 * 2. FALLBACK — `MfaService.checkUserMfaCompliance` DB check for tokens
 *    without MFA claims.
 *
 * Expects the request to have:
 * - req.user (from JwtAuthGuard) with id + verified claims
 * - req.params.tenantId OR req.body.tenantId OR req.query.tenantId
 *
 * If the user is not MFA compliant and outside the grace period,
 * throws ForbiddenException with details about what's needed.
 */
@Injectable()
export class MfaComplianceGuard implements CanActivate {
  constructor(private readonly mfaService: MfaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    // Get user ID from authenticated request
    const userId = request.user?.id;
    if (!userId) {
      // No user = let other guards handle auth
      return true;
    }

    // Get tenant ID from various sources
    const tenantId =
      request.params?.tenantId ||
      request.body?.tenantId ||
      request.query?.tenantId ||
      request.query?.tenant_id;

    if (!tenantId) {
      // No tenant context = skip MFA check
      return true;
    }

    // FAST PATH: verified JWT claims (attached by JwtAuthGuard) prove
    // compliance without a DB round-trip. Mint-time enforcement already ran
    // for tokens carrying these claims.
    if (this.satisfiedByTokenClaims(request.user, tenantId)) {
      return true;
    }

    // FALLBACK: org-less/legacy tokens carry no MFA claims — check the DB.
    // `compliant` no longer folds in the grace period — a user inside the
    // grace window is non-compliant but still allowed through.
    const compliance = await this.mfaService.checkUserMfaCompliance(userId, tenantId);

    if (!compliance.compliant && !compliance.withinGrace) {
      throw new ForbiddenException({
        error: 'mfa_required',
        message: compliance.message || 'MFA is required to access this organization.',
        requiresSetup: compliance.requiresSetup,
        mfaEnabled: compliance.mfaEnabled,
        gracePeriodEndsAt: compliance.gracePeriodEndsAt?.toISOString(),
      });
    }

    // Optionally attach compliance info to request for downstream use
    request.mfaCompliance = compliance;

    return true;
  }

  /**
   * Whether the verified token claims alone satisfy the MFA policy.
   *
   * - `amr` including 'otp' means the user has MFA enabled — compliant with
   *   every tenant policy, so tenant scope is irrelevant.
   * - `mfa_grace_expires_at` is tenant-specific (minted for the token's
   *   tenant), so it only counts when the token is scoped to the SAME tenant
   *   as the request — a grace window in tenant A must not bypass tenant B's
   *   policy.
   */
  private satisfiedByTokenClaims(
    user: {
      amr?: unknown;
      mfa_grace_expires_at?: unknown;
      tenant_id?: unknown;
    },
    tenantId: string,
  ): boolean {
    if (Array.isArray(user.amr) && user.amr.includes('otp')) {
      return true;
    }

    const graceExpiresAt = user.mfa_grace_expires_at;
    if (
      typeof graceExpiresAt === 'number' &&
      graceExpiresAt > Math.floor(Date.now() / 1000) &&
      user.tenant_id === tenantId
    ) {
      return true;
    }

    return false;
  }
}
