/**
 * @authvital/server - OAuth PKCE Flow
 *
 * Server-side OAuth 2.0 PKCE flow implementation.
 * Handles the complete authorization code flow with PKCE for SPAs and server apps.
 *
 * @packageDocumentation
 */

import {
  generatePKCE,
  generateCSRFState,
  buildAuthorizeUrl,
  buildTokenUrl,
  encodeState,
  decodeState,
} from '@authvital/core/oauth';

export interface OAuthFlowConfig {
  /** AuthVital server URL for API calls (e.g., internal Docker hostname) */
  authVitalHost: string;
  /** OAuth client ID */
  clientId: string;
  /** OAuth client secret (for confidential clients) */
  clientSecret?: string;
  /** OAuth redirect URI for callbacks */
  redirectUri: string;
  /** OAuth scopes to request */
  scope?: string;
}

export interface StartFlowResult {
  /** The full authorize URL to redirect the user to */
  authorizeUrl: string;
  /** The OAuth state parameter (store in cookie for verification) */
  state: string;
  /** The PKCE code verifier (store in cookie for token exchange) */
  codeVerifier: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  id_token?: string;
  token_type?: string;
}

export interface CallbackResult extends TokenResponse {
  /** The app state that was passed through the OAuth flow */
  appState?: string;
}

/**
 * OAuth 2.0 PKCE Flow
 *
 * Implements the complete authorization code flow with PKCE.
 *
 * @example
 * ```typescript
 * import { OAuthFlow } from '@authvital/server';
 *
 * const oauth = new OAuthFlow({
 *   authVitalHost: process.env.AV_HOST,
 *   clientId: process.env.AV_CLIENT_ID,
 *   clientSecret: process.env.AV_CLIENT_SECRET,
 *   redirectUri: 'https://app.example.com/auth/callback',
 * });
 *
 * // 1. Start the flow
 * const { authorizeUrl, state, codeVerifier } = await oauth.startFlow({ appState: '/dashboard' });
 * // Store state + codeVerifier in httpOnly cookies, redirect user to authorizeUrl
 *
 * // 2. Handle callback
 * const tokens = await oauth.handleCallback(code, state, expectedState, codeVerifier);
 * // Set tokens as cookies, redirect to tokens.appState
 *
 * // 3. Refresh tokens
 * const newTokens = await oauth.refreshTokens(refreshToken);
 * ```
 */
export class OAuthFlow {
  private readonly config: Required<Pick<OAuthFlowConfig, 'authVitalHost' | 'clientId' | 'redirectUri'>> & OAuthFlowConfig;

  constructor(config: OAuthFlowConfig) {
    this.config = {
      ...config,
      scope: config.scope || 'openid profile email',
    };
  }

  /**
   * Start the OAuth PKCE flow.
   *
   * Generates PKCE parameters (code_verifier + code_challenge) and builds
   * the authorization URL. The caller should:
   * 1. Store `state` and `codeVerifier` in httpOnly cookies
   * 2. Redirect the user's browser to `authorizeUrl`
   *
   * @param options - Optional flow configuration
   * @param options.appState - Application state to preserve through the flow (e.g., return URL)
   * @returns The authorize URL, state, and code verifier
   */
  async startFlow(options?: { appState?: string }): Promise<StartFlowResult> {
    const { codeVerifier, codeChallenge } = await generatePKCE();
    const csrf = generateCSRFState();
    const state = encodeState(csrf, options?.appState);

    const authorizeUrl = buildAuthorizeUrl({
      authVitalHost: this.config.authVitalHost,
      clientId: this.config.clientId,
      redirectUri: this.config.redirectUri,
      state,
      codeChallenge,
      scope: this.config.scope,
    });

    return { authorizeUrl, state, codeVerifier };
  }

  /**
   * Handle the OAuth callback.
   *
   * Verifies the state parameter and exchanges the authorization code
   * for tokens using the PKCE code verifier.
   *
   * @param code - The authorization code from the callback
   * @param state - The state parameter from the callback
   * @param expectedState - The state stored during startFlow (from cookie)
   * @param codeVerifier - The code verifier stored during startFlow (from cookie)
   * @returns The tokens and preserved app state
   * @throws Error if state doesn't match or token exchange fails
   */
  async handleCallback(
    code: string,
    state: string,
    expectedState: string,
    codeVerifier: string,
  ): Promise<CallbackResult> {
    if (state !== expectedState) {
      throw new Error('Invalid state parameter — possible CSRF attack');
    }

    const decodedState = decodeState(state);
    const appState = decodedState?.appState;

    const tokenUrl = buildTokenUrl(this.config.authVitalHost);
    const body: Record<string, string> = {
      grant_type: 'authorization_code',
      client_id: this.config.clientId,
      code,
      redirect_uri: this.config.redirectUri,
      code_verifier: codeVerifier,
    };

    if (this.config.clientSecret) {
      body.client_secret = this.config.clientSecret;
    }

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Token exchange failed (${response.status}): ${errorText}`);
    }

    const tokens = await response.json() as TokenResponse;
    return { ...tokens, appState };
  }

  /**
   * Refresh tokens using a refresh token.
   *
   * @param refreshToken - The refresh token
   * @returns New tokens
   * @throws Error if refresh fails
   */
  async refreshTokens(refreshToken: string): Promise<TokenResponse> {
    const tokenUrl = buildTokenUrl(this.config.authVitalHost);
    const body: Record<string, string> = {
      grant_type: 'refresh_token',
      client_id: this.config.clientId,
      refresh_token: refreshToken,
    };

    if (this.config.clientSecret) {
      body.client_secret = this.config.clientSecret;
    }

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Token refresh failed (${response.status}): ${errorText}`);
    }

    return await response.json() as TokenResponse;
  }
}
