import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KeyService } from '../../oauth/key.service';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { MfaService } from '../../auth/mfa/mfa.service';
import { EmailService } from '../../auth/email.service';

/**
 * Handles super admin authentication and account management.
 * Focused on: login, logout, password management, and admin CRUD.
 */
@Injectable()
export class AdminAuthService {
  private readonly SALT_ROUNDS = 12;

  constructor(
    private readonly prisma: PrismaService,
    private readonly keyService: KeyService,
    private readonly configService: ConfigService,
    private readonly mfaService: MfaService,
    private readonly emailService: EmailService,
  ) {}

  /**
   * Authenticate a super admin and issue JWT
   * Supports MFA flow - returns challenge token if MFA is required
   */
  async login(email: string, password: string): Promise<{
    // Success without MFA
    accessToken?: string;
    admin?: { id: string; email: string; displayName: string | null };
    mustChangePassword?: boolean;
    // MFA required
    mfaRequired?: boolean;
    mfaSetupRequired?: boolean;
    mfaChallengeToken?: string;
  }> {
    const normalizedEmail = email.toLowerCase();

    const admin = await this.prisma.superAdmin.findUnique({
      where: { email: normalizedEmail },
    });

    if (!admin) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!admin.isActive) {
      throw new ForbiddenException('Account is deactivated');
    }

    const isPasswordValid = await bcrypt.compare(password, admin.passwordHash);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check if MFA is required
    const instanceMfaRequired = await this.mfaService.isSuperAdminMfaRequired();

    if (admin.mfaEnabled || instanceMfaRequired) {
      if (admin.mfaEnabled) {
        // MFA is set up, require verification
        const challengeToken = await this.issueMfaChallengeToken(admin.id, admin.email);
        return {
          mfaRequired: true,
          mfaChallengeToken: challengeToken,
        };
      } else {
        // MFA required by instance but not set up yet
        const challengeToken = await this.issueMfaChallengeToken(admin.id, admin.email);
        return {
          mfaSetupRequired: true,
          mfaChallengeToken: challengeToken,
        };
      }
    }

    // No MFA required - issue token as normal
    await this.prisma.superAdmin.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() },
    });

    const issuer = this.configService.getOrThrow<string>('BASE_URL');
    const accessToken = await this.keyService.signJwt(
      { email: admin.email, type: 'super_admin' },
      {
        subject: admin.id,
        issuer,
        expiresIn: 7 * 24 * 60 * 60, // 7 days
      },
    );

    return {
      accessToken,
      admin: {
        id: admin.id,
        email: admin.email,
        displayName: admin.displayName,
      },
      mustChangePassword: admin.mustChangePassword,
    };
  }

  /**
   * Issue a short-lived challenge token for MFA verification
   */
  private async issueMfaChallengeToken(adminId: string, email: string): Promise<string> {
    const issuer = this.configService.getOrThrow<string>('BASE_URL');
    return this.keyService.signJwt(
      { email, type: 'mfa_challenge', adminType: 'super_admin' },
      {
        subject: adminId,
        issuer,
        expiresIn: 5 * 60, // 5 minutes - short lived
      },
    );
  }

  /**
   * Verify MFA code and complete login
   */
  async verifyMfaAndLogin(challengeToken: string, code: string): Promise<{
    accessToken: string;
    admin: { id: string; email: string; displayName: string | null };
    mustChangePassword: boolean;
  }> {
    // Get issuer from config
    const issuer = this.configService.getOrThrow<string>('BASE_URL');

    // Verify challenge token - pass issuer as second argument
    const payload = await this.keyService.verifyJwt(challengeToken, issuer);

    if (payload.type !== 'mfa_challenge' || payload.adminType !== 'super_admin') {
      throw new UnauthorizedException('Invalid challenge token');
    }

    // payload.sub is the admin ID - ensure it's defined
    const adminId = payload.sub;
    if (!adminId) {
      throw new UnauthorizedException('Invalid challenge token');
    }

    // Verify MFA code
    await this.mfaService.verifySuperAdminMfa(adminId, code);

    // Get admin and issue access token
    const admin = await this.prisma.superAdmin.findUnique({
      where: { id: adminId },
    });

    if (!admin || !admin.isActive) {
      throw new UnauthorizedException('Invalid challenge token');
    }

    // Update last login
    await this.prisma.superAdmin.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() },
    });

    // Issue access token (reuse issuer from above)
    const accessToken = await this.keyService.signJwt(
      { email: admin.email, type: 'super_admin' },
      {
        subject: admin.id,
        issuer,
        expiresIn: 7 * 24 * 60 * 60,
      },
    );

    return {
      accessToken,
      admin: {
        id: admin.id,
        email: admin.email,
        displayName: admin.displayName,
      },
      mustChangePassword: admin.mustChangePassword,
    };
  }

  /**
   * Change password for a super admin
   */
  async changePassword(adminId: string, currentPassword: string, newPassword: string) {
    const admin = await this.prisma.superAdmin.findUnique({
      where: { id: adminId },
    });

    if (!admin) {
      throw new NotFoundException('Admin not found');
    }

    const isPasswordValid = await bcrypt.compare(currentPassword, admin.passwordHash);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    if (newPassword.length < 8) {
      throw new BadRequestException('New password must be at least 8 characters');
    }

    const newPasswordHash = await bcrypt.hash(newPassword, this.SALT_ROUNDS);

    await this.prisma.superAdmin.update({
      where: { id: adminId },
      data: {
        passwordHash: newPasswordHash,
        mustChangePassword: false,
      },
    });

    // Issue new token after password change
    const issuer = this.configService.get<string>('BASE_URL', 'http://localhost:8000');
    const accessToken = await this.keyService.signJwt(
      { email: admin.email, type: 'super_admin' },
      {
        subject: admin.id,
        issuer,
        expiresIn: 7 * 24 * 60 * 60,
      },
    );

    return { accessToken };
  }

  /**
   * Create a new super admin account
   * If password is not provided, generates a random one and emails it
   */
  async createSuperAdmin(data: {
    email: string;
    password?: string;
    givenName?: string;
    familyName?: string;
    displayName?: string;
  }) {
    const normalizedEmail = data.email.toLowerCase();

    const existing = await this.prisma.superAdmin.findUnique({
      where: { email: normalizedEmail },
    });

    if (existing) {
      throw new ConflictException('Email already registered');
    }

    // Generate password if not provided
    const generatedPassword = data.password ? null : this.generateSecurePassword();
    const finalPassword = data.password || generatedPassword!;
    const passwordHash = await bcrypt.hash(finalPassword, this.SALT_ROUNDS);

    // Build display name if not provided
    const displayName = data.displayName || 
      [data.givenName, data.familyName].filter(Boolean).join(' ') || 
      null;

    const admin = await this.prisma.superAdmin.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        givenName: data.givenName,
        familyName: data.familyName,
        displayName,
        mustChangePassword: !data.password,
      },
    });

    // Send welcome email with credentials if password was auto-generated
    if (generatedPassword) {
      await this.sendAdminWelcomeEmail(normalizedEmail, generatedPassword, displayName);
    }

    return {
      id: admin.id,
      email: admin.email,
      givenName: admin.givenName,
      familyName: admin.familyName,
      displayName: admin.displayName,
      createdAt: admin.createdAt,
      passwordGenerated: !!generatedPassword,
    };
  }

  /**
   * Generate a secure random password
   */
  private generateSecurePassword(): string {
    const length = 16;
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    const randomBytes = crypto.randomBytes(length);
    let password = '';
    for (let i = 0; i < length; i++) {
      password += charset[randomBytes[i] % charset.length];
    }
    return password;
  }

  /**
   * Send welcome email to new admin with credentials
   */
  private async sendAdminWelcomeEmail(email: string, password: string, displayName?: string | null): Promise<void> {
    const baseUrl = this.configService.getOrThrow<string>('BASE_URL');
    const loginUrl = `${baseUrl}/admin/login`;

    const subject = 'Your AuthVader Admin Account';
    const text = `
Hi${displayName ? ` ${displayName}` : ''},

You have been added as a Super Admin to AuthVader.

Login URL: ${loginUrl}
Email: ${email}
Temporary Password: ${password}

You will be required to change your password on first login.

If you didn't expect this invitation, please contact your administrator.
`.trim();

    const html = `
<p>Hi${displayName ? ` ${displayName}` : ''},</p>
<p>You have been added as a <strong>Super Admin</strong> to AuthVader.</p>
<p><strong>Login URL:</strong> <a href="${loginUrl}">${loginUrl}</a></p>
<p><strong>Email:</strong> ${email}</p>
<p><strong>Temporary Password:</strong> <code>${password}</code></p>
<p>You will be required to change your password on first login.</p>
<p style="color: #666; font-size: 12px;">If you didn't expect this invitation, please contact your administrator.</p>
`.trim();

    await this.emailService.send({ to: email, subject, text, html });
  }

  /**
   * Get super admin profile
   */
  async getProfile(adminId: string) {
    const admin = await this.prisma.superAdmin.findUnique({
      where: { id: adminId },
      select: {
        id: true,
        email: true,
        emailVerified: true,
        username: true,
        displayName: true,
        givenName: true,
        familyName: true,
        middleName: true,
        nickname: true,
        pictureUrl: true,
        website: true,
        gender: true,
        birthdate: true,
        zoneinfo: true,
        locale: true,
        phone: true,
        phoneVerified: true,
        isActive: true,
        lastLoginAt: true,
        mfaEnabled: true,
        createdAt: true,
      },
    });

    if (!admin) {
      throw new NotFoundException('Admin not found');
    }

    return admin;
  }

  /**
   * Validate a super admin exists and is active (for guards)
   */
  async validateSuperAdmin(adminId: string) {
    const admin = await this.prisma.superAdmin.findUnique({
      where: { id: adminId },
      select: { id: true, email: true, isActive: true },
    });

    if (!admin || !admin.isActive) {
      return null;
    }

    return admin;
  }

  /**
   * Get all super admins
   */
  async getSuperAdmins() {
    const admins = await this.prisma.superAdmin.findMany({
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        givenName: true,
        familyName: true,
        pictureUrl: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return admins;
  }

  /**
   * Delete a super admin (cannot delete yourself)
   */
  async deleteSuperAdmin(adminId: string, requestingAdminId: string) {
    if (adminId === requestingAdminId) {
      throw new ForbiddenException('Cannot delete your own account');
    }

    const admin = await this.prisma.superAdmin.findUnique({
      where: { id: adminId },
    });

    if (!admin) {
      throw new NotFoundException('Super admin not found');
    }

    await this.prisma.superAdmin.delete({
      where: { id: adminId },
    });

    return { success: true, message: 'Super admin deleted' };
  }
}
