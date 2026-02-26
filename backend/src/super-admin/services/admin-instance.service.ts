import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { InstanceService } from '../../instance/instance.service';

/**
 * Handles instance-level operations for super admins.
 * Focused on: System stats, instance config, and API key management.
 */
@Injectable()
export class AdminInstanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly instanceService: InstanceService,
  ) {}

  // ===========================================================================
  // SYSTEM STATS
  // ===========================================================================

  /**
   * Get overview stats for the super admin dashboard
   */
  async getSystemStats() {
    const [users, tenants, superAdmins, applications] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.tenant.count(),
      this.prisma.superAdmin.count(),
      this.prisma.application.count(),
    ]);

    return { users, tenants, superAdmins, applications };
  }

  /**
   * Get detailed system stats with trends
   */
  async getDetailedStats() {
    const now = new Date();
    const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const lastMonth = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      usersLastWeek,
      usersLastMonth,
      totalTenants,
      tenantsLastWeek,
      totalApplications,
      totalSubscriptions,
      activeSubscriptions,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { createdAt: { gte: lastWeek } } }),
      this.prisma.user.count({ where: { createdAt: { gte: lastMonth } } }),
      this.prisma.tenant.count(),
      this.prisma.tenant.count({ where: { createdAt: { gte: lastWeek } } }),
      this.prisma.application.count(),
      this.prisma.appSubscription.count(),
      this.prisma.appSubscription.count({ where: { status: 'ACTIVE' } }),
    ]);

    return {
      users: {
        total: totalUsers,
        newLastWeek: usersLastWeek,
        newLastMonth: usersLastMonth,
      },
      tenants: {
        total: totalTenants,
        newLastWeek: tenantsLastWeek,
      },
      applications: {
        total: totalApplications,
      },
      subscriptions: {
        total: totalSubscriptions,
        active: activeSubscriptions,
      },
    };
  }

  // ===========================================================================
  // INSTANCE CONFIGURATION
  // ===========================================================================

  /**
   * Get the current instance configuration
   */
  async getInstanceConfig() {
    const config = await this.instanceService.getSignupConfig();
    const branding = await this.instanceService.getBrandingConfig();
    const instanceMeta = await this.instanceService.getInstanceMeta();

    return {
      ...config,
      branding,
      instanceName: instanceMeta?.name,
      instanceUuid: instanceMeta?.instanceUuid,
    };
  }

  /**
   * Update instance configuration
   */
  async updateInstanceConfig(data: {
    instanceName?: string;
    logoUrl?: string;
    faviconUrl?: string;
    primaryColor?: string;
    signupEnabled?: boolean;
    inviteOnly?: boolean;
    publicSignup?: boolean;
    requireEmailVerification?: boolean;
    requiredUserFields?: string[];
    allowedDomains?: string[];
    blockedDomains?: string[];
    passwordMinLength?: number;
    passwordRequireUppercase?: boolean;
    passwordRequireLowercase?: boolean;
    passwordRequireNumbers?: boolean;
    passwordRequireSymbols?: boolean;
    mfaRequired?: boolean;
    mfaEnabled?: boolean;
    sessionTimeoutMinutes?: number;
    allowSignUp?: boolean;
    autoCreateTenant?: boolean;
    allowGenericDomains?: boolean;
    allowAnonymousSignUp?: boolean;
    singleTenantMode?: boolean;
    defaultTenantId?: string | null;
    // Branding fields
    brandingName?: string;
    brandingLogoUrl?: string;
    brandingIconUrl?: string;
    brandingPrimaryColor?: string;
    brandingBackgroundColor?: string;
    brandingAccentColor?: string;
    brandingSupportUrl?: string;
    brandingPrivacyUrl?: string;
    brandingTermsUrl?: string;
    initiateLoginUri?: string;
  }) {
    // Use the InstanceService to update
    return this.instanceService.updateInstanceMeta({
      name: data.instanceName,
      allowSignUp: data.allowSignUp ?? data.signupEnabled,
      autoCreateTenant: data.autoCreateTenant,
      allowGenericDomains: data.allowGenericDomains,
      allowAnonymousSignUp: data.allowAnonymousSignUp,
      requiredUserFields: data.requiredUserFields,
      singleTenantMode: data.singleTenantMode,
      defaultTenantId: data.defaultTenantId,
      brandingName: data.brandingName,
      brandingLogoUrl: data.brandingLogoUrl ?? data.logoUrl,
      brandingIconUrl: data.brandingIconUrl ?? data.faviconUrl,
      brandingPrimaryColor: data.brandingPrimaryColor ?? data.primaryColor,
      brandingBackgroundColor: data.brandingBackgroundColor,
      brandingAccentColor: data.brandingAccentColor,
      brandingSupportUrl: data.brandingSupportUrl,
      brandingPrivacyUrl: data.brandingPrivacyUrl,
      brandingTermsUrl: data.brandingTermsUrl,
      initiateLoginUri: data.initiateLoginUri,
    });
  }

  // ===========================================================================
  // INSTANCE API KEYS (for system integrations)
  // Uses the InstanceApiKey model (separate from user ApiKeys)
  // ===========================================================================

  /**
   * Get all instance-level API keys
   */
  async getInstanceApiKeys() {
    const keys = await this.prisma.instanceApiKey.findMany({
      select: {
        id: true,
        name: true,
        prefix: true,
        description: true,
        permissions: true,
        lastUsedAt: true,
        expiresAt: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return keys;
  }

  /**
   * Create an instance-level API key
   */
  async createInstanceApiKey(
    name: string,
    permissions: string[] = ['instance:*'],
    expiresAt?: Date,
    description?: string,
  ) {
    // Generate a secure API key
    const rawKey = `ik_live_${crypto.randomBytes(24).toString('hex')}`;
    const prefix = rawKey.substring(0, 12);
    const keyHash = await bcrypt.hash(rawKey, 12);

    const apiKey = await this.prisma.instanceApiKey.create({
      data: {
        name,
        prefix,
        keyHash,
        description,
        permissions,
        expiresAt,
        isActive: true,
      },
    });

    return {
      key: rawKey,
      keyId: apiKey.id,
      prefix: apiKey.prefix,
      name: apiKey.name,
      warning: 'Store this API key securely. It will not be shown again.',
    };
  }

  /**
   * Revoke an instance API key (soft delete)
   */
  async revokeInstanceApiKey(keyId: string) {
    const key = await this.prisma.instanceApiKey.findUnique({
      where: { id: keyId },
    });

    if (!key) {
      throw new NotFoundException('API key not found');
    }

    await this.prisma.instanceApiKey.update({
      where: { id: keyId },
      data: { isActive: false },
    });

    return { success: true, message: 'API key revoked' };
  }

  /**
   * Delete an instance API key permanently
   */
  async deleteInstanceApiKey(keyId: string) {
    const key = await this.prisma.instanceApiKey.findUnique({
      where: { id: keyId },
    });

    if (!key) {
      throw new NotFoundException('API key not found');
    }

    await this.prisma.instanceApiKey.delete({
      where: { id: keyId },
    });

    return { success: true, message: 'API key deleted' };
  }
}
