import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { MfaService } from './mfa/mfa.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AuthenticatedRequest } from './interfaces/auth.interface';

/**
 * Auth MFA Controller
 * Endpoints for user MFA management (setup, enable, disable, backup codes)
 */
@Controller('auth')
export class AuthMfaController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mfaService: MfaService,
  ) {}

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
