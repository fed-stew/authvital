import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SsoEncryptionService } from './sso-encryption.service';
import { SsoProviderType } from '@prisma/client';

export interface TenantSsoConfigDto {
  provider: SsoProviderType;
  enabled?: boolean;
  clientId?: string | null;
  clientSecret?: string | null;
  enforced?: boolean;
  allowedDomains?: string[];
}

export interface EffectiveSsoConfig {
  provider: SsoProviderType;
  enabled: boolean;
  clientId: string;
  clientSecret: string;
  scopes: string[];
  allowedDomains: string[];
  enforced: boolean;
  source: 'instance' | 'tenant';
}

@Injectable()
export class TenantSsoConfigService {
  private readonly logger = new Logger(TenantSsoConfigService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: SsoEncryptionService,
  ) {}

  /**
   * Get tenant SSO configs (without decrypted secrets)
   */
  async getTenantSsoConfigs(tenantId: string) {
    const configs = await this.prisma.tenantSsoConfig.findMany({
      where: { tenantId },
    });

    return configs.map((c) => ({
      id: c.id,
      provider: c.provider,
      enabled: c.enabled,
      clientId: c.clientId,
      hasCustomCredentials: !!c.clientId && !!c.clientSecretEnc,
      enforced: c.enforced,
      allowedDomains: c.allowedDomains,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));
  }

  /**
   * Get the effective SSO config for a tenant + provider
   * Merges instance-level config with tenant overrides
   */
  async getEffectiveSsoConfig(
    tenantId: string | null,
    provider: SsoProviderType,
  ): Promise<EffectiveSsoConfig | null> {
    // Get instance-level config
    const instanceConfig = await this.prisma.ssoProvider.findUnique({
      where: { provider },
    });

    if (!instanceConfig || !instanceConfig.enabled) {
      return null; // Provider not configured at instance level
    }

    // If no tenant context, return instance config
    if (!tenantId) {
      return {
        provider,
        enabled: instanceConfig.enabled,
        clientId: instanceConfig.clientId,
        clientSecret: this.encryption.decrypt(instanceConfig.clientSecretEnc),
        scopes: instanceConfig.scopes,
        allowedDomains: instanceConfig.allowedDomains,
        enforced: false,
        source: 'instance',
      };
    }

    // Get tenant-level override
    const tenantConfig = await this.prisma.tenantSsoConfig.findUnique({
      where: { tenantId_provider: { tenantId, provider } },
    });

    // If tenant has disabled this provider, return null
    if (tenantConfig && !tenantConfig.enabled) {
      return null;
    }

    // Merge configs - tenant overrides instance
    const hasCustomCredentials = tenantConfig?.clientId && tenantConfig?.clientSecretEnc;

    return {
      provider,
      enabled: tenantConfig?.enabled ?? instanceConfig.enabled,
      clientId: hasCustomCredentials ? tenantConfig!.clientId! : instanceConfig.clientId,
      clientSecret: hasCustomCredentials
        ? this.encryption.decrypt(tenantConfig!.clientSecretEnc!)
        : this.encryption.decrypt(instanceConfig.clientSecretEnc),
      scopes: instanceConfig.scopes, // Always use instance scopes
      allowedDomains: tenantConfig?.allowedDomains?.length
        ? tenantConfig.allowedDomains
        : instanceConfig.allowedDomains,
      enforced: tenantConfig?.enforced ?? false,
      source: hasCustomCredentials ? 'tenant' : 'instance',
    };
  }

  /**
   * Get all enabled SSO providers for a tenant (for login UI)
   */
  async getEnabledProvidersForTenant(tenantId: string | null) {
    // Get all instance-level enabled providers
    const instanceProviders = await this.prisma.ssoProvider.findMany({
      where: { enabled: true },
      select: { provider: true },
    });

    if (!tenantId) {
      // No tenant context - return all instance-enabled providers
      return instanceProviders.map((p) => ({
        provider: p.provider,
        enforced: false,
      }));
    }

    // Get tenant overrides
    const tenantConfigs = await this.prisma.tenantSsoConfig.findMany({
      where: { tenantId },
    });

    const tenantConfigMap = new Map(tenantConfigs.map((c) => [c.provider, c]));

    // Filter and merge
    const result: { provider: SsoProviderType; enforced: boolean }[] = [];

    for (const ip of instanceProviders) {
      const tenantOverride = tenantConfigMap.get(ip.provider);

      // Skip if tenant has explicitly disabled
      if (tenantOverride && !tenantOverride.enabled) {
        continue;
      }

      result.push({
        provider: ip.provider,
        enforced: tenantOverride?.enforced ?? false,
      });
    }

    return result;
  }

  /**
   * Check if a tenant has SSO enforced (password login disabled)
   */
  async isSsoEnforcedForTenant(tenantId: string): Promise<boolean> {
    const enforcedConfig = await this.prisma.tenantSsoConfig.findFirst({
      where: { tenantId, enforced: true, enabled: true },
    });
    return !!enforcedConfig;
  }

  /**
   * Upsert tenant SSO config
   */
  async upsertTenantSsoConfig(tenantId: string, dto: TenantSsoConfigDto) {
    // Verify instance-level provider exists and is enabled
    const instanceConfig = await this.prisma.ssoProvider.findUnique({
      where: { provider: dto.provider },
    });

    if (!instanceConfig || !instanceConfig.enabled) {
      throw new ForbiddenException(
        `SSO provider ${dto.provider} is not enabled at the instance level`,
      );
    }

    // Encrypt secret if provided
    let clientSecretEnc: string | null = null;
    if (dto.clientSecret) {
      clientSecretEnc = this.encryption.encrypt(dto.clientSecret);
    }

    const config = await this.prisma.tenantSsoConfig.upsert({
      where: { tenantId_provider: { tenantId, provider: dto.provider } },
      create: {
        tenantId,
        provider: dto.provider,
        enabled: dto.enabled ?? true,
        clientId: dto.clientId,
        clientSecretEnc,
        enforced: dto.enforced ?? false,
        allowedDomains: dto.allowedDomains ?? [],
      },
      update: {
        enabled: dto.enabled,
        clientId: dto.clientId,
        clientSecretEnc: dto.clientSecret ? clientSecretEnc : undefined,
        enforced: dto.enforced,
        allowedDomains: dto.allowedDomains,
      },
    });

    this.logger.log(`Tenant ${tenantId} SSO config updated for ${dto.provider}`);

    return {
      id: config.id,
      provider: config.provider,
      enabled: config.enabled,
      hasCustomCredentials: !!config.clientId && !!config.clientSecretEnc,
      enforced: config.enforced,
      allowedDomains: config.allowedDomains,
    };
  }

  /**
   * Delete tenant SSO config (revert to instance defaults)
   */
  async deleteTenantSsoConfig(tenantId: string, provider: SsoProviderType) {
    const existing = await this.prisma.tenantSsoConfig.findUnique({
      where: { tenantId_provider: { tenantId, provider } },
    });

    if (!existing) {
      throw new NotFoundException(`Tenant SSO config for ${provider} not found`);
    }

    await this.prisma.tenantSsoConfig.delete({
      where: { tenantId_provider: { tenantId, provider } },
    });

    this.logger.log(`Tenant ${tenantId} SSO config deleted for ${provider}`);

    return { success: true, message: `Tenant SSO config for ${provider} removed` };
  }
}
