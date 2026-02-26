import { Injectable, Logger } from '@nestjs/common';
import { BaseSsoProvider, SsoProviderConfig, OAuthTokens, SsoUserProfile } from './base.provider';
import { SsoProviderType } from '@prisma/client';

/**
 * Microsoft OAuth 2.0 Provider
 * Supports both personal Microsoft accounts and Azure AD (work/school) accounts
 *
 * Docs: https://learn.microsoft.com/en-us/azure/active-directory/develop/v2-oauth2-auth-code-flow
 */
@Injectable()
export class MicrosoftProvider extends BaseSsoProvider {
  readonly providerType = SsoProviderType.MICROSOFT;
  private readonly logger = new Logger(MicrosoftProvider.name);

  // Use 'common' tenant to support both personal and work/school accounts
  private readonly tenant = 'common';
  private readonly authEndpoint = `https://login.microsoftonline.com/${this.tenant}/oauth2/v2.0/authorize`;
  private readonly tokenEndpoint = `https://login.microsoftonline.com/${this.tenant}/oauth2/v2.0/token`;
  private readonly graphEndpoint = 'https://graph.microsoft.com/v1.0/me';

  getAuthorizationUrl(
    config: SsoProviderConfig,
    redirectUri: string,
    state: string,
    nonce?: string,
  ): string {
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: config.scopes.join(' '),
      state,
      response_mode: 'query',
    });

    if (nonce) {
      params.set('nonce', nonce);
    }

    return `${this.authEndpoint}?${params.toString()}`;
  }

  async exchangeCodeForTokens(
    config: SsoProviderConfig,
    code: string,
    redirectUri: string,
  ): Promise<OAuthTokens> {
    this.logger.debug('Exchanging Microsoft auth code for tokens');

    const response = await fetch(this.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        scope: config.scopes.join(' '),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      this.logger.error(`Microsoft token exchange failed: ${error}`);
      throw new Error(`Microsoft token exchange failed: ${response.status}`);
    }

    const data = await response.json();

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      idToken: data.id_token,
      expiresIn: data.expires_in,
    };
  }

  async getUserProfile(accessToken: string, idToken?: string): Promise<SsoUserProfile> {
    this.logger.debug('Fetching Microsoft user profile');

    // Decode ID token for email_verified and other claims
    let idTokenClaims: any = null;
    if (idToken) {
      try {
        const payload = idToken.split('.')[1];
        idTokenClaims = JSON.parse(Buffer.from(payload, 'base64url').toString());
      } catch {
        this.logger.warn('Failed to decode Microsoft ID token');
      }
    }

    // Fetch profile from Microsoft Graph API
    const response = await fetch(this.graphEndpoint, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      this.logger.error(`Microsoft Graph API fetch failed: ${error}`);
      throw new Error(`Failed to fetch Microsoft user profile: ${response.status}`);
    }

    const profile = await response.json();

    // Microsoft uses 'id' for unique identifier, email comes from multiple sources
    const email = profile.mail || profile.userPrincipalName || idTokenClaims?.email;

    // SECURITY: Microsoft doesn't reliably provide email_verified claim
    // Default to false - require explicit verification signal
    // This prevents account takeover via unverified email auto-linking
    const emailVerified = idTokenClaims?.email_verified ?? false;

    return {
      providerUserId: profile.id,
      email: email,
      emailVerified,
      displayName: profile.displayName,
      givenName: profile.givenName,
      familyName: profile.surname,
      avatarUrl: undefined, // Microsoft Graph requires separate call for photo
      rawProfile: profile,
    };
  }
}
