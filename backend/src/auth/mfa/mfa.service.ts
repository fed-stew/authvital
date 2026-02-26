import { Injectable, BadRequestException, UnauthorizedException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { authenticator } from 'otplib';
import * as QRCode from 'qrcode';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { KeyEncryptionService } from '../../oauth/key-encryption.service';

export interface MfaSetupResponse {
  secret: string;
  qrCodeDataUrl: string;
  backupCodes: string[];
}

export interface MfaVerifyResult {
  success: boolean;
  usedBackupCode?: boolean;
}

/**
 * MFA Service - TOTP-based Multi-Factor Authentication
 * 
 * Uses existing KeyEncryptionService (SIGNING_KEY_SECRET) for encrypting TOTP secrets.
 * Supports both regular users and super admins.
 */
@Injectable()
export class MfaService {
  private readonly issuerName: string;
  private readonly BACKUP_CODE_COUNT = 10;
  private readonly SALT_ROUNDS = 12;

  constructor(
    private readonly prisma: PrismaService,
    private readonly keyEncryption: KeyEncryptionService,
    private readonly configService: ConfigService,
  ) {
    this.issuerName = this.configService.get<string>('MFA_ISSUER_NAME', 'AuthVader');
    
    // Configure otplib - allow 1 step window for clock drift
    authenticator.options = {
      window: 1,
    };
  }

  // ===========================================================================
  // SETUP & ENROLLMENT
  // ===========================================================================

  /**
   * Generate a new TOTP secret and QR code for MFA setup
   * Does NOT save to database - that happens after verification
   */
  async generateSetup(email: string): Promise<MfaSetupResponse> {
    // Generate TOTP secret
    const secret = authenticator.generateSecret();
    
    // Generate QR code for authenticator apps
    const otpauthUrl = authenticator.keyuri(email, this.issuerName, secret);
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);
    
    // Generate backup codes
    const backupCodes = this.generateBackupCodes();
    
    return {
      secret,
      qrCodeDataUrl,
      backupCodes,
    };
  }

  /**
   * Generate a set of backup codes
   */
  private generateBackupCodes(): string[] {
    const codes: string[] = [];
    for (let i = 0; i < this.BACKUP_CODE_COUNT; i++) {
      // Format: XXXX-XXXX (8 characters + hyphen)
      const code = crypto.randomBytes(4).toString('hex').toUpperCase();
      codes.push(`${code.slice(0, 4)}-${code.slice(4)}`);
    }
    return codes;
  }

  /**
   * Hash backup codes for storage
   */
  private async hashBackupCodes(codes: string[]): Promise<string[]> {
    return Promise.all(
      codes.map(code => bcrypt.hash(code.replace('-', ''), this.SALT_ROUNDS))
    );
  }

  // ===========================================================================
  // USER MFA
  // ===========================================================================

  /**
   * Enable MFA for a user after verifying their first TOTP code
   */
  async enableMfaForUser(
    userId: string,
    secret: string,
    totpCode: string,
    backupCodes: string[],
  ): Promise<{ success: boolean }> {
    // Verify the TOTP code first
    const isValid = authenticator.verify({ token: totpCode, secret });
    
    if (!isValid) {
      throw new BadRequestException('Invalid verification code. Please try again.');
    }
    
    // Encrypt secret and hash backup codes
    const encryptedSecret = this.keyEncryption.encrypt(secret);
    const hashedBackupCodes = await this.hashBackupCodes(backupCodes);
    
    // Save to database
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        mfaEnabled: true,
        mfaSecret: encryptedSecret,
        mfaBackupCodes: hashedBackupCodes,
        mfaVerifiedAt: new Date(),
      },
    });
    
    return { success: true };
  }

  /**
   * Verify TOTP code for a user during login
   */
  async verifyUserMfa(userId: string, code: string): Promise<MfaVerifyResult> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { mfaEnabled: true, mfaSecret: true, mfaBackupCodes: true },
    });
    
    if (!user || !user.mfaEnabled || !user.mfaSecret) {
      throw new UnauthorizedException('MFA is not enabled for this user');
    }
    
    // Decrypt the secret
    const secret = this.keyEncryption.decrypt(user.mfaSecret);
    
    // Try TOTP verification first
    const isValidTotp = authenticator.verify({ token: code, secret });
    if (isValidTotp) {
      return { success: true, usedBackupCode: false };
    }
    
    // Try backup codes (format: XXXX-XXXX or XXXXXXXX)
    const normalizedCode = code.replace('-', '').toUpperCase();
    const backupResult = await this.verifyAndConsumeBackupCode(
      userId,
      normalizedCode,
      user.mfaBackupCodes,
    );
    
    if (backupResult) {
      return { success: true, usedBackupCode: true };
    }
    
    throw new UnauthorizedException('Invalid verification code');
  }

  /**
   * Check if a backup code is valid and consume it
   */
  private async verifyAndConsumeBackupCode(
    userId: string,
    code: string,
    hashedCodes: string[],
  ): Promise<boolean> {
    for (let i = 0; i < hashedCodes.length; i++) {
      const isMatch = await bcrypt.compare(code, hashedCodes[i]);
      if (isMatch) {
        // Remove the used backup code
        const updatedCodes = [...hashedCodes];
        updatedCodes.splice(i, 1);
        
        await this.prisma.user.update({
          where: { id: userId },
          data: { mfaBackupCodes: updatedCodes },
        });
        
        return true;
      }
    }
    return false;
  }

  /**
   * Disable MFA for a user (requires valid code)
   */
  async disableMfaForUser(userId: string, code: string): Promise<{ success: boolean }> {
    // Verify the code first
    await this.verifyUserMfa(userId, code);
    
    // Disable MFA
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        mfaEnabled: false,
        mfaSecret: null,
        mfaBackupCodes: [],
        mfaVerifiedAt: null,
      },
    });
    
    return { success: true };
  }

  /**
   * Regenerate backup codes for a user (requires valid TOTP code)
   */
  async regenerateBackupCodes(userId: string, totpCode: string): Promise<{ backupCodes: string[] }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { mfaSecret: true },
    });
    
    if (!user?.mfaSecret) {
      throw new BadRequestException('MFA is not enabled');
    }
    
    // Verify TOTP code
    const secret = this.keyEncryption.decrypt(user.mfaSecret);
    const isValid = authenticator.verify({ token: totpCode, secret });
    
    if (!isValid) {
      throw new UnauthorizedException('Invalid verification code');
    }
    
    // Generate and save new backup codes
    const backupCodes = this.generateBackupCodes();
    const hashedBackupCodes = await this.hashBackupCodes(backupCodes);
    
    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaBackupCodes: hashedBackupCodes },
    });
    
    return { backupCodes };
  }

  /**
   * Get MFA status for a user
   */
  async getUserMfaStatus(userId: string): Promise<{
    enabled: boolean;
    verifiedAt: Date | null;
    backupCodesRemaining: number;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { mfaEnabled: true, mfaVerifiedAt: true, mfaBackupCodes: true },
    });
    
    return {
      enabled: user?.mfaEnabled ?? false,
      verifiedAt: user?.mfaVerifiedAt ?? null,
      backupCodesRemaining: user?.mfaBackupCodes?.length ?? 0,
    };
  }

  // ===========================================================================
  // SUPER ADMIN MFA
  // ===========================================================================

  /**
   * Enable MFA for a super admin after verifying their first TOTP code
   */
  async enableMfaForSuperAdmin(
    adminId: string,
    secret: string,
    totpCode: string,
    backupCodes: string[],
  ): Promise<{ success: boolean }> {
    // Verify the TOTP code first
    const isValid = authenticator.verify({ token: totpCode, secret });
    
    if (!isValid) {
      throw new BadRequestException('Invalid verification code. Please try again.');
    }
    
    // Encrypt secret and hash backup codes
    const encryptedSecret = this.keyEncryption.encrypt(secret);
    const hashedBackupCodes = await this.hashBackupCodes(backupCodes);
    
    // Save to database
    await this.prisma.superAdmin.update({
      where: { id: adminId },
      data: {
        mfaEnabled: true,
        mfaSecret: encryptedSecret,
        mfaBackupCodes: hashedBackupCodes,
        mfaVerifiedAt: new Date(),
      },
    });
    
    return { success: true };
  }

  /**
   * Verify TOTP code for a super admin during login
   */
  async verifySuperAdminMfa(adminId: string, code: string): Promise<MfaVerifyResult> {
    const admin = await this.prisma.superAdmin.findUnique({
      where: { id: adminId },
      select: { mfaEnabled: true, mfaSecret: true, mfaBackupCodes: true },
    });
    
    if (!admin || !admin.mfaEnabled || !admin.mfaSecret) {
      throw new UnauthorizedException('MFA is not enabled for this admin');
    }
    
    // Decrypt the secret
    const secret = this.keyEncryption.decrypt(admin.mfaSecret);
    
    // Try TOTP verification first
    const isValidTotp = authenticator.verify({ token: code, secret });
    if (isValidTotp) {
      return { success: true, usedBackupCode: false };
    }
    
    // Try backup codes
    const normalizedCode = code.replace('-', '').toUpperCase();
    const backupResult = await this.verifyAndConsumeSuperAdminBackupCode(
      adminId,
      normalizedCode,
      admin.mfaBackupCodes,
    );
    
    if (backupResult) {
      return { success: true, usedBackupCode: true };
    }
    
    throw new UnauthorizedException('Invalid verification code');
  }

  /**
   * Check if a backup code is valid and consume it (super admin)
   */
  private async verifyAndConsumeSuperAdminBackupCode(
    adminId: string,
    code: string,
    hashedCodes: string[],
  ): Promise<boolean> {
    for (let i = 0; i < hashedCodes.length; i++) {
      const isMatch = await bcrypt.compare(code, hashedCodes[i]);
      if (isMatch) {
        // Remove the used backup code
        const updatedCodes = [...hashedCodes];
        updatedCodes.splice(i, 1);
        
        await this.prisma.superAdmin.update({
          where: { id: adminId },
          data: { mfaBackupCodes: updatedCodes },
        });
        
        return true;
      }
    }
    return false;
  }

  /**
   * Disable MFA for a super admin (requires valid code)
   */
  async disableMfaForSuperAdmin(adminId: string, code: string): Promise<{ success: boolean }> {
    // Check if MFA is required by policy
    const mfaRequired = await this.isSuperAdminMfaRequired();
    if (mfaRequired) {
      throw new BadRequestException(
        'Cannot disable MFA while it is required for all super admins. Disable the requirement first.'
      );
    }

    // Verify the code first
    await this.verifySuperAdminMfa(adminId, code);
    
    // Disable MFA
    await this.prisma.superAdmin.update({
      where: { id: adminId },
      data: {
        mfaEnabled: false,
        mfaSecret: null,
        mfaBackupCodes: [],
        mfaVerifiedAt: null,
      },
    });
    
    return { success: true };
  }

  /**
   * Get MFA status for a super admin
   */
  async getSuperAdminMfaStatus(adminId: string): Promise<{
    enabled: boolean;
    verifiedAt: Date | null;
    backupCodesRemaining: number;
  }> {
    const admin = await this.prisma.superAdmin.findUnique({
      where: { id: adminId },
      select: { mfaEnabled: true, mfaVerifiedAt: true, mfaBackupCodes: true },
    });
    
    return {
      enabled: admin?.mfaEnabled ?? false,
      verifiedAt: admin?.mfaVerifiedAt ?? null,
      backupCodesRemaining: admin?.mfaBackupCodes?.length ?? 0,
    };
  }

  // ===========================================================================
  // INSTANCE MFA POLICY
  // ===========================================================================

  /**
   * Check if super admin MFA is required at the instance level
   */
  async isSuperAdminMfaRequired(): Promise<boolean> {
    const instance = await this.prisma.instanceMeta.findFirst();
    return instance?.superAdminMfaRequired ?? false;
  }

  /**
   * Update instance-level super admin MFA requirement
   */
  async setSuperAdminMfaRequired(required: boolean): Promise<void> {
    await this.prisma.instanceMeta.updateMany({
      data: { superAdminMfaRequired: required },
    });
  }

  // ===========================================================================
  // TENANT MFA POLICY
  // ===========================================================================

  /**
   * Get the MFA policy for a tenant
   */
  async getTenantMfaPolicy(tenantId: string): Promise<{
    policy: string;  // MfaPolicy enum value
    gracePeriodDays: number;
  }> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { mfaPolicy: true, mfaGracePeriodDays: true },
    });
    
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    
    return {
      policy: tenant.mfaPolicy,
      gracePeriodDays: tenant.mfaGracePeriodDays,
    };
  }

  /**
   * Update the MFA policy for a tenant
   */
  async updateTenantMfaPolicy(
    tenantId: string,
    policy: 'DISABLED' | 'OPTIONAL' | 'ENCOURAGED' | 'REQUIRED',
    gracePeriodDays?: number,
  ): Promise<{ success: boolean }> {
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        mfaPolicy: policy,
        ...(gracePeriodDays !== undefined && { mfaGracePeriodDays: gracePeriodDays }),
      },
    });
    
    return { success: true };
  }

  /**
   * Check if a user meets the MFA requirements for a tenant
   * Returns compliance status and any grace period info
   */
  async checkUserMfaCompliance(
    userId: string,
    tenantId: string,
  ): Promise<{
    compliant: boolean;
    mfaEnabled: boolean;
    tenantPolicy: string;
    requiresSetup: boolean;
    gracePeriodEndsAt?: Date;
    message?: string;
  }> {
    const [user, tenant, membership] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { mfaEnabled: true },
      }),
      this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { mfaPolicy: true, mfaGracePeriodDays: true },
      }),
      this.prisma.membership.findFirst({
        where: { userId, tenantId },
        select: { joinedAt: true, createdAt: true },
      }),
    ]);
    
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    
    const mfaEnabled = user?.mfaEnabled ?? false;
    const policy = tenant.mfaPolicy;
    
    // DISABLED or OPTIONAL - always compliant
    if (policy === 'DISABLED' || policy === 'OPTIONAL') {
      return {
        compliant: true,
        mfaEnabled,
        tenantPolicy: policy,
        requiresSetup: false,
      };
    }
    
    // ENCOURAGED - compliant but we suggest setup
    if (policy === 'ENCOURAGED') {
      return {
        compliant: true,
        mfaEnabled,
        tenantPolicy: policy,
        requiresSetup: !mfaEnabled,
        message: mfaEnabled ? undefined : 'Your organization recommends enabling MFA for additional security.',
      };
    }
    
    // REQUIRED - check if MFA is enabled or within grace period
    if (mfaEnabled) {
      return {
        compliant: true,
        mfaEnabled: true,
        tenantPolicy: policy,
        requiresSetup: false,
      };
    }
    
    // Check grace period
    const joinDate = membership?.joinedAt || membership?.createdAt || new Date();
    const gracePeriodEnd = new Date(joinDate);
    gracePeriodEnd.setDate(gracePeriodEnd.getDate() + tenant.mfaGracePeriodDays);
    
    const now = new Date();
    const withinGracePeriod = now < gracePeriodEnd;
    
    return {
      compliant: withinGracePeriod,
      mfaEnabled: false,
      tenantPolicy: policy,
      requiresSetup: true,
      gracePeriodEndsAt: gracePeriodEnd,
      message: withinGracePeriod
        ? `MFA is required. Please set it up before ${gracePeriodEnd.toLocaleDateString()}.`
        : 'MFA is required to access this organization. Please enable MFA to continue.',
    };
  }

  /**
   * Get MFA compliance stats for a tenant (admin view)
   */
  async getTenantMfaStats(tenantId: string): Promise<{
    totalMembers: number;
    mfaEnabled: number;
    mfaDisabled: number;
    complianceRate: number;
  }> {
    const members = await this.prisma.membership.findMany({
      where: { tenantId, status: 'ACTIVE' },
      include: {
        user: {
          select: { mfaEnabled: true },
        },
      },
    });
    
    const totalMembers = members.length;
    const mfaEnabled = members.filter(m => m.user.mfaEnabled).length;
    const mfaDisabled = totalMembers - mfaEnabled;
    const complianceRate = totalMembers > 0 ? Math.round((mfaEnabled / totalMembers) * 100) : 0;
    
    return {
      totalMembers,
      mfaEnabled,
      mfaDisabled,
      complianceRate,
    };
  }
}
