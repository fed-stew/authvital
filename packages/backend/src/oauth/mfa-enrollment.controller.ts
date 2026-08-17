import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { MfaEnrollmentService } from './mfa-enrollment.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../auth/interfaces/auth.interface';

/**
 * MFA Enrollment Interrupt endpoints (Phase 2 of MFA-at-mint).
 *
 * NOTE ON PATHS: /oauth/* routes are excluded from the global /api prefix
 * (see main.ts), so these live at /oauth/mfa-enrollment/* — same root as the
 * authorize endpoint that issues the resume token.
 *
 * Auth model: the caller is PRE-tenant-token — they only hold the first-party
 * `idp_session` cookie (or a Bearer console token). JwtAuthGuard accepts both
 * (see extractSessionJwt), and every request must ALSO present a valid resume
 * token whose subject matches that session's user.
 */
@Controller('oauth/mfa-enrollment')
@UseGuards(JwtAuthGuard)
@Throttle({ default: { limit: 5, ttl: 60_000 } })
export class MfaEnrollmentController {
  constructor(private readonly enrollmentService: MfaEnrollmentService) {}

  /**
   * Context for the enrollment page. Verifies the resume token (signature /
   * type / expiry / subject match) WITHOUT consuming its jti, so the page can
   * reload freely before redeeming.
   */
  @Get('context')
  async getContext(
    @Query('resume') resume: string,
    @Req() req: AuthenticatedRequest,
  ) {
    if (!resume) {
      throw new BadRequestException('resume token is required');
    }
    return this.enrollmentService.getContext(req.user.id, resume);
  }

  /**
   * Redeem the resume token (single use) and replay the original authorize
   * request. Returns { redirectUrl } on success; 403 interaction_required if
   * the user is still non-compliant and outside any grace window.
   */
  @Post('resume')
  @HttpCode(HttpStatus.OK)
  async resume(
    @Body('resume') resume: string,
    @Req() req: AuthenticatedRequest,
  ) {
    if (!resume) {
      throw new BadRequestException('resume token is required');
    }
    // Pass the session's amr so the replayed authorize can apply the
    // resume-time 'otp' append rule (see MfaEnrollmentService.resume).
    return this.enrollmentService.resume(req.user.id, resume, req.user.amr);
  }
}
