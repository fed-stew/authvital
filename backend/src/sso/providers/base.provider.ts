import { SsoProviderType } from '@prisma/client';

export interface SsoUserProfile {
  providerUserId: string;
  email: string;
  emailVerified: boolean;
  displayName?: string;
  givenName?: string;
  familyName?: string;
  avatarUrl?: string;
  rawProfile: Record<string, any>;
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  expiresIn?: number;
}

export interface SsoProviderConfig {
  clientId: string;
  clientSecret: string;
  scopes: string[];
}

export abstract class BaseSsoProvider {
  abstract readonly providerType: SsoProviderType;

  /**
   * Generate the authorization URL for initiating OAuth flow
   */
  abstract getAuthorizationUrl(
    config: SsoProviderConfig,
    redirectUri: string,
    state: string,
    nonce?: string,
  ): string;

  /**
   * Exchange authorization code for tokens
   */
  abstract exchangeCodeForTokens(
    config: SsoProviderConfig,
    code: string,
    redirectUri: string,
  ): Promise<OAuthTokens>;

  /**
   * Fetch user profile using access token
   */
  abstract getUserProfile(
    accessToken: string,
    idToken?: string,
  ): Promise<SsoUserProfile>;
}
