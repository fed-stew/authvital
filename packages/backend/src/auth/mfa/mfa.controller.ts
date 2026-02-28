import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { MfaService } from './mfa.service';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../interfaces/auth.interface';

/**
 * MFA Controller - User-facing MFA management endpoints
 * 
 * All endpoints require authentication via JwtAuthGuard.
 * For super admin MFA, see SuperAdminController.
 */
@Controller('auth/mfa')
@UseGuards(JwtAuthGuard)
export class MfaController {
  constructor(private readonly mfaService: MfaService) {}

  /**
   * Get current MFA status for the authenticated user
   */
  @Get('status')
  async getStatus(@Request() req: AuthenticatedRequest) {
    return this.mfaService.getUserMfaStatus(req.user.id);
  }

  /**
   * Start MFA setup - generates secret and QR code
   * Returns the secret and backup codes (only shown once!)
   */
  @Post('setup')
  async setup(@Request() req: AuthenticatedRequest) {
    // Get user email for QR code
    const user = await this.mfaService['prisma'].user.findUnique({
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
  @Post('enable')
  @HttpCode(HttpStatus.OK)
  async enable(
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
  @Delete('disable')
  @HttpCode(HttpStatus.OK)
  async disable(
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
  @Post('backup-codes')
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

  /**
   * Verify MFA code (used during login flow)
   * This endpoint is typically called with a challenge token, not full auth
   */
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  async verify(
    @Request() req: AuthenticatedRequest,
    @Body() body: { code: string },
  ) {
    if (!body.code) {
      throw new BadRequestException('Verification code is required');
    }

    return this.mfaService.verifyUserMfa(req.user.id, body.code);
  }
}
