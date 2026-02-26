import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  PasswordResetService,
  RequestResetDto,
  ResetPasswordDto,
  VerifyTokenDto,
} from './password-reset.service';

@Controller('auth')
export class PasswordResetController {
  constructor(private readonly passwordResetService: PasswordResetService) {}

  /**
   * Request a password reset email
   * SECURITY: Always returns the same response to prevent email enumeration
   */
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() dto: RequestResetDto) {
    await this.passwordResetService.requestReset(dto);

    // SECURITY: Always return the same response - no token, no hints!
    return {
      success: true,
      message: 'If an account exists with this email, a reset link has been sent.',
    };
  }

  /**
   * Verify a reset token is valid
   */
  @Post('verify-reset-token')
  @HttpCode(HttpStatus.OK)
  async verifyResetToken(@Body() dto: VerifyTokenDto) {
    return this.passwordResetService.verifyToken(dto);
  }

  /**
   * Reset password using a valid token
   */
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.passwordResetService.resetPassword(dto);
    return {
      success: true,
      message: 'Password has been reset successfully. Please login with your new password.',
    };
  }
}
