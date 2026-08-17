import { ForbiddenException } from '@nestjs/common';

export interface MfaEnrollmentRequiredPayload {
  tenantId: string;
  requiresSetup: boolean;
  gracePeriodEndsAt?: Date;
}

/**
 * Thrown when a full tenant-scoped token cannot be minted because the tenant's
 * MFA policy is REQUIRED, the user is not enrolled, and no grace period applies.
 *
 * The /oauth/authorize browser flow catches this and 302-redirects to the MFA
 * enrollment page with a short-lived resume token; API surfaces fall through to
 * the standard ForbiddenException JSON body below.
 */
export class MfaEnrollmentRequiredException extends ForbiddenException {
  constructor(payload: MfaEnrollmentRequiredPayload) {
    super({
      error: 'interaction_required',
      reason: 'mfa_enrollment_required',
      tenantId: payload.tenantId,
      requiresSetup: payload.requiresSetup,
      gracePeriodEndsAt: payload.gracePeriodEndsAt?.toISOString(),
    });
  }
}
