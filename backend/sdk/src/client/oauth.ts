/**
 * @authvital/sdk - Browser OAuth Utilities
 * 
 * Handles PKCE, authorization flow, and token exchange for browser-based apps.
 * 
 * IMPORTANT: Auth state is managed via httpOnly cookies, NOT localStorage.
 * This protects against XSS attacks - JavaScript cannot access the tokens.
 * 
 * The PKCE code_verifier is encoded in the OAuth `state` parameter to enable
 * cross-domain flows without storing secrets in the browser.
 * 
 * State format: `{csrf_nonce}:{base64url_verifier}`
 */

import type {
  OAuthConfig,
  TokenResponse,
  StandaloneAuthOptions,
  LoginToAuthVitalOptions,
} from './types';

// =============================================================================
// STATE ENCODING (Verifier-in-State Pattern)
// =============================================================================

/**
 * Encode PKCE verifier into OAuth state parameter
 */
export function encodeState(csrf: string, codeVerifier: string): string {
  const encodedVerifier = btoa(codeVerifier)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `${csrf}:${encodedVerifier}`;
}

/**
 * Decode state parameter to extract CSRF and verifier
 */
export function decodeState(state: string): { csrf: string; codeVerifier: string } | null {
  const colonIndex = state.indexOf(':');
  if (colonIndex === -1) return null;
  
  const csrf = state.substring(0, colonIndex);
  const encodedVerifier = state.substring(colonIndex + 1);
  
  try {
    const padded = encodedVerifier + '==='.slice(0, (4 - encodedVerifier.length % 4) % 4);
    const codeVerifier = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
    return { csrf, codeVerifier };
  } catch {
    return null;
  }
}

// =============================================================================
// SIMPLE NAVIGATION (No PKCE - for landing pages)
// =============================================================================

/**
 * Simple redirect to AuthVital login/signup page.
 * Use this on landing pages where you just want to send users to login.
 * 
 * @example
 * ```tsx
 * import { loginToAuthVital } from '@authvital/sdk';
 * 
 * <button onClick={() => loginToAuthVital('http://auth.myapp.com', { clientId: 'my-app' })}>
 *   Sign In
 * </button>
 * ```
 */
export function loginToAuthVital(
  authVitalHost: string,
  options?: LoginToAuthVitalOptions,
): void {
  const screen = options?.screen || 'login';
  const page = screen === 'signup' ? '/auth/signup' : '/auth/login';
  
  const url = new URL(`${authVitalHost}${page}`);
  if (options?.clientId) {
    url.searchParams.set('client_id', options.clientId);
  }
  
  window.location.href = url.toString();
}

/**
 * Convenience function for signup redirect.
 */
export function signupAtAuthVital(
  authVitalHost: string,
  options?: Omit<LoginToAuthVitalOptions, 'screen'>,
): void {
  loginToAuthVital(authVitalHost, { ...options, screen: 'signup' });
}

// =============================================================================
// PKCE (Proof Key for Code Exchange)
// =============================================================================

/**
 * Generate a cryptographically random code verifier
 */
export function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

/**
 * Generate code challenge from verifier (S256 method)
 */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(new Uint8Array(digest));
}

function base64UrlEncode(buffer: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < buffer.length; i++) {
    binary += String.fromCharCode(buffer[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// =============================================================================
// OAUTH FLOW
// =============================================================================

export interface AuthorizeParams {
  state?: string;
  nonce?: string;
  screen?: 'login' | 'signup';
}

// Rate limiting for login attempts
const LOGIN_ATTEMPT_KEY = 'authvital_login_attempt';
const LOGIN_COOLDOWN_MS = 5000;

function canAttemptLogin(): boolean {
  const lastAttempt = sessionStorage.getItem(LOGIN_ATTEMPT_KEY);
  if (!lastAttempt) return true;
  return Date.now() - parseInt(lastAttempt, 10) > LOGIN_COOLDOWN_MS;
}

function recordLoginAttempt(): void {
  sessionStorage.setItem(LOGIN_ATTEMPT_KEY, Date.now().toString());
}

function clearLoginAttempt(): void {
  sessionStorage.removeItem(LOGIN_ATTEMPT_KEY);
}

/**
 * Start the OAuth authorization flow with PKCE
 * 
 * After successful auth, AuthVital sets httpOnly cookies.
 * Use checkAuthStatus() to verify if user is authenticated.
 */
export async function startAuthorizationFlow(
  config: OAuthConfig,
  params: AuthorizeParams = {},
): Promise<void> {
  if (!canAttemptLogin()) {
    throw new Error('Too many login attempts. Please wait a moment and try again.');
  }
  
  recordLoginAttempt();
  
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const csrf = params.state || generateCodeVerifier().substring(0, 16);
  const state = encodeState(csrf, codeVerifier);
  
  const authorizeUrl = new URL(`${config.authVitalHost}/oauth/authorize`);
  authorizeUrl.searchParams.set('client_id', config.clientId);
  authorizeUrl.searchParams.set('redirect_uri', config.redirectUri);
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('scope', config.scope || 'openid profile email');
  authorizeUrl.searchParams.set('state', state);
  authorizeUrl.searchParams.set('code_challenge', codeChallenge);
  authorizeUrl.searchParams.set('code_challenge_method', 'S256');
  
  if (params.nonce) {
    authorizeUrl.searchParams.set('nonce', params.nonce);
  }
  if (params.screen === 'signup') {
    authorizeUrl.searchParams.set('screen', 'signup');
  }
  
  window.location.href = authorizeUrl.toString();
}

/**
 * Start the login flow (standalone function)
 */
export async function startLogin(options: StandaloneAuthOptions): Promise<void> {
  await startAuthorizationFlow(
    {
      authVitalHost: options.authVitalHost,
      clientId: options.clientId,
      redirectUri: options.redirectUri,
      scope: options.scope,
    },
    { state: options.state }
  );
}

/**
 * Start the signup flow (standalone function)
 */
export async function startSignup(options: StandaloneAuthOptions): Promise<void> {
  await startAuthorizationFlow(
    {
      authVitalHost: options.authVitalHost,
      clientId: options.clientId,
      redirectUri: options.redirectUri,
      scope: options.scope,
    },
    { state: options.state, screen: 'signup' }
  );
}

// =============================================================================
// CALLBACK HANDLING
// =============================================================================

let callbackInProgress: Promise<TokenResponse> | null = null;

/**
 * Handle the OAuth callback - exchange code for tokens
 * 
 * The tokens are set as httpOnly cookies by the server.
 * This function completes the PKCE flow and clears the URL params.
 */
export async function handleCallback(config: OAuthConfig): Promise<void> {
  if (callbackInProgress) {
    await callbackInProgress;
    return;
  }
  
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const state = params.get('state');
  const error = params.get('error');
  const errorDescription = params.get('error_description');
  
  if (error) {
    throw new Error(errorDescription || error);
  }
  if (!code) {
    throw new Error('No authorization code received');
  }
  if (!state) {
    throw new Error('No state parameter received');
  }
  
  const decoded = decodeState(state);
  if (!decoded) {
    throw new Error('Invalid state format - could not extract PKCE verifier');
  }
  
  callbackInProgress = exchangeCodeForTokens(config, code, decoded.codeVerifier);
  
  try {
    await callbackInProgress;
    window.history.replaceState({}, '', window.location.pathname);
    clearLoginAttempt();
  } finally {
    callbackInProgress = null;
  }
}

/**
 * Extract callback parameters for trampoline/backend handling
 */
export function extractCallbackParams(): {
  code: string | null;
  codeVerifier: string | null;
  csrf: string | null;
  error: string | null;
  errorDescription: string | null;
} {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const state = params.get('state');
  const error = params.get('error');
  const errorDescription = params.get('error_description');
  
  if (error) {
    return { code: null, codeVerifier: null, csrf: null, error, errorDescription };
  }
  if (!state) {
    return { code, codeVerifier: null, csrf: null, error: 'missing_state', errorDescription: 'No state parameter' };
  }
  
  const decoded = decodeState(state);
  if (!decoded) {
    return { code, codeVerifier: null, csrf: null, error: 'invalid_state', errorDescription: 'Could not decode state' };
  }
  
  return { code, codeVerifier: decoded.codeVerifier, csrf: decoded.csrf, error: null, errorDescription: null };
}

// =============================================================================
// TOKEN EXCHANGE (Server sets httpOnly cookie)
// =============================================================================

/**
 * Exchange authorization code for tokens.
 * The server sets httpOnly cookies - tokens are NOT returned to JS.
 */
export async function exchangeCodeForTokens(
  config: OAuthConfig,
  code: string,
  codeVerifier: string,
): Promise<TokenResponse> {
  const response = await fetch(`${config.authVitalHost}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include', // Important: receive and send cookies
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.redirectUri,
      client_id: config.clientId,
      code_verifier: codeVerifier,
    }),
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'Token exchange failed');
  }
  
  return response.json();
}

// =============================================================================
// AUTH STATUS CHECK (Cookie-based)
// =============================================================================

export interface AuthStatus {
  authenticated: boolean;
  user?: {
    id: string;
    email: string;
    givenName?: string;
    familyName?: string;
  };
}

/**
 * Check if user is authenticated by calling the auth status endpoint.
 * Auth state is in httpOnly cookies, so we must ask the server.
 */
export async function checkAuthStatus(authVitalHost: string): Promise<AuthStatus> {
  try {
    const response = await fetch(`${authVitalHost}/api/auth/me`, {
      method: 'GET',
      credentials: 'include', // Send cookies
    });
    
    if (!response.ok) {
      return { authenticated: false };
    }
    
    const data = await response.json();
    return {
      authenticated: data.authenticated ?? false,
      user: data.user,
    };
  } catch {
    return { authenticated: false };
  }
}

// =============================================================================
// LOGOUT
// =============================================================================

/**
 * Logout - clears the httpOnly session cookie via server redirect
 */
export async function logout(
  authVitalHost: string,
  options?: {
    postLogoutRedirectUri?: string;
  }
): Promise<void> {
  // Clear rate limiting
  sessionStorage.removeItem(LOGIN_ATTEMPT_KEY);
  
  // Redirect to logout endpoint (clears httpOnly cookie)
  const logoutUrl = new URL(`${authVitalHost}/api/auth/logout/redirect`);
  if (options?.postLogoutRedirectUri) {
    logoutUrl.searchParams.set('post_logout_redirect_uri', options.postLogoutRedirectUri);
  }
  window.location.href = logoutUrl.toString();
}

// =============================================================================
// JWT DECODING (for ID token claims only - NOT for auth decisions)
// =============================================================================

/**
 * Decode JWT payload (without verification - for display purposes only)
 * 
 * WARNING: Do NOT use this to make auth decisions!
 * Auth state should be verified via checkAuthStatus() which checks cookies.
 */
export function decodeJwt<T = Record<string, unknown>>(token: string): T | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    const payload = parts[1];
    const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}
