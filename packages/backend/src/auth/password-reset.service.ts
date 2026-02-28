import {
  Injectable,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from './email.service';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

export interface RequestResetDto {
  email: string;
}

export interface ResetPasswordDto {
  token: string;
  newPassword: string;
}

export interface VerifyTokenDto {
  token: string;
}

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);
  private readonly SALT_ROUNDS = 12;
  private readonly TOKEN_EXPIRY_HOURS = 24;
  private readonly baseUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {
    const baseUrl = process.env.BASE_URL;
    if (!baseUrl) {
      throw new Error('BASE_URL environment variable is required');
    }
    this.baseUrl = baseUrl;
  }

  /**
   * Request a password reset - generates a reset token and sends email
   * SECURITY: Never returns the token - only sends via email
   */
  async requestReset(dto: RequestResetDto): Promise<{ success: boolean }> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    // Always return success to prevent email enumeration
    if (!user) {
      this.logger.debug(`Password reset requested for non-existent email: ${dto.email}`);
      return { success: true };
    }

    // Generate secure reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = await bcrypt.hash(resetToken, this.SALT_ROUNDS);
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + this.TOKEN_EXPIRY_HOURS);

    // Store the token hash in user record
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: tokenHash,
        passwordResetExpires: expiresAt,
      },
    });

    // Build reset URL
    const resetUrl = `${this.baseUrl}/auth/reset-password?token=${resetToken}`;

    // Send the password reset email
    // Note: user.email is guaranteed to exist since we queried by email
    const userEmail = user.email!;
    await this.emailService.sendPasswordResetEmail(userEmail, resetToken, {
      name: user.givenName || undefined,
      resetUrl,
    });

    // Log for development ONLY (console, NEVER in API response!)
    if (process.env.NODE_ENV !== 'production') {
      this.logger.debug(`[DEV] Password reset link for ${userEmail}: ${resetUrl}`);
    }

    // SECURITY: Never return the token - only via email!
    return { success: true };
  }

  /**
   * Verify a reset token is valid (without using it)
   */
  async verifyToken(dto: VerifyTokenDto): Promise<{
    valid: boolean;
    email?: string;
  }> {
    // Find users with reset tokens that haven't expired
    const users = await this.prisma.user.findMany({
      where: {
        passwordResetToken: { not: null },
        passwordResetExpires: { gt: new Date() },
      },
    });

    for (const user of users) {
      if (!user.passwordResetToken) continue;

      // Verify token
      const isValid = await bcrypt.compare(dto.token, user.passwordResetToken);
      if (isValid) {
        return {
          valid: true,
          email: user.email ? this.maskEmail(user.email) : undefined,
        };
      }
    }

    return { valid: false };
  }

  /**
   * Reset password using the token
   */
  async resetPassword(dto: ResetPasswordDto): Promise<{ success: boolean }> {
    if (!dto.newPassword || dto.newPassword.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters');
    }

    // Find users with valid reset tokens
    const users = await this.prisma.user.findMany({
      where: {
        passwordResetToken: { not: null },
        passwordResetExpires: { gt: new Date() },
      },
    });

    for (const user of users) {
      if (!user.passwordResetToken) continue;

      // Verify token
      const isValid = await bcrypt.compare(dto.token, user.passwordResetToken);
      if (isValid) {
        // Hash new password
        const passwordHash = await bcrypt.hash(dto.newPassword, this.SALT_ROUNDS);

        // Update user and clear reset token
        await this.prisma.user.update({
          where: { id: user.id },
          data: {
            passwordHash,
            passwordResetToken: null,
            passwordResetExpires: null,
          },
        });

        // Invalidate all existing sessions for security
        await this.prisma.session.deleteMany({
          where: { userId: user.id },
        });

        return { success: true };
      }
    }

    throw new BadRequestException('Invalid or expired reset token');
  }

  /**
   * Mask email for privacy (john@example.com -> j***@e***.com)
   */
  private maskEmail(email: string): string {
    const [local, domain] = email.split('@');
    const [domainName, tld] = domain.split('.');
    return `${local[0]}***@${domainName[0]}***.${tld}`;
  }
}
