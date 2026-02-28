import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SsoEncryptionService } from './sso-encryption.service';
import { SsoProviderType } from '@prisma/client';

export interface CreateSsoProviderDto {
  provider: SsoProviderType;
  clientId: string;
  clientSecret: string;
  enabled?: boolean;
  scopes?: string[];
  allowedDomains?: string[];
  autoCreateUser?: boolean;
  autoLinkExisting?: boolean;
}

export interface UpdateSsoProviderDto {
  clientId?: string;
  clientSecret?: string;
  enabled?: boolean;
  scopes?: string[];
  allowedDomains?: string[];
  autoCreateUser?: boolean;
  autoLinkExisting?: boolean;
}

@Injectable()
export class SsoProviderService {
  private readonly logger = new Logger(SsoProviderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: SsoEncryptionService,
  ) {}

  /**
   * Get all SSO providers (without decrypted secrets)
   */
  async getAllProviders() {
    const providers = await this.prisma.ssoProvider.findMany({
      orderBy: { provider: 'asc' },
    });

    return providers.map((p) => ({
      id: p.id,
      provider: p.provider,
      enabled: p.enabled,
      clientId: p.clientId,
      hasSecret: !!p.clientSecretEnc,
      scopes: p.scopes,
      allowedDomains: p.allowedDomains,
      autoCreateUser: p.autoCreateUser,
      autoLinkExisting: p.autoLinkExisting,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));
  }

  /**
   * Get a specific provider by type
   */
  async getProvider(provider: SsoProviderType) {
    const ssoProvider = await this.prisma.ssoProvider.findUnique({
      where: { provider },
    });

    if (!ssoProvider) {
      return null;
    }

    return {
      id: ssoProvider.id,
      provider: ssoProvider.provider,
      enabled: ssoProvider.enabled,
      clientId: ssoProvider.clientId,
      hasSecret: !!ssoProvider.clientSecretEnc,
      scopes: ssoProvider.scopes,
      allowedDomains: ssoProvider.allowedDomains,
      autoCreateUser: ssoProvider.autoCreateUser,
      autoLinkExisting: ssoProvider.autoLinkExisting,
      createdAt: ssoProvider.createdAt,
      updatedAt: ssoProvider.updatedAt,
    };
  }

  /**
   * Get provider with decrypted secret (internal use only)
   */
  async getProviderWithSecret(provider: SsoProviderType) {
    const ssoProvider = await this.prisma.ssoProvider.findUnique({
      where: { provider },
    });

    if (!ssoProvider || !ssoProvider.enabled) {
      return null;
    }

    return {
      ...ssoProvider,
      clientSecret: this.encryption.decrypt(ssoProvider.clientSecretEnc),
    };
  }

  /**
   * Create or update an SSO provider
   */
  async upsertProvider(dto: CreateSsoProviderDto) {
    const encryptedSecret = this.encryption.encrypt(dto.clientSecret);

    const provider = await this.prisma.ssoProvider.upsert({
      where: { provider: dto.provider },
      create: {
        provider: dto.provider,
        clientId: dto.clientId,
        clientSecretEnc: encryptedSecret,
        enabled: dto.enabled ?? false,
        scopes: dto.scopes ?? this.getDefaultScopes(dto.provider),
        allowedDomains: dto.allowedDomains ?? [],
        autoCreateUser: dto.autoCreateUser ?? true,
        autoLinkExisting: dto.autoLinkExisting ?? true,
      },
      update: {
        clientId: dto.clientId,
        clientSecretEnc: encryptedSecret,
        enabled: dto.enabled,
        scopes: dto.scopes,
        allowedDomains: dto.allowedDomains,
        autoCreateUser: dto.autoCreateUser,
        autoLinkExisting: dto.autoLinkExisting,
      },
    });

    this.logger.log(`SSO provider ${dto.provider} configured`);

    return {
      id: provider.id,
      provider: provider.provider,
      enabled: provider.enabled,
      clientId: provider.clientId,
      hasSecret: true,
    };
  }

  /**
   * Update an existing SSO provider
   */
  async updateProvider(provider: SsoProviderType, dto: UpdateSsoProviderDto) {
    const existing = await this.prisma.ssoProvider.findUnique({
      where: { provider },
    });

    if (!existing) {
      throw new NotFoundException(`SSO provider ${provider} not configured`);
    }

    const updateData: any = {};

    if (dto.clientId !== undefined) updateData.clientId = dto.clientId;
    if (dto.clientSecret !== undefined) {
      updateData.clientSecretEnc = this.encryption.encrypt(dto.clientSecret);
    }
    if (dto.enabled !== undefined) updateData.enabled = dto.enabled;
    if (dto.scopes !== undefined) updateData.scopes = dto.scopes;
    if (dto.allowedDomains !== undefined) updateData.allowedDomains = dto.allowedDomains;
    if (dto.autoCreateUser !== undefined) updateData.autoCreateUser = dto.autoCreateUser;
    if (dto.autoLinkExisting !== undefined) updateData.autoLinkExisting = dto.autoLinkExisting;

    const updated = await this.prisma.ssoProvider.update({
      where: { provider },
      data: updateData,
    });

    this.logger.log(`SSO provider ${provider} updated`);

    return {
      id: updated.id,
      provider: updated.provider,
      enabled: updated.enabled,
      clientId: updated.clientId,
      hasSecret: !!updated.clientSecretEnc,
    };
  }

  /**
   * Delete an SSO provider
   */
  async deleteProvider(provider: SsoProviderType) {
    const existing = await this.prisma.ssoProvider.findUnique({
      where: { provider },
    });

    if (!existing) {
      throw new NotFoundException(`SSO provider ${provider} not configured`);
    }

    await this.prisma.ssoProvider.delete({
      where: { provider },
    });

    this.logger.log(`SSO provider ${provider} deleted`);

    return { success: true, message: `SSO provider ${provider} deleted` };
  }

  /**
   * Get enabled providers (for login UI)
   */
  async getEnabledProviders() {
    const providers = await this.prisma.ssoProvider.findMany({
      where: { enabled: true },
      select: {
        provider: true,
        allowedDomains: true,
      },
    });

    return providers.map((p) => ({
      provider: p.provider,
      allowedDomains: p.allowedDomains,
    }));
  }

  /**
   * Default scopes for each provider
   */
  private getDefaultScopes(provider: SsoProviderType): string[] {
    switch (provider) {
      case 'GOOGLE':
        return ['openid', 'email', 'profile'];
      case 'MICROSOFT':
        return ['openid', 'email', 'profile', 'User.Read'];
      default:
        return ['openid', 'email', 'profile'];
    }
  }
}
