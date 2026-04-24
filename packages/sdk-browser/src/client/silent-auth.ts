/**
 * @authvital/browser - Silent Authentication (Hidden Iframe Flow)
 *
 * Implements the OAuth 2.0 `prompt=none` silent authentication flow using
 * a hidden iframe. This allows SPAs to check if the user has a valid session
 * at the IDP without triggering a full-page redirect.
 *
 * Features:
 * - Creates hidden iframe with `prompt=none` authorization URL
 * - Listens for postMessage from IDP with auth result
 * - Returns tokens silently if user has valid IDP session
 * - Returns error codes (login_required, etc.) if no session
 * - Automatic cleanup of iframe after response or timeout
 * - Origin validation for security
 * - Cross-browser compatible
 *
 * @packageDocumentation
 */

import { generateCSRFState } from '@authvital/core';
import type { AuthUser } from './types';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Options for silent authentication attempt
 */
export interface SilentAuthOptions {
  /** AuthVital server URL (e.g., https://auth.myapp.com) */
  authVitalHost: string;
  /** OAuth client_id for your application */
  clientId: string;
  /** OAuth redirect URI (must match registered redirect URI) */
  redirectUri?: string;
  /** OAuth scopes to request (space-separated) */
  scope?: string;
  /** Timeout in milliseconds (default: 10000) */
  timeout?: number;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Result of a silent authentication attempt
 */
export interface SilentAuthResult {
  /** Whether the silent authentication was successful */
  success: boolean;
  /** Access token (if successful) */
  accessToken?: string;
  /** User information (if successful) */
  user?: AuthUser;
  /** Error code (if failed) */
  error?:
    | 'login_required'
    | 'consent_required'
    | 'interaction_required'
    | 'timeout'
    | 'invalid_request'
    | 'server_error'
    | string;
  /** Error description (if failed) */
  errorDescription?: string;
  /** State parameter from response */
  state?: string;
}

/**
 * Message data from the hidden iframe postMessage
 */
interface SilentRefreshMessage {
  type: 'silent_refresh_response';
  code?: string;
  error?: string;
  error_description?: string;
  state?: string;
}

// =============================================================================
// INTERNAL STATE
// =============================================================================

/** Currently active iframe element */
let activeIframe: HTMLIFrameElement | null = null;

/** Current message listener */
let activeListener: ((event: MessageEvent) => void) | null = null;

/** Debug mode flag */
let debugMode = false;

// =============================================================================
// DEBUG LOGGING
// =============================================================================

/**
 * Log debug message
 */
function debug(message: string, ...args: unknown[]): void {
  if (debugMode) {
    // eslint-disable-next-line no-console
    console.log(`[AuthVital SilentAuth] ${message}`, ...args);
  }
}

// =============================================================================
// SILENT AUTHENTICATION
// =============================================================================

/**
 * Attempt silent authentication using hidden iframe with `prompt=none`
 *
 * This creates a hidden iframe that navigates to the authorization endpoint
 * with `prompt=none`. If the user has a valid session at the IDP, they'll
 * receive an authorization code without any user interaction. If not, they'll
 * receive an error like `login_required`.
 *
 * @param options - Silent authentication options
 * @returns Promise resolving to the authentication result
 *
 * @example
 * ```typescript
 * const result = await attemptSilentAuth({
 *   authVitalHost: 'https://auth.myapp.com',
 *   clientId: 'my-app',
 *   redirectUri: 'https://myapp.com/auth/callback',
 * });
 *
 * if (result.success && result.accessToken) {
 *   // User is authenticated
 *   console.log('User:', result.user);
 * } else if (result.error === 'login_required') {
 *   // User needs to log in
 *   redirectToLogin();
 * }
 * ```
 */
export async function attemptSilentAuth(
  options: SilentAuthOptions
): Promise<SilentAuthResult> {
  const {
    authVitalHost,
    clientId,
    redirectUri = typeof window !== 'undefined'
      ? `${window.location.origin}/auth/callback`
      : '',
    scope = 'openid profile email',
    timeout = 10000,
    debug: enableDebug = false,
  } = options;

  debugMode = enableDebug;

  // Validate environment
  if (typeof window === 'undefined') {
    debug('Silent auth not available in non-browser environment');
    return {
      success: false,
      error: 'server_error',
      errorDescription: 'Silent authentication is only available in browser environments',
    };
  }

  // Validate required parameters
  if (!authVitalHost || !clientId || !redirectUri) {
    debug('Missing required parameters', { authVitalHost: !!authVitalHost, clientId: !!clientId, redirectUri: !!redirectUri });
    return {
      success: false,
      error: 'invalid_request',
      errorDescription: 'Missing required parameters: authVitalHost, clientId, redirectUri',
    };
  }

  debug('Starting silent authentication', { authVitalHost, clientId, timeout });

  // Clean up any existing iframe
  cleanupIframe();

  // Generate state parameter for CSRF protection
  const state = generateCSRFState();

  // Build authorization URL with prompt=none
  const authorizeUrl = buildSilentAuthUrl({
    authVitalHost,
    clientId,
    redirectUri,
    scope,
    state,
  });

  return new Promise<SilentAuthResult>((resolve) => {
    let timeoutId: number | null = null;
    let resolved = false;

    /**
     * Resolve the promise only once
     */
    const safeResolve = (result: SilentAuthResult): void => {
      if (resolved) return;
      resolved = true;

      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }

      cleanupIframe();
      debug('Silent auth result', { success: result.success, error: result.error });
      resolve(result);
    };

    /**
     * Handle postMessage from the hidden iframe
     */
    const handleMessage = (event: MessageEvent): void => {
      // Validate origin
      const expectedOrigin = new URL(authVitalHost).origin;
      if (event.origin !== expectedOrigin) {
        debug('Ignoring message from unexpected origin', { origin: event.origin, expected: expectedOrigin });
        return;
      }

      // Validate message data
      const data = event.data as SilentRefreshMessage;
      if (data?.type !== 'silent_refresh_response') {
        debug('Ignoring non-silent-refresh message', { type: data?.type });
        return;
      }

      debug('Received silent refresh response', { hasCode: !!data.code, error: data.error });

      // Handle error response
      if (data.error) {
        safeResolve({
          success: false,
          error: data.error,
          errorDescription: data.error_description,
          state: data.state,
        });
        return;
      }

      // Handle success response with code
      if (data.code) {
        // Validate state to prevent CSRF
        if (data.state !== state) {
          debug('State mismatch detected', { received: data.state?.substring(0, 8), expected: state.substring(0, 8) });
          safeResolve({
            success: false,
            error: 'server_error',
            errorDescription: 'CSRF state validation failed',
          });
          return;
        }

        // Exchange code for tokens
        exchangeCodeForTokens({
          authVitalHost,
          clientId,
          code: data.code,
          redirectUri,
        })
          .then((tokenResult) => {
            if (tokenResult.success) {
              safeResolve({
                success: true,
                accessToken: tokenResult.accessToken,
                user: tokenResult.user,
                state: data.state,
              });
            } else {
              safeResolve({
                success: false,
                error: tokenResult.error || 'server_error',
                errorDescription: tokenResult.errorDescription,
                state: data.state,
              });
            }
          })
          .catch((err) => {
            debug('Token exchange error', { error: (err as Error).message });
            safeResolve({
              success: false,
              error: 'server_error',
              errorDescription: 'Failed to exchange authorization code for tokens',
              state: data.state,
            });
          });
        return;
      }

      // Unexpected response format
      safeResolve({
        success: false,
        error: 'server_error',
        errorDescription: 'Invalid response format from authorization server',
      });
    };

    // Store the listener for cleanup
    activeListener = handleMessage;

    // Listen for postMessage from the iframe
    window.addEventListener('message', handleMessage);

    // Set timeout
    timeoutId = window.setTimeout(() => {
      debug('Silent authentication timed out');
      safeResolve({
        success: false,
        error: 'timeout',
        errorDescription: `Silent authentication timed out after ${timeout}ms`,
      });
    }, timeout);

    // Create and inject the hidden iframe
    createHiddenIframe(authorizeUrl);
  });
}

/**
 * Build the silent authentication URL with prompt=none
 */
function buildSilentAuthUrl(params: {
  authVitalHost: string;
  clientId: string;
  redirectUri: string;
  scope: string;
  state: string;
}): string {
  const url = new URL(`${params.authVitalHost}/oauth/authorize`);
  url.searchParams.set('client_id', params.clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('scope', params.scope);
  url.searchParams.set('state', params.state);
  url.searchParams.set('prompt', 'none');

  return url.toString();
}

/**
 * Create and inject a hidden iframe
 */
function createHiddenIframe(src: string): void {
  debug('Creating hidden iframe', { src: src.substring(0, 100) + '...' });

  const iframe = document.createElement('iframe');
  iframe.setAttribute('src', src);
  iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
  iframe.style.position = 'absolute';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = 'none';
  iframe.style.visibility = 'hidden';
  iframe.style.pointerEvents = 'none';
  iframe.setAttribute('aria-hidden', 'true');

  document.body.appendChild(iframe);
  activeIframe = iframe;

  debug('Hidden iframe created and injected');
}

/**
 * Clean up the hidden iframe and message listener
 */
function cleanupIframe(): void {
  // Remove message listener
  if (activeListener) {
    window.removeEventListener('message', activeListener);
    activeListener = null;
    debug('Message listener removed');
  }

  // Remove iframe
  if (activeIframe) {
    if (activeIframe.parentNode) {
      activeIframe.parentNode.removeChild(activeIframe);
    }
    activeIframe = null;
    debug('Hidden iframe removed');
  }
}

/**
 * Exchange authorization code for tokens
 */
async function exchangeCodeForTokens(params: {
  authVitalHost: string;
  clientId: string;
  code: string;
  redirectUri: string;
}): Promise<{
  success: boolean;
  accessToken?: string;
  user?: AuthUser;
  error?: string;
  errorDescription?: string;
}> {
  debug('Exchanging code for tokens');

  try {
    const response = await fetch(`${params.authVitalHost}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: params.clientId,
        code: params.code,
        redirect_uri: params.redirectUri,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      debug('Token exchange failed', { status: response.status, error });
      return {
        success: false,
        error: error.error || 'server_error',
        errorDescription: error.error_description || `Token exchange failed: ${response.status}`,
      };
    }

    const data = await response.json();

    if (!data.access_token) {
      debug('No access token in response');
      return {
        success: false,
        error: 'server_error',
        errorDescription: 'No access token in response',
      };
    }

    // Decode user from token
    const user = decodeTokenUser(data.access_token);

    debug('Token exchange successful');
    return {
      success: true,
      accessToken: data.access_token,
      user,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    debug('Token exchange error', { error: message });
    return {
      success: false,
      error: 'server_error',
      errorDescription: message,
    };
  }
}

/**
 * Decode user information from access token
 */
function decodeTokenUser(token: string): AuthUser | undefined {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return undefined;

    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))
    );

    return {
      id: payload.sub,
      email: payload.email || '',
      emailVerified: payload.email_verified,
      name: payload.name,
      givenName: payload.given_name,
      familyName: payload.family_name,
      picture: payload.picture,
      tenantId: payload.tenant_id,
      tenantSubdomain: payload.tenant_subdomain,
      tenantRoles: payload.tenant_roles,
      tenantPermissions: payload.tenant_permissions,
      license: payload.license,
    };
  } catch {
    return undefined;
  }
}

/**
 * Check if silent authentication is available in the current environment
 *
 * @returns true if silent authentication is supported
 */
export function isSilentAuthAvailable(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof document !== 'undefined' &&
    typeof document.createElement === 'function' &&
    typeof window.addEventListener === 'function' &&
    typeof window.postMessage === 'function'
  );
}

/**
 * Abort any in-progress silent authentication attempt
 */
export function abortSilentAuth(): void {
  debug('Aborting silent authentication');
  cleanupIframe();
}
