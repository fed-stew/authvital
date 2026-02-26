import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface UpdateInstanceDto {
  name?: string;
  allowSignUp?: boolean;
  autoCreateTenant?: boolean;
  allowGenericDomains?: boolean;
  allowAnonymousSignUp?: boolean;
  requiredUserFields?: string[];
  defaultTenantRoleIds?: string[];
  // Single-tenant mode
  singleTenantMode?: boolean;
  defaultTenantId?: string | null;
  // Branding
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
}

@Injectable()
export class InstanceService implements OnModuleInit {
  private readonly SINGLETON_ID = 'instance';

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.ensureSingleton();
  }

  /**
   * Ensure the singleton InstanceMeta record exists
   * Called on application startup
   */
  async ensureSingleton() {
    await this.prisma.instanceMeta.upsert({
      where: { id: this.SINGLETON_ID },
      update: {},
      create: {
        id: this.SINGLETON_ID,
        name: 'AuthVader IDP',
      },
    });
  }

  /**
   * Get the singleton instance configuration
   */
  async getInstanceMeta() {
    const instance = await this.prisma.instanceMeta.findUnique({
      where: { id: this.SINGLETON_ID },
    });

    if (!instance) {
      // Should not happen after ensureSingleton, but handle defensively
      await this.ensureSingleton();
      return this.prisma.instanceMeta.findUnique({
        where: { id: this.SINGLETON_ID },
      });
    }

    return instance;
  }

  /**
   * Get the immutable instance UUID (for Fleet Manager identification)
   * This UUID is generated once and never changes
   */
  async getInstanceUuid(): Promise<string> {
    const instance = await this.getInstanceMeta();
    return instance!.instanceUuid;
  }

  /**
   * Update instance configuration
   * Note: instanceUuid cannot be updated (immutable)
   */
  async updateInstanceMeta(dto: UpdateInstanceDto) {
    return this.prisma.instanceMeta.update({
      where: { id: this.SINGLETON_ID },
      data: {
        name: dto.name,
        allowSignUp: dto.allowSignUp,
        autoCreateTenant: dto.autoCreateTenant,
        allowGenericDomains: dto.allowGenericDomains,
        allowAnonymousSignUp: dto.allowAnonymousSignUp,
        requiredUserFields: dto.requiredUserFields,
        defaultTenantRoleIds: dto.defaultTenantRoleIds,
        singleTenantMode: dto.singleTenantMode,
        defaultTenantId: dto.defaultTenantId,
        brandingName: dto.brandingName,
        brandingLogoUrl: dto.brandingLogoUrl,
        brandingIconUrl: dto.brandingIconUrl,
        brandingPrimaryColor: dto.brandingPrimaryColor,
        brandingBackgroundColor: dto.brandingBackgroundColor,
        brandingAccentColor: dto.brandingAccentColor,
        brandingSupportUrl: dto.brandingSupportUrl,
        brandingPrivacyUrl: dto.brandingPrivacyUrl,
        brandingTermsUrl: dto.brandingTermsUrl,
        initiateLoginUri: dto.initiateLoginUri,
      },
    });
  }

  /**
   * Get signup configuration for the instance
   */
  async getSignupConfig() {
    const instance = await this.getInstanceMeta();
    return {
      allowSignUp: instance!.allowSignUp,
      autoCreateTenant: instance!.autoCreateTenant,
      allowGenericDomains: instance!.allowGenericDomains,
      allowAnonymousSignUp: instance!.allowAnonymousSignUp,
      requiredUserFields: instance!.requiredUserFields,
      defaultTenantRoleIds: instance!.defaultTenantRoleIds,
      // Single-tenant mode
      singleTenantMode: instance!.singleTenantMode,
      defaultTenantId: instance!.defaultTenantId,
    };
  }

  /**
   * Get branding configuration for the instance
   */
  async getBrandingConfig() {
    const instance = await this.getInstanceMeta();
    return {
      name: instance!.brandingName || instance!.name,
      logoUrl: instance!.brandingLogoUrl,
      iconUrl: instance!.brandingIconUrl,
      primaryColor: instance!.brandingPrimaryColor,
      backgroundColor: instance!.brandingBackgroundColor,
      accentColor: instance!.brandingAccentColor,
      supportUrl: instance!.brandingSupportUrl,
      privacyUrl: instance!.brandingPrivacyUrl,
      termsUrl: instance!.brandingTermsUrl,
      initiateLoginUri: instance!.initiateLoginUri,
    };
  }
}
