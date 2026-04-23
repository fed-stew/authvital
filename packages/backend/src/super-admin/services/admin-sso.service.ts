import { Injectable, Logger } from '@nestjs/common';
import { SsoProviderService, CreateSsoProviderDto, UpdateSsoProviderDto } from '../../sso/sso-provider.service';
import { SystemWebhookService } from '../../webhooks/system-webhook.service';
import { SsoProviderType } from '@prisma/client';

/**
 * Admin service for managing instance-level SSO configuration
 */
@Injectable()
export class AdminSsoService {
  private readonly logger = new Logger(AdminSsoService.name);

  constructor(
    private readonly ssoProviderService: SsoProviderService,
    private readonly systemWebhookService: SystemWebhookService,
  ) {}

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
    const result = await this.ssoProviderService.upsertProvider(dto);

    // Dispatch sso.provider_added event (upsert - treat as add)
    this.systemWebhookService.dispatch('sso.provider_added' as any, {
      provider_id: dto.provider,
      tenant_id: null,
      provider_type: dto.provider,
      display_name: dto.provider,
      is_enabled: dto.enabled ?? true,
    }).catch((err) => this.logger.warn(`Failed to dispatch sso.provider_added event: ${err.message}`));

    return result;
  }

  /**
   * Update an existing provider
   */
  async updateProvider(provider: SsoProviderType, dto: UpdateSsoProviderDto) {
    const result = await this.ssoProviderService.updateProvider(provider, dto);

    this.systemWebhookService.dispatch('sso.provider_updated' as any, {
      provider_id: provider,
      tenant_id: null,
      provider_type: provider,
      changed_fields: Object.keys(dto).filter(k => dto[k as keyof typeof dto] !== undefined),
    }).catch((err) => this.logger.warn(`Failed to dispatch sso.provider_updated event: ${err.message}`));

    return result;
  }

  /**
   * Delete a provider
   */
  async deleteProvider(provider: SsoProviderType) {
    const result = await this.ssoProviderService.deleteProvider(provider);

    this.systemWebhookService.dispatch('sso.provider_removed' as any, {
      provider_id: provider,
      tenant_id: null,
      provider_type: provider,
    }).catch((err) => this.logger.warn(`Failed to dispatch sso.provider_removed event: ${err.message}`));

    return result;
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
