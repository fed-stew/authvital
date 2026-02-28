import { Controller, Get, Param, NotFoundException } from '@nestjs/common';
import { OAuthService } from './oauth.service';
import { InstanceService } from '../instance/instance.service';

/**
 * Branding Controller
 * 
 * Public endpoint for fetching application branding.
 * Mounted at /api/branding (separate from OAuth endpoints).
 */
@Controller('branding')
export class BrandingController {
  constructor(
    private readonly oauthService: OAuthService,
    private readonly instanceService: InstanceService,
  ) {}

  /**
   * Get Application Branding (PUBLIC - no auth required)
   * 
   * Returns branding info for an application by client_id.
   * Uses inheritance: App branding overrides Instance branding.
   * 
   * Priority: Application > Instance > Defaults
   */
  @Get(':clientId')
  async getAppBranding(@Param('clientId') clientId: string) {
    const app = await this.oauthService.getApplicationForBranding(clientId);
    
    if (!app || !app.isActive) {
      throw new NotFoundException('Application not found');
    }

    // Get instance branding as fallback
    const instanceBranding = await this.instanceService.getBrandingConfig();

    // Merge branding: App overrides Instance
    return {
      clientId: app.clientId,
      // Name: app.brandingName > instance.name > app.name
      name: app.brandingName || instanceBranding.name || app.name,
      // URLs: app > instance (no default)
      logoUrl: app.brandingLogoUrl || instanceBranding.logoUrl || null,
      iconUrl: app.brandingIconUrl || instanceBranding.iconUrl || null,
      // Colors: app > instance > system defaults
      primaryColor: app.brandingPrimaryColor || instanceBranding.primaryColor || null,
      backgroundColor: app.brandingBackgroundColor || instanceBranding.backgroundColor || null,
      accentColor: app.brandingAccentColor || instanceBranding.accentColor || null,
      // Links: app > instance (no default)
      supportUrl: app.brandingSupportUrl || instanceBranding.supportUrl || null,
      privacyUrl: app.brandingPrivacyUrl || instanceBranding.privacyUrl || null,
      termsUrl: app.brandingTermsUrl || instanceBranding.termsUrl || null,
      // Initiate Login URI for post-login redirects (e.g., "https://{tenant}.myapp.com/api/auth/login")
      initiateLoginUri: app.initiateLoginUri || instanceBranding.initiateLoginUri || null,
      // Include source info for debugging (optional)
      _source: {
        hasAppBranding: !!(app.brandingName || app.brandingLogoUrl || app.brandingPrimaryColor),
        hasInstanceBranding: !!(instanceBranding.name || instanceBranding.logoUrl || instanceBranding.primaryColor),
      },
    };
  }
}
