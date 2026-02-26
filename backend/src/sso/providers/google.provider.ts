import { Injectable, Logger } from '@nestjs/common';
import { BaseSsoProvider, SsoProviderConfig, OAuthTokens, SsoUserProfile } from './base.provider';
import { SsoProviderType } from '@prisma/client';

/**
 * Google OAuth 2.0 Provider
 * Uses Google's OAuth 2.0 endpoints directly (no SDK dependency)
 *
 * Docs: https://developers.google.com/identity/protocols/oauth2/web-server
 */
@Injectable()
export class GoogleProvider extends BaseSsoProvider {
  readonly providerType = SsoProviderType.GOOGLE;
  private readonly logger = new Logger(GoogleProvider.name);

  private readonly authEndpoint = 'https://accounts.google.com/o/oauth2/v2/auth';
  private readonly tokenEndpoint = 'https://oauth2.googleapis.com/token';
  private readonly userInfoEndpoint = 'https://www.googleapis.com/oauth2/v3/userinfo';

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
      access_type: 'offline', // Get refresh token
      prompt: 'consent', // Always show consent to get refresh token
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
    this.logger.debug('Exchanging Google auth code for tokens');

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
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      this.logger.error(`Google token exchange failed: ${error}`);
      throw new Error(`Google token exchange failed: ${response.status}`);
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
    this.logger.debug('Fetching Google user profile');

    // Try to decode ID token first for verified email claim
    let idTokenClaims: any = null;
    if (idToken) {
      try {
        // Decode JWT payload (middle part) - we trust Google's signature
        const payload = idToken.split('.')[1];
        idTokenClaims = JSON.parse(Buffer.from(payload, 'base64url').toString());
      } catch {
        this.logger.warn('Failed to decode Google ID token');
      }
    }

    // Fetch user info for additional profile data
    const response = await fetch(this.userInfoEndpoint, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      this.logger.error(`Google user info fetch failed: ${error}`);
      throw new Error(`Failed to fetch Google user profile: ${response.status}`);
    }

    const profile = await response.json();

    return {
      providerUserId: profile.sub,
      email: profile.email,
      emailVerified: idTokenClaims?.email_verified ?? profile.email_verified ?? false,
      displayName: profile.name,
      givenName: profile.given_name,
      familyName: profile.family_name,
      avatarUrl: profile.picture,
      rawProfile: profile,
    };
  }
}
