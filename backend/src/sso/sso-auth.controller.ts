import {
  Controller,
  Get,
  Query,
  Param,
  Res,
  BadRequestException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { SsoAuthService } from './sso-auth.service';
import { TenantSsoConfigService } from './tenant-sso-config.service';
import { SsoProviderType } from '@prisma/client';
import { getSessionCookieOptions } from '../common/utils/cookie.utils';

// Alias for clarity
const getIdpCookieOptions = getSessionCookieOptions;

@Controller('auth/sso')
export class SsoAuthController {
  private readonly logger = new Logger(SsoAuthController.name);

  constructor(
    private readonly ssoAuthService: SsoAuthService,
    private readonly tenantSsoConfigService: TenantSsoConfigService,
  ) {}

  /**
   * Get available SSO providers for login UI
   * Can be called with optional tenant context
   */
  @Get('providers')
  async getProviders(
    @Query('tenant_id') tenantId?: string,
    @Query('tenant_slug') tenantSlug?: string,
  ) {
    // If tenant_slug provided, look up tenant_id
    let resolvedTenantId = tenantId;
    if (!resolvedTenantId && tenantSlug) {
      // TODO: Look up tenant by slug
    }

    const providers = await this.tenantSsoConfigService.getEnabledProvidersForTenant(
      resolvedTenantId || null,
    );

    return {
      providers: providers.map((p) => ({
        provider: p.provider.toLowerCase(),
        name: this.getProviderDisplayName(p.provider),
        enforced: p.enforced,
      })),
    };
  }

  /**
   * Initiate SSO flow - redirects to provider's authorization page
   */
  @Get(':provider/authorize')
  async authorize(
    @Param('provider') providerParam: string,
    @Query('tenant_id') tenantId?: string,
    @Query('tenant_slug') tenantSlug?: string,
    @Query('client_id') clientId?: string,
    @Query('redirect_uri') redirectUri?: string,
    @Res() res?: Response,
  ) {
    const provider = this.parseProvider(providerParam);

    this.logger.log(`SSO authorize request: ${provider}, tenant: ${tenantId || tenantSlug || 'none'}`);

    const { authorizationUrl } = await this.ssoAuthService.initiateAuth(provider, {
      tenantId,
      tenantSlug,
      clientId,
      redirectUri,
    });

    // Redirect to provider
    return res!.redirect(302, authorizationUrl);
  }

  /**
   * OAuth callback - handles return from provider
   */
  @Get(':provider/callback')
  async callback(
    @Param('provider') providerParam: string,
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error?: string,
    @Query('error_description') errorDescription?: string,
    @Res() res?: Response,
  ) {
    const provider = this.parseProvider(providerParam);

    // Handle OAuth error
    if (error) {
      this.logger.warn(`SSO callback error: ${error} - ${errorDescription}`);
      return res!.redirect(
        `/auth/login?error=sso_failed&message=${encodeURIComponent(errorDescription || error)}`,
      );
    }

    if (!code || !state) {
      return res!.redirect('/auth/login?error=sso_failed&message=Missing+code+or+state');
    }

    try {
      const result = await this.ssoAuthService.handleCallback(provider, code, state);

      // Set session cookie (idp_session only - auth_token was deprecated)
      res!.cookie('idp_session', result.accessToken, getIdpCookieOptions());

      this.logger.log(`SSO login successful for ${result.user.email}, redirecting to ${result.redirectTo}`);

      // Redirect to appropriate destination
      return res!.redirect(302, result.redirectTo || '/auth/app-picker');
    } catch (err: any) {
      this.logger.error(`SSO callback error: ${err.message}`);
      // SECURITY: Map known exceptions to safe messages, hide internal errors
      const safeMessage = err instanceof UnauthorizedException || err instanceof BadRequestException
        ? err.message
        : 'An error occurred during sign-in. Please try again.';
      return res!.redirect(
        `/auth/login?error=sso_failed&message=${encodeURIComponent(safeMessage)}`,
      );
    }
  }

  /**
   * Parse and validate provider parameter
   */
  private parseProvider(provider: string): SsoProviderType {
    const normalized = provider.toUpperCase();
    if (normalized !== 'GOOGLE' && normalized !== 'MICROSOFT') {
      throw new BadRequestException(`Invalid SSO provider: ${provider}`);
    }
    return normalized as SsoProviderType;
  }

  /**
   * Get display name for provider
   */
  private getProviderDisplayName(provider: SsoProviderType): string {
    switch (provider) {
      case 'GOOGLE':
        return 'Google';
      case 'MICROSOFT':
        return 'Microsoft';
      default:
        return provider;
    }
  }
}
