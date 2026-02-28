import { Injectable, Logger } from '@nestjs/common';
import { SsoProviderService, CreateSsoProviderDto, UpdateSsoProviderDto } from '../../sso/sso-provider.service';
import { SsoProviderType } from '@prisma/client';

/**
 * Admin service for managing instance-level SSO configuration
 */
@Injectable()
export class AdminSsoService {
  private readonly logger = new Logger(AdminSsoService.name);

  constructor(private readonly ssoProviderService: SsoProviderService) {}

  /**
   * Get all SSO providers
   */
  async getAllProviders() {
    return this.ssoProviderService.getAllProviders();
  }

  /**
   * Get a specific provider
   */
  async getProvider(provider: SsoProviderType) {
    return this.ssoProviderService.getProvider(provider);
  }

  /**
   * Create or update an SSO provider
   */
  async upsertProvider(dto: CreateSsoProviderDto) {
    return this.ssoProviderService.upsertProvider(dto);
  }

  /**
   * Update an existing provider
   */
  async updateProvider(provider: SsoProviderType, dto: UpdateSsoProviderDto) {
    return this.ssoProviderService.updateProvider(provider, dto);
  }

  /**
   * Delete a provider
   */
  async deleteProvider(provider: SsoProviderType) {
    return this.ssoProviderService.deleteProvider(provider);
  }

  /**
   * Test provider configuration by attempting to build auth URL
   * (Full OAuth test would require actual redirect)
   */
  async testProvider(provider: SsoProviderType) {
    const config = await this.ssoProviderService.getProviderWithSecret(provider);

    if (!config) {
      return {
        success: false,
        error: 'Provider not configured or not enabled',
      };
    }

    // Basic validation - check that credentials are set
    if (!config.clientId || !config.clientSecret) {
      return {
        success: false,
        error: 'Missing client ID or client secret',
      };
    }

    return {
      success: true,
      message: 'Configuration appears valid. Complete test by attempting SSO login.',
      callbackUrl: `${process.env.BASE_URL}/api/auth/sso/${provider.toLowerCase()}/callback`,
    };
  }
}
