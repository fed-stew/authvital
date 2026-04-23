/**
 * @authvital/core - OAuth URL Generation
 *
 * Pure functions for building OAuth URLs.
 * No storage dependencies - just URL construction.
 *
 * @packageDocumentation
 */

import type {
  AuthUrlOptions,
  SignupUrlOptions,
  LoginUrlOptions,
  LogoutUrlOptions,
  AuthorizeUrlParams,
  StatePayload,
} from '../types/index.js';
import {
  OAUTH_AUTHORIZE,
  OAUTH_TOKEN,
  AUTH_LOGIN,
  AUTH_SIGNUP,
  AUTH_LOGOUT_REDIRECT,
  AUTH_FORGOT_PASSWORD,
} from '../api/endpoints.js';

// =============================================================================
// STATE ENCODING/DECODING
// =============================================================================

/**
 * Encode state payload as base64url JSON.
 *
 * Used to pass both CSRF nonce and app-specific state through OAuth flow.
 *
 * @param csrf - CSRF nonce for security
 * @param appState - Optional app-specific state (e.g., return URL)
 * @returns The encoded state string
 *
 * @example
 * ```ts
 * const state = encodeState(csrfNonce, '/dashboard?tab=settings');
 * ```
 */
export function encodeState(csrf: string, appState?: string): string {
  const payload: StatePayload = { csrf, appState };
  const json = JSON.stringify(payload);
  
  // Use TextEncoder for cross-platform compatibility
  const encoder = new TextEncoder();
  const bytes = encoder.encode(json);
  
  // Manual base64url encoding
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Decode state payload from base64url JSON.
 *
 * Returns null if decoding fails (invalid format).
 *
 * @param state - The encoded state string from OAuth callback
 * @returns The decoded state payload or null if invalid
 *
 * @example
 * ```ts
 * const payload = decodeState(stateFromCallback);
 * if (payload) {
 *   console.log('CSRF:', payload.csrf);
 *   console.log('App State:', payload.appState);
 * }
 * ```
 */
export function decodeState(state: string): StatePayload | null {
  try {
    // Add padding if needed
    const padding = 4 - (state.length % 4);
    const padded = padding !== 4 ? state + '='.repeat(padding) : state;
    
    // Convert base64url to base64
    const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');
    
    // Decode
    const json = atob(base64);
    return JSON.parse(json) as StatePayload;
  } catch {
    return null;
  }
}

/**
 * Encode state with embedded code verifier (stateless mode).
 *
 * Format: `{csrf}:{base64url_verifier}`
 *
 * Use this if you don't want to store state server-side.
 *
 * @param csrf - CSRF nonce for security
 * @param codeVerifier - PKCE code verifier
 * @returns The encoded state string containing both CSRF and verifier
 *
 * @example
 * ```ts
 * const state = encodeStateWithVerifier(csrf, codeVerifier);
 * // Can later decode to get the verifier back
 * ```
 */
export function encodeStateWithVerifier(csrf: string, codeVerifier: string): string {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(codeVerifier);
  
  // Manual base64url encoding
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  
  const encodedVerifier = btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  
  return `${csrf}:${encodedVerifier}`;
}

/**
 * Decode state to extract CSRF and verifier.
 *
 * @param state - The encoded state string
 * @returns An object with csrf and codeVerifier, or null if invalid
 *
 * @example
 * ```ts
 * const decoded = decodeStateWithVerifier(state);
 * if (decoded) {
 *   const { csrf, codeVerifier } = decoded;
 *   // Verify CSRF matches expected value
 *   // Use codeVerifier for token exchange
 * }
 * ```
 */
export function decodeStateWithVerifier(state: string): { csrf: string; codeVerifier: string } | null {
  const colonIndex = state.indexOf(':');
  if (colonIndex === -1) return null;
  
  const csrf = state.substring(0, colonIndex);
  const encodedVerifier = state.substring(colonIndex + 1);
  
  try {
    // Add padding if needed
    const padding = 4 - (encodedVerifier.length % 4);
    const padded = padding !== 4 ? encodedVerifier + '='.repeat(padding) : encodedVerifier;
    
    // Convert base64url to base64
    const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');
    
    // Decode
    const codeVerifier = atob(base64);
    return { csrf, codeVerifier };
  } catch {
    return null;
  }
}

// =============================================================================
// AUTHORIZATION URL BUILDER
// =============================================================================

/**
 * Build the OAuth authorization URL.
 *
 * Constructs the full URL for redirecting users to the OAuth authorization endpoint.
 *
 * @param params - The parameters for building the URL
 * @returns The complete authorization URL
 *
 * @example
 * ```ts
 * const authorizeUrl = buildAuthorizeUrl({
 *   authVitalHost: 'https://auth.example.com',
 *   clientId: 'my-app',
 *   redirectUri: 'https://app.example.com/callback',
 *   state: 'csrf123',
 *   codeChallenge: 'E9Melhoa2OwvFrEMT...',
 *   scope: 'openid profile email',
 * });
 * // 'https://auth.example.com/oauth/authorize?client_id=my-app&...'
 * ```
 */
export function buildAuthorizeUrl(params: AuthorizeUrlParams): string {
  const url = new URL(`${params.authVitalHost}${OAUTH_AUTHORIZE}`);
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

/**
 * Build authorization URL with screen hint.
 *
 * Same as buildAuthorizeUrl but with an additional screen parameter
 * to hint whether to show login or signup first.
 *
 * @param params - The base authorization parameters
 * @param screen - The screen to show ('login' or 'signup')
 * @returns The complete authorization URL with screen hint
 */
export function buildAuthorizeUrlWithScreen(
  params: AuthorizeUrlParams,
  screen: 'login' | 'signup' = 'login'
): string {
  const url = new URL(buildAuthorizeUrl(params));
  url.searchParams.set('screen', screen);
  return url.toString();
}

// =============================================================================
// TOKEN URL BUILDER
// =============================================================================

/**
 * Build the OAuth token URL.
 *
 * @param authVitalHost - The AuthVital server URL
 * @returns The complete token endpoint URL
 */
export function buildTokenUrl(authVitalHost: string): string {
  return `${authVitalHost}${OAUTH_TOKEN}`;
}

// =============================================================================
// LOGIN/SIGNUP URL BUILDERS
// =============================================================================

/**
 * Build a signup URL for landing pages, emails, etc.
 *
 * This is a simple redirect - NOT a full OAuth flow.
 * AuthVital will handle the OAuth redirect internally after signup.
 *
 * @param options - Options for building the URL
 * @returns The complete signup URL
 *
 * @example
 * ```ts
 * const url = getSignupUrl({
 *   authVitalHost: 'https://auth.example.com',
 *   clientId: 'my-app',
 *   redirectUri: 'https://app.example.com/onboarding',
 * });
 * ```
 */
export function getSignupUrl(options: SignupUrlOptions): string {
  const url = new URL(`${options.authVitalHost}${AUTH_SIGNUP}`);
  url.searchParams.set('client_id', options.clientId);
  
  if (options.redirectUri) {
    url.searchParams.set('redirect_uri', options.redirectUri);
  }
  
  if (options.email) {
    url.searchParams.set('email', options.email);
  }
  
  if (options.inviteToken) {
    url.searchParams.set('invite_token', options.inviteToken);
  }
  
  return url.toString();
}

/**
 * Build a login URL for landing pages, emails, etc.
 *
 * This is a simple redirect - NOT a full OAuth flow.
 * AuthVital will handle the OAuth redirect internally after login.
 *
 * @param options - Options for building the URL
 * @returns The complete login URL
 *
 * @example
 * ```ts
 * const url = getLoginUrl({
 *   authVitalHost: 'https://auth.example.com',
 *   clientId: 'my-app',
 *   redirectUri: 'https://app.example.com/dashboard',
 * });
 * ```
 */
export function getLoginUrl(options: LoginUrlOptions): string {
  const url = new URL(`${options.authVitalHost}${AUTH_LOGIN}`);
  url.searchParams.set('client_id', options.clientId);
  
  if (options.redirectUri) {
    url.searchParams.set('redirect_uri', options.redirectUri);
  }
  
  if (options.email) {
    url.searchParams.set('email', options.email);
  }
  
  if (options.tenantHint) {
    url.searchParams.set('tenant_hint', options.tenantHint);
  }
  
  return url.toString();
}

/**
 * Build a password reset URL.
 *
 * @param options - Options for building the URL
 * @returns The complete password reset URL
 *
 * @example
 * ```ts
 * const url = getPasswordResetUrl({
 *   authVitalHost: 'https://auth.example.com',
 *   clientId: 'my-app',
 *   email: 'user@example.com',
 * });
 * ```
 */
export function getPasswordResetUrl(options: AuthUrlOptions & { email?: string }): string {
  const url = new URL(`${options.authVitalHost}${AUTH_FORGOT_PASSWORD}`);
  url.searchParams.set('client_id', options.clientId);
  
  if (options.redirectUri) {
    url.searchParams.set('redirect_uri', options.redirectUri);
  }
  
  if (options.email) {
    url.searchParams.set('email', options.email);
  }
  
  return url.toString();
}

/**
 * Build an invite acceptance URL.
 *
 * Use this when sending team invitation emails.
 *
 * @param options - Options for building the URL
 * @returns The complete invite acceptance URL
 *
 * @example
 * ```ts
 * const url = getInviteAcceptUrl({
 *   authVitalHost: 'https://auth.example.com',
 *   clientId: 'my-app',
 *   inviteToken: 'abc123xyz',
 * });
 * ```
 */
export function getInviteAcceptUrl(
  options: AuthUrlOptions & { inviteToken: string },
): string {
  const url = new URL(`${options.authVitalHost}/auth/accept-invite`);
  url.searchParams.set('client_id', options.clientId);
  url.searchParams.set('token', options.inviteToken);
  
  if (options.redirectUri) {
    url.searchParams.set('redirect_uri', options.redirectUri);
  }
  
  return url.toString();
}

/**
 * Build a logout URL that clears the IDP session.
 *
 * Use this when logging out users - it will clear both your app's
 * cookies AND the IDP session.
 *
 * @param options - Options for building the URL
 * @returns The complete logout URL
 *
 * @example
 * ```ts
 * // Show IDP's logged out page:
 * const logoutUrl = getLogoutUrl({
 *   authVitalHost: 'https://auth.example.com',
 * });
 *
 * // Or redirect back to your app after logout:
 * const logoutUrl = getLogoutUrl({
 *   authVitalHost: 'https://auth.example.com',
 *   postLogoutRedirectUri: 'https://app.example.com/',
 * });
 * ```
 */
export function getLogoutUrl(options: LogoutUrlOptions): string {
  const url = new URL(`${options.authVitalHost}${AUTH_LOGOUT_REDIRECT}`);
  if (options.postLogoutRedirectUri) {
    url.searchParams.set('post_logout_redirect_uri', options.postLogoutRedirectUri);
  }
  return url.toString();
}

/**
 * Get URL for user account settings page.
 *
 * @param authVitalHost - The AuthVital server URL
 * @returns The account settings URL
 *
 * @example
 * ```ts
 * const url = getAccountSettingsUrl('https://auth.example.com');
 * // Returns: https://auth.example.com/account/settings
 * ```
 */
export function getAccountSettingsUrl(authVitalHost: string): string {
  return `${authVitalHost.replace(/\/$/, '')}/account/settings`;
}

// =============================================================================
// JWKS & DISCOVERY URL BUILDERS
// =============================================================================

/**
 * Build the JWKS URL for fetching public keys.
 *
 * @param authVitalHost - The AuthVital server URL
 * @returns The JWKS endpoint URL
 */
export function buildJwksUrl(authVitalHost: string): string {
  return `${authVitalHost}/.well-known/jwks.json`;
}

/**
 * Build the OpenID Connect discovery URL.
 *
 * @param authVitalHost - The AuthVital server URL
 * @returns The OpenID configuration endpoint URL
 */
export function buildOpenIdConfigUrl(authVitalHost: string): string {
  return `${authVitalHost}/.well-known/openid-configuration`;
}
