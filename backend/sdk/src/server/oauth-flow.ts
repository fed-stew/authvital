/**
 * @authvader/sdk - Server-Side OAuth Flow
 * 
 * Utilities for implementing OAuth 2.0 Authorization Code Flow with PKCE
 * on your backend. Use this when you need to handle OAuth callbacks server-side.
 * 
 * @example
 * ```ts
 * import { OAuthFlow } from '@authvader/sdk/server';
 * 
 * const oauth = new OAuthFlow({
 *   authVaderHost: process.env.AV_HOST,
 *   clientId: process.env.AV_CLIENT_ID,
 *   clientSecret: process.env.AV_CLIENT_SECRET,
 *   redirectUri: 'https://myapp.com/api/auth/callback',
 * });
 * 
 * // GET /api/auth/login
 * app.get('/api/auth/login', (req, res) => {
 *   const { authorizeUrl, state, codeVerifier } = oauth.startFlow();
 *   req.session.oauthState = state;
 *   req.session.codeVerifier = codeVerifier;
 *   res.redirect(authorizeUrl);
 * });
 * 
 * // GET /api/auth/callback
 * app.get('/api/auth/callback', async (req, res) => {
 *   const tokens = await oauth.handleCallback(
 *     req.query.code,
 *     req.query.state,
 *     req.session.oauthState,
 *     req.session.codeVerifier
 *   );
 *   req.session.accessToken = tokens.access_token;
 *   res.redirect('/dashboard');
 * });
 * ```
 */

import * as crypto from 'crypto';
import type { OAuthFlowConfig, TokenResponse } from './types';

// =============================================================================
// PKCE GENERATION
// =============================================================================

/**
 * Generate a cryptographically secure code verifier
 */
export function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Generate code challenge from verifier (S256 method)
 */
export function generateCodeChallenge(verifier: string): string {
  const hash = crypto.createHash('sha256').update(verifier).digest();
  return hash.toString('base64url');
}

/**
 * Generate both PKCE values at once
 */
export function generatePKCE(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  return { codeVerifier, codeChallenge };
}

// =============================================================================
// STATE MANAGEMENT
// =============================================================================

/**
 * Payload structure for OAuth state parameter
 * Contains CSRF nonce and optional app-specific state
 */
export interface StatePayload {
  csrf: string;
  appState?: string;
}

/**
 * Generate a secure random state for CSRF protection
 */
export function generateState(): string {
  return crypto.randomBytes(16).toString('base64url');
}

/**
 * Encode state payload as base64url JSON
 * Used to pass both CSRF nonce and app-specific state through OAuth flow
 * 
 * @param csrf - CSRF nonce for security
 * @param appState - Optional app-specific state (e.g., return URL)
 */
export function encodeState(csrf: string, appState?: string): string {
  const payload: StatePayload = { csrf, appState };
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

/**
 * Decode state payload from base64url JSON
 * Returns null if decoding fails (invalid format)
 * 
 * @param state - The encoded state string from OAuth callback
 */
export function decodeState(state: string): StatePayload | null {
  try {
    const json = Buffer.from(state, 'base64url').toString('utf-8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/**
 * Encode state with embedded verifier (for stateless mode)
 * Format: {csrf}:{base64url_verifier}
 * 
 * Use this if you don't want to store state server-side.
 */
export function encodeStateWithVerifier(csrf: string, codeVerifier: string): string {
  const encodedVerifier = Buffer.from(codeVerifier).toString('base64url');
  return `${csrf}:${encodedVerifier}`;
}

/**
 * Decode state to extract CSRF and verifier
 */
export function decodeStateWithVerifier(state: string): { csrf: string; codeVerifier: string } | null {
  const colonIndex = state.indexOf(':');
  if (colonIndex === -1) return null;
  
  const csrf = state.substring(0, colonIndex);
  const encodedVerifier = state.substring(colonIndex + 1);
  
  try {
    const codeVerifier = Buffer.from(encodedVerifier, 'base64url').toString('utf-8');
    return { csrf, codeVerifier };
  } catch {
    return null;
  }
}

// =============================================================================
// AUTHORIZE URL BUILDER
// =============================================================================

export interface AuthorizeUrlParams {
  authVaderHost: string;
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  scope?: string;
  nonce?: string;
}

/**
 * Build the OAuth authorize URL
 */
export function buildAuthorizeUrl(params: AuthorizeUrlParams): string {
  const url = new URL(`${params.authVaderHost}/oauth/authorize`);
  url.searchParams.set('client_id', params.clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', params.scope || 'openid profile email');
  url.searchParams.set('state', params.state);
  url.searchParams.set('code_challenge', params.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  
  if (params.nonce) {
    url.searchParams.set('nonce', params.nonce);
  }
  
  return url.toString();
}

// =============================================================================
// TOKEN EXCHANGE
// =============================================================================

export interface TokenExchangeParams {
  authVaderHost: string;
  clientId: string;
  clientSecret?: string;
  code: string;
  codeVerifier: string;
  redirectUri: string;
}

/**
 * Exchange authorization code for tokens (SERVER-TO-SERVER)
 */
export async function exchangeCodeForTokens(params: TokenExchangeParams): Promise<TokenResponse> {
  const body: Record<string, string> = {
    grant_type: 'authorization_code',
    code: params.code,
    redirect_uri: params.redirectUri,
    client_id: params.clientId,
    code_verifier: params.codeVerifier,
  };
  
  if (params.clientSecret) {
    body.client_secret = params.clientSecret;
  }
  
  const response = await fetch(`${params.authVaderHost}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `Token exchange failed: ${response.status}`);
  }
  
  return response.json();
}

// =============================================================================
// TOKEN REFRESH
// =============================================================================

export interface RefreshTokenParams {
  authVaderHost: string;
  clientId: string;
  clientSecret?: string;
  refreshToken: string;
}

/**
 * Refresh access token using refresh token (SERVER-TO-SERVER)
 */
export async function refreshAccessToken(params: RefreshTokenParams): Promise<TokenResponse> {
  const body: Record<string, string> = {
    grant_type: 'refresh_token',
    refresh_token: params.refreshToken,
    client_id: params.clientId,
  };
  
  if (params.clientSecret) {
    body.client_secret = params.clientSecret;
  }
  
  const response = await fetch(`${params.authVaderHost}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `Token refresh failed: ${response.status}`);
  }
  
  return response.json();
}

// =============================================================================
// JWT UTILITIES
// =============================================================================

/**
 * Decode JWT payload (without verification - for extracting claims only)
 */
export function decodeJwt<T = Record<string, unknown>>(token: string): T | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    const payload = Buffer.from(parts[1], 'base64url').toString('utf-8');
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

// =============================================================================
// OAUTH FLOW CLASS
// =============================================================================

/**
 * Helper class for managing the OAuth flow server-side
 */
export class OAuthFlow {
  constructor(private config: OAuthFlowConfig) {}
  
  /**
   * Start the OAuth flow - generates PKCE, state, and authorize URL
   * 
   * @param options.appState - Optional app-specific state to pass through OAuth (e.g., return URL)
   */
  startFlow(options?: { appState?: string }): {
    authorizeUrl: string;
    state: string;
    codeVerifier: string;
    codeChallenge: string;
  } {
    const { codeVerifier, codeChallenge } = generatePKCE();
    const csrfNonce = generateState();
    
    // Encode both CSRF nonce and app state into the state parameter
    const state = encodeState(csrfNonce, options?.appState);
    
    const authorizeUrl = buildAuthorizeUrl({
      authVaderHost: this.config.authVaderHost,
      clientId: this.config.clientId,
      redirectUri: this.config.redirectUri,
      state,
      codeChallenge,
      scope: this.config.scope,
    });
    
    return { authorizeUrl, state, codeVerifier, codeChallenge };
  }
  
  /**
   * Handle the OAuth callback - verify state and exchange code for tokens
   * 
   * @param code - Authorization code from callback
   * @param receivedState - State parameter from callback URL
   * @param expectedState - State that was stored when starting the flow
   * @param codeVerifier - PKCE code verifier that was stored when starting the flow
   * @returns Token response with optional appState that was passed through
   * @throws Error if state doesn't match (CSRF) or token exchange fails
   */
  async handleCallback(
    code: string,
    receivedState: string,
    expectedState: string,
    codeVerifier: string
  ): Promise<TokenResponse & { appState?: string }> {
    // Decode both states to compare CSRF nonces
    const receivedPayload = decodeState(receivedState);
    const expectedPayload = decodeState(expectedState);
    
    // If decoding fails, fall back to direct string comparison (backwards compatibility)
    if (!receivedPayload || !expectedPayload) {
      if (receivedState !== expectedState) {
        throw new Error('State mismatch - possible CSRF attack');
      }
    } else {
      // Compare CSRF nonces (the security-critical part)
      if (receivedPayload.csrf !== expectedPayload.csrf) {
        throw new Error('State mismatch - possible CSRF attack');
      }
    }
    
    // Back-channel token exchange
    const tokens = await exchangeCodeForTokens({
      authVaderHost: this.config.authVaderHost,
      clientId: this.config.clientId,
      clientSecret: this.config.clientSecret,
      code,
      codeVerifier,
      redirectUri: this.config.redirectUri,
    });
    
    // Return tokens with appState extracted from the received state
    return {
      ...tokens,
      appState: receivedPayload?.appState,
    };
  }
  
  /**
   * Refresh tokens using refresh token
   */
  async refreshTokens(refreshToken: string): Promise<TokenResponse> {
    return refreshAccessToken({
      authVaderHost: this.config.authVaderHost,
      clientId: this.config.clientId,
      clientSecret: this.config.clientSecret,
      refreshToken,
    });
  }
}
