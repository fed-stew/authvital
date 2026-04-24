/**
 * @authvital/browser - Auth Client
 *
 * Main browser authentication client with split-token architecture.
 *
 * Features:
 * - In-memory token storage (no localStorage/sessionStorage)
 * - Silent token refresh with httpOnly cookie
 * - OAuth flow helpers
 * - Axios instance with automatic auth headers
 * - User session management
 *
 * @packageDocumentation
 */

import {
  setAccessToken,
  getAccessToken,
  clearTokens,
  initializeTokenStore,
  isTokenExpired,
  getStateSnapshot,
} from './token-store';
import { attemptSilentAuth, SilentAuthResult } from './silent-auth';
import {
  startSessionMonitoring,
  stopSessionMonitoring,
  updateSessionState,
  isSessionMonitoring,
  SessionManagerOptions,
} from './session-management';
import { generateCSRFState } from '@authvital/core';
import { initializeRefresh, performRefresh, ensureValidToken, scheduleProactiveRefresh } from './refresh';
import { createAxiosInstance, createAuthFetch } from './interceptor';
import type {
  AuthVitalBrowserConfig,
  AuthUser,
  LogoutResult,
  RefreshResult,
  AuthorizationOptions,
  OAuthCallbackResult,
  AuthEventListener,
  AuthEvent,
  EnhancedJwtPayload,
} from './types';
import type { AxiosInstance } from 'axios';

// =============================================================================
// AUTHVITAL BROWSER CLIENT
// =============================================================================

/**
 * AuthVital Browser Client
 *
 * Main class for browser/SPA authentication with split-token architecture.
 *
 * @example
 * ```ts
 * const auth = new AuthVitalClient({
 *   authVitalHost: 'https://auth.myapp.com',
 *   clientId: 'my-app',
 *   onAuthRequired: () => router.push('/login'),
 * });
 *
 * // Check if user is authenticated
 * if (await auth.isAuthenticated()) {
 *   const user = await auth.getUser();
 * }
 * ```
 */
export class AuthVitalClient {
  private config: AuthVitalBrowserConfig;
  private axiosInstance: AxiosInstance;
  private cancelProactiveRefresh: (() => void) | null = null;
  private eventListeners: Set<AuthEventListener> = new Set();
  private currentUser: AuthUser | null = null;

  /**
   * Create a new AuthVital browser client
   *
   * @param config - Client configuration
   */
  constructor(config: AuthVitalBrowserConfig) {
    // Validate required config
    if (!config.authVitalHost) {
      throw new Error('authVitalHost is required');
    }
    if (!config.clientId) {
      throw new Error('clientId is required');
    }

    this.config = {
      ...config,
      authVitalHost: config.authVitalHost.replace(/\/$/, ''),
      redirectUri: config.redirectUri || (typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : ''),
    };

    // Initialize token store
    initializeTokenStore({ debug: config.debug });

    // Initialize refresh module
    initializeRefresh({
      authVitalHost: this.config.authVitalHost,
      debug: config.debug,
      onRefreshFailed: this.handleRefreshFailed.bind(this),
    });

    // Create axios instance with interceptors
    this.axiosInstance = createAxiosInstance({
      authVitalHost: this.config.authVitalHost,
      getAccessToken: () => getAccessToken(),
      refreshAccessToken: () => performRefresh().then(r => r.accessToken ?? null),
      onAuthError: config.onAuthRequired,
      debug: config.debug,
    });

    this.log('Client initialized');
  }

  // ===========================================================================
  // DEBUG LOGGING
  // ===========================================================================

  private log(message: string, ...args: unknown[]): void {
    if (this.config.debug) {
      // eslint-disable-next-line no-console
      console.log(`[AuthVital Client] ${message}`, ...args);
    }
  }

  // ===========================================================================
  // AUTHENTICATION METHODS
  // ===========================================================================

  /**
   * Check if user is currently authenticated
   *
   * @returns True if access token exists and is valid
   */
  isAuthenticated(): boolean {
    const token = getAccessToken();
    if (!token) return false;
    
    return !isTokenExpired(60); // 60 second buffer
  }

  /**
   * Check authentication status asynchronously
   *
   * Attempts silent refresh if no valid token exists.
   *
   * @returns True if authenticated after potential refresh
   */
  async checkAuth(): Promise<boolean> {
    this.log('Checking authentication status');

    // If we have a valid token, we're good
    if (this.isAuthenticated()) {
      this.log('Valid token exists');
      return true;
    }

    // Try to refresh
    const refreshed = await ensureValidToken();
    
    if (refreshed) {
      this.emit('auth:refresh', { source: 'checkAuth' });
      this.scheduleNextRefresh();
    }

    return refreshed;
  }

  /**
   * Get current user information
   *
   * Decodes the JWT access token to extract user info.
   *
   * @returns User info or null if not authenticated
   */
  getUser(): AuthUser | null {
    const token = getAccessToken();
    if (!token) return null;

    // Decode JWT payload
    try {
      const payload = this.decodeJwt(token);
      if (!payload) return null;

      this.currentUser = this.parseJwtPayload(payload);
      return this.currentUser;
    } catch {
      return null;
    }
  }

  /**
   * Get user information from the server
   *
   * Calls the IDP's userinfo endpoint with the current access token.
   *
   * @returns User info from server or null if not authenticated
   */
  async fetchUser(): Promise<AuthUser | null> {
    if (!this.isAuthenticated()) {
      const refreshed = await this.checkAuth();
      if (!refreshed) return null;
    }

    try {
      const response = await this.axiosInstance.get('/oauth/userinfo');
      this.currentUser = this.parseUserInfo(response.data);
      return this.currentUser;
    } catch (error) {
      this.log('Failed to fetch user', { error });
      return null;
    }
  }

  /**
   * Set authentication state directly
   *
   * Use this after OAuth callback to set the access token.
   *
   * @param accessToken - The access token from OAuth
   * @param expiresIn - Token expiration in seconds
   * @returns The parsed user info
   */
  setAuth(accessToken: string, expiresIn?: number): AuthUser | null {
    this.log('Setting auth state', { expiresIn });

    // Store the token
    setAccessToken(accessToken, expiresIn);

    // Parse user from token
    const user = this.getUser();
    this.currentUser = user;

    // Schedule proactive refresh
    this.scheduleNextRefresh();

    // Emit event
    this.emit('auth:login', { user });

    return user;
  }

  /**
   * Clear authentication state
   *
   * Removes access token from memory. The refresh token (httpOnly cookie)
   * will be cleared by calling the logout endpoint.
   */
  clearAuth(): void {
    this.log('Clearing auth state');

    clearTokens();
    this.currentUser = null;
    this.cancelScheduledRefresh();

    this.emit('auth:logout', {});
  }

  // ===========================================================================
  // LOGIN / LOGOUT
  // ===========================================================================

  /**
   * Redirect to AuthVital login page (OAuth flow)
   *
   * Generates a CSRF state parameter for security and stores it in sessionStorage.
   * The state will be validated in handleCallback() to prevent CSRF attacks.
   *
   * @param options - Authorization options
   */
  login(options: AuthorizationOptions = {}): void {
    this.log('Redirecting to login', options);

    // Generate and store CSRF state if not provided
    const state = this.prepareCSRFState(options.state);

    const url = this.buildAuthorizationUrl({
      ...options,
      screen: options.screen || 'login',
      state,
    });

    if (typeof window !== 'undefined') {
      window.location.href = url;
    }
  }

  /**
   * Alias for login
   */
  signIn = this.login;

  /**
   * Redirect to AuthVital signup page (OAuth flow)
   *
   * Generates a CSRF state parameter for security and stores it in sessionStorage.
   * The state will be validated in handleCallback() to prevent CSRF attacks.
   *
   * @param options - Authorization options
   */
  signup(options: AuthorizationOptions = {}): void {
    this.log('Redirecting to signup', options);

    // Generate and store CSRF state if not provided
    const state = this.prepareCSRFState(options.state);

    const url = this.buildAuthorizationUrl({
      ...options,
      screen: 'signup',
      state,
    });

    if (typeof window !== 'undefined') {
      window.location.href = url;
    }
  }

  /**
   * Logout the current user
   *
   * Clears local state and redirects to AuthVital logout endpoint.
   *
   * @param options - Logout options
   * @returns Promise that resolves when logout completes
   */
  async logout(options?: { postLogoutRedirectUri?: string }): Promise<LogoutResult> {
    this.log('Logging out');

    // Clear local state
    this.clearAuth();

    // Redirect to AuthVital logout
    const logoutUrl = this.buildLogoutUrl(options);
    
    if (typeof window !== 'undefined') {
      window.location.href = logoutUrl;
    }

    return { success: true };
  }

  /**
   * Alias for logout
   */
  signOut = this.logout;

  // ===========================================================================
  // TOKEN MANAGEMENT
  // ===========================================================================

  /**
   * Get the current access token
   *
   * @returns Access token or null
   */
  getAccessToken(): string | null {
    return getAccessToken();
  }

  /**
   * Refresh the access token
   *
   * Performs a silent refresh using the httpOnly refresh cookie.
   *
   * @returns Refresh result with new token or error
   */
  async refreshToken(): Promise<RefreshResult> {
    this.log('Refreshing token');

    const result = await performRefresh();

    if (result.success && result.accessToken) {
      this.scheduleNextRefresh();
      this.emit('auth:refresh', { success: true });
    } else {
      this.emit('auth:refresh-failed', { error: result.error });
    }

    return result;
  }

  // ===========================================================================
  // OAUTH CALLBACK HANDLING
  // ===========================================================================

  /**
   * Handle OAuth callback
   *
   * Processes the authorization code from the OAuth redirect,
   * exchanges it for tokens, and updates state.
   *
   * @param url - The callback URL (defaults to current URL)
   * @returns Callback result with token or error
   */
  async handleCallback(url?: string): Promise<OAuthCallbackResult> {
    const callbackUrl = url || (typeof window !== 'undefined' ? window.location.href : '');
    this.log('Handling OAuth callback', { url: callbackUrl });

    const urlObj = new URL(callbackUrl);
    const params = new URLSearchParams(urlObj.search);

    // Check for errors
    const errorCode = params.get('error');
    const errorDescription = params.get('error_description');
    
    if (errorCode) {
      this.log('OAuth error', { errorCode, errorDescription });
      this.emit('auth:error', { code: errorCode, description: errorDescription });
      
      return {
        success: false,
        errorCode,
        errorDescription: errorDescription || undefined,
      };
    }

    // Get authorization code and state
    const code = params.get('code');
    const state = params.get('state') || undefined;

    // Validate CSRF state to prevent attacks
    try {
      this.validateCSRFState(state ?? null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'CSRF validation failed';
      this.log('OAuth callback failed state validation', { error: message });
      this.emit('auth:error', { code: 'CSRF_ERROR', description: message });
      
      return {
        success: false,
        errorCode: 'CSRF_ERROR',
        errorDescription: message,
        state,
      };
    }

    if (!code) {
      const error = 'No authorization code in callback';
      this.log(error);
      this.emit('auth:error', { code: 'NO_CODE', description: error });
      
      return {
        success: false,
        errorCode: 'NO_CODE',
        errorDescription: error,
        state,
      };
    }

    // Exchange code for tokens
    try {
      const tokenResponse = await this.exchangeCodeForTokens(code);
      
      if (!tokenResponse.access_token) {
        throw new Error('No access token in response');
      }

      // Set auth state
      this.setAuth(tokenResponse.access_token, tokenResponse.expires_in);
      const user = this.getUser();

      this.log('Callback successful');

      return {
        success: true,
        accessToken: tokenResponse.access_token,
        user: user || undefined,
        state,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Token exchange failed';
      this.log('Token exchange failed', { error: message });
      
      this.emit('auth:error', { code: 'EXCHANGE_FAILED', description: message });

      return {
        success: false,
        errorCode: 'EXCHANGE_FAILED',
        errorDescription: message,
        state,
      };
    }
  }

  // ===========================================================================
  // HTTP CLIENT
  // ===========================================================================

  /**
   * Get the configured Axios instance
   *
   * This instance automatically handles:
   * - Attaching Bearer tokens to requests
   * - 401 handling with silent refresh
   * - Request queuing during refresh
   *
   * @returns Axios instance
   */
  getAxiosInstance(): AxiosInstance {
    return this.axiosInstance;
  }

  /**
   * Create a fetch wrapper with AuthVital authentication
   *
   * Similar to the Axios instance but using native fetch API.
   *
   * @returns Authenticated fetch function
   */
  createFetch(): (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> {
    return createAuthFetch({
      authVitalHost: this.config.authVitalHost,
      getAccessToken: () => getAccessToken(),
      refreshAccessToken: () => performRefresh().then(r => r.accessToken ?? null),
      onAuthError: this.config.onAuthRequired,
      debug: this.config.debug,
    });
  }

  // ===========================================================================
  // EVENTS
  // ===========================================================================

  /**
   * Subscribe to auth events
   *
   * @param listener - Event listener function
   * @returns Unsubscribe function
   */
  onEvent(listener: AuthEventListener): () => void {
    this.eventListeners.add(listener);
    
    return () => {
      this.eventListeners.delete(listener);
    };
  }

  /**
   * Emit an auth event
   *
   * @param type - Event type
   * @param payload - Event payload
   */
  private emit(type: AuthEvent['type'], payload: unknown): void {
    const event: AuthEvent = {
      type,
      payload,
      timestamp: Date.now(),
    };

    this.eventListeners.forEach(listener => {
      try {
        listener(event);
      } catch {
        // Ignore listener errors
      }
    });
  }

  // ===========================================================================
  // CSRF STATE MANAGEMENT
  // ===========================================================================

  /**
   * CSRF state storage key in sessionStorage.
   * Using sessionStorage ensures state is cleared when the tab is closed.
   */
  private static readonly CSRF_STATE_KEY = 'authvital_oauth_state';

  /**
   * Prepare CSRF state for OAuth flow.
   *
   * If a custom state is provided, it will be used directly (bypassing auto-CSRF).
   * Otherwise, generates a cryptographically secure random state and stores it
   * in sessionStorage for validation during the callback.
   *
   * @param customState - Optional custom state (bypasses auto-generation)
   * @returns The state to use for the OAuth flow
   */
  private prepareCSRFState(customState?: string): string {
    // If custom state provided, use it directly
    if (customState) {
      this.log('Using custom state (CSRF auto-generation bypassed)');
      return customState;
    }

    // Generate a new CSRF state
    const state = generateCSRFState();
    
    // Store in sessionStorage for callback validation
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(AuthVitalClient.CSRF_STATE_KEY, state);
        this.log('CSRF state generated and stored');
      }
    } catch (error) {
      this.log('Failed to store CSRF state', { error });
    }

    return state;
  }

  /**
   * Validate CSRF state from callback.
   *
   * Compares the state returned in the callback URL with the state
   * stored in sessionStorage. Throws an error if they don't match,
   * indicating a potential CSRF attack.
   *
   * @param receivedState - The state received from the OAuth callback
   * @throws Error if state validation fails
   */
  private validateCSRFState(receivedState: string | null): void {
    // Retrieve expected state from sessionStorage
    let expectedState: string | null = null;
    
    try {
      if (typeof sessionStorage !== 'undefined') {
        expectedState = sessionStorage.getItem(AuthVitalClient.CSRF_STATE_KEY);
      }
    } catch (error) {
      this.log('Failed to retrieve CSRF state from storage', { error });
    }

    // If we don't have an expected state, we can't validate
    // This could happen if the user manually navigated to the callback URL
    if (!expectedState) {
      this.log('No CSRF state found in storage - skipping validation');
      return;
    }

    // Clear the state from storage regardless of validation result
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem(AuthVitalClient.CSRF_STATE_KEY);
      }
    } catch (error) {
      this.log('Failed to clear CSRF state from storage', { error });
    }

    // Validate the state matches
    if (receivedState !== expectedState) {
      this.log('CSRF state mismatch detected', { 
        received: receivedState, 
        expected: expectedState?.substring(0, 8) + '...' 
      });
      throw new Error(
        'CSRF state validation failed. The OAuth state parameter does not match. ' +
        'This could indicate a potential cross-site request forgery attack.'
      );
    }

    this.log('CSRF state validated successfully');
  }

  /**
   * Clear CSRF state from storage.
   * Useful for cleanup or when manually handling OAuth flows.
   */
  clearCSRFState(): void {
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem(AuthVitalClient.CSRF_STATE_KEY);
        this.log('CSRF state cleared from storage');
      }
    } catch (error) {
      this.log('Failed to clear CSRF state', { error });
    }
  }

  // ===========================================================================
  // INTERNAL METHODS
  // ===========================================================================

  /**
   * Build OAuth authorization URL
   *
   * @param options - Authorization options
   * @returns Authorization URL
   */
  private buildAuthorizationUrl(options: AuthorizationOptions): string {
    const url = new URL(`${this.config.authVitalHost}/oauth/authorize`);

    // Required params
    url.searchParams.set('client_id', this.config.clientId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', this.config.redirectUri || '');

    // Required: CSRF state parameter for security
    // State should always be present (either auto-generated or custom)
    if (options.state) {
      url.searchParams.set('state', options.state);
    }

    // Optional params
    if (this.config.scope) {
      url.searchParams.set('scope', this.config.scope);
    }

    if (options.email) {
      url.searchParams.set('email', options.email);
    }

    if (options.screen) {
      url.searchParams.set('screen', options.screen);
    }

    if (options.inviteToken) {
      url.searchParams.set('invite_token', options.inviteToken);
    }

    if (options.tenantHint) {
      url.searchParams.set('tenant_hint', options.tenantHint);
    }

    return url.toString();
  }

  /**
   * Build logout URL
   *
   * @param options - Logout options
   * @returns Logout URL
   */
  private buildLogoutUrl(options?: { postLogoutRedirectUri?: string }): string {
    const url = new URL(`${this.config.authVitalHost}/api/auth/logout/redirect`);
    
    const redirectUri = options?.postLogoutRedirectUri || 
      (typeof window !== 'undefined' ? window.location.origin : undefined);
    
    if (redirectUri) {
      url.searchParams.set('post_logout_redirect_uri', redirectUri);
    }

    return url.toString();
  }

  /**
   * Exchange authorization code for tokens
   *
   * @param code - Authorization code
   * @returns Token response
   */
  private async exchangeCodeForTokens(code: string): Promise<{
    access_token: string;
    token_type: string;
    expires_in: number;
    refresh_token?: string;
    scope?: string;
  }> {
    const response = await fetch(`${this.config.authVitalHost}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: this.config.clientId,
        code,
        redirect_uri: this.config.redirectUri,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `Token exchange failed: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Schedule the next proactive token refresh
   */
  private scheduleNextRefresh(): void {
    // Cancel any existing scheduled refresh
    this.cancelScheduledRefresh();

    // Schedule new refresh (2 minutes before expiration)
    this.cancelProactiveRefresh = scheduleProactiveRefresh(120);
    
    this.log('Scheduled proactive refresh');
  }

  /**
   * Cancel the scheduled refresh
   */
  private cancelScheduledRefresh(): void {
    if (this.cancelProactiveRefresh) {
      this.cancelProactiveRefresh();
      this.cancelProactiveRefresh = null;
    }
  }

  /**
   * Handle refresh failure
   *
   * @param error - The refresh error
   */
  private handleRefreshFailed(error: Error): void {
    this.log('Refresh failed', { error: error.message });
    this.clearAuth();
    this.config.onRefreshFailed?.(error);
    this.config.onAuthRequired?.();
  }

  // ===========================================================================
  // JWT UTILITIES
  // ===========================================================================

  /**
   * Decode a JWT token
   *
   * @param token - JWT token string
   * @returns Decoded payload or null
   */
  private decodeJwt(token: string): EnhancedJwtPayload | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;

      const payload = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
      return JSON.parse(payload) as EnhancedJwtPayload;
    } catch {
      return null;
    }
  }

  /**
   * Parse JWT payload into AuthUser
   *
   * @param payload - JWT payload
   * @returns AuthUser object
   */
  private parseJwtPayload(payload: EnhancedJwtPayload): AuthUser {
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
  }

  /**
   * Parse userinfo response into AuthUser
   *
   * @param data - Userinfo response data
   * @returns AuthUser object
   */
  private parseUserInfo(data: Record<string, unknown>): AuthUser {
    return {
      id: String(data.sub || data.id || ''),
      email: String(data.email || ''),
      emailVerified: Boolean(data.email_verified),
      name: data.name as string | undefined,
      givenName: data.given_name as string | undefined,
      familyName: data.family_name as string | undefined,
      picture: data.picture as string | undefined,
      tenantId: data.tenant_id as string | undefined,
      tenantSubdomain: data.tenant_subdomain as string | undefined,
      tenantRoles: data.tenant_roles as string[] | undefined,
      tenantPermissions: data.tenant_permissions as string[] | undefined,
    };
  }

  // ===========================================================================
  // SILENT AUTHENTICATION
  // ===========================================================================

  /**
   * Attempt silent authentication using hidden iframe with `prompt=none`
   *
   * This method allows you to check if the user has a valid session at the IDP
   * without triggering a full-page redirect. It creates a hidden iframe that
   * navigates to the authorization endpoint with `prompt=none`.
   *
   * @param timeout - Timeout in milliseconds (default: 10000)
   * @returns Promise resolving to the silent authentication result
   *
   * @example
   * ```typescript
   * const result = await auth.silentAuth();
   *
   * if (result.success) {
   *   // User is authenticated, tokens are set
   *   console.log('User:', result.user);
   * } else if (result.error === 'login_required') {
   *   // User needs to log in
   *   auth.login();
   * }
   * ```
   */
  async silentAuth(timeout = 10000): Promise<SilentAuthResult> {
    this.log('Attempting silent authentication', { timeout });

    const result = await attemptSilentAuth({
      authVitalHost: this.config.authVitalHost,
      clientId: this.config.clientId,
      redirectUri: this.config.redirectUri,
      scope: this.config.scope,
      timeout,
      debug: this.config.debug,
    });

    if (result.success && result.accessToken) {
      this.setAuth(result.accessToken);
      this.log('Silent authentication successful');
    } else {
      this.log('Silent authentication failed', { error: result.error });
    }

    return result;
  }

  // ===========================================================================
  // SESSION MANAGEMENT (OIDC)
  // ===========================================================================

  /**
   * Start OIDC session monitoring
   *
   * Monitors the user's session state at the IDP using the check_session_iframe
   * endpoint. When the session changes (e.g., user logs out in another tab),
   * the callback is invoked.
   *
   * Requires the session_state parameter from the authorization response.
   *
   * @param sessionState - The session_state from the authorization response
   * @param onSessionChange - Callback invoked when session changes
   * @param checkInterval - Polling interval in milliseconds (default: 5000)
   * @returns Promise resolving to true if monitoring started successfully
   *
   * @example
   * ```typescript
   * // Get session_state from URL after OAuth callback
   * const urlParams = new URLSearchParams(window.location.search);
   * const sessionState = urlParams.get('session_state');
   *
   * if (sessionState) {
   *   await auth.startSessionMonitoring(sessionState, (changed) => {
   *     if (changed) {
   *       console.log('Session changed - re-authenticating');
   *       auth.silentAuth().then(result => {
   *         if (!result.success) {
   *           auth.logout();
   *         }
   *       });
   *     }
   *   });
   * }
   * ```
   */
  async startSessionMonitoring(
    sessionState: string,
    onSessionChange?: (changed: boolean) => void,
    checkInterval = 5000
  ): Promise<boolean> {
    this.log('Starting session monitoring', { checkInterval });

    const options: SessionManagerOptions = {
      authVitalHost: this.config.authVitalHost,
      clientId: this.config.clientId,
      sessionState,
      checkInterval,
      debug: this.config.debug,
      onSessionChange: (changed, event) => {
        this.log('Session change detected', { changed });
        onSessionChange?.(changed);
        this.emit('auth:session-change', { changed, event });
      },
      onError: (error) => {
        this.log('Session monitoring error', { code: error.code, message: error.message });
        this.emit('auth:error', { code: 'SESSION_MONITOR_ERROR', error });
      },
    };

    return startSessionMonitoring(options);
  }

  /**
   * Stop OIDC session monitoring
   *
   * Stops the session monitoring and cleans up the hidden iframe.
   */
  stopSessionMonitoring(): void {
    this.log('Stopping session monitoring');
    stopSessionMonitoring();
  }

  /**
   * Update the session state being monitored
   *
   * Call this after a token refresh or silent authentication that
   * returns a new session_state.
   *
   * @param sessionState - The new session_state value
   * @returns true if updated successfully
   */
  updateSessionState(sessionState: string): boolean {
    this.log('Updating session state');
    return updateSessionState(sessionState);
  }

  /**
   * Check if session monitoring is currently active
   *
   * @returns true if monitoring is running
   */
  isSessionMonitoring(): boolean {
    return isSessionMonitoring();
  }

  // ===========================================================================
  // TOKEN INTROSPECTION & REVOCATION
  // ===========================================================================

  /**
   * Introspect a token to check its validity and get metadata
   *
   * Calls the OAuth introspection endpoint (RFC 7662) to check if a token
   * is active and retrieve its associated metadata.
   *
   * @param token - The token to introspect (defaults to current access token)
   * @returns Promise resolving to the introspection response
   *
   * @example
   * ```typescript
   * // Introspect current token
   * const result = await auth.introspectToken();
   * console.log('Token active:', result.active);
   * console.log('Token expires:', new Date(result.exp! * 1000));
   *
   * // Introspect a specific token
   * const result = await auth.introspectToken(someOtherToken);
   * ```
   */
  async introspectToken(token?: string): Promise<{
    active: boolean;
    scope?: string;
    client_id?: string;
    username?: string;
    token_type?: string;
    exp?: number;
    iat?: number;
    nbf?: number;
    sub?: string;
    aud?: string | string[];
    iss?: string;
    jti?: string;
  }> {
    const tokenToIntrospect = token || getAccessToken();

    if (!tokenToIntrospect) {
      throw new Error('No token provided and no current access token available');
    }

    this.log('Introspecting token');

    try {
      const response = await this.axiosInstance.post(
        `${this.config.authVitalHost}/oauth/introspect`,
        { token: tokenToIntrospect }
      );

      return response.data;
    } catch (error) {
      this.log('Token introspection failed', { error });
      throw error;
    }
  }

  /**
   * Revoke a token
   *
   * Calls the OAuth revocation endpoint (RFC 7009) to revoke a token.
   * This invalidates the token at the authorization server.
   *
   * @param token - The token to revoke (defaults to current access token)
   * @param tokenTypeHint - Hint for the token type ('access_token' or 'refresh_token')
   * @returns Promise resolving to true if revocation was successful
   *
   * @example
   * ```typescript
   * // Revoke current access token
   * await auth.revokeToken();
   *
   * // Revoke a specific refresh token
   * await auth.revokeToken(refreshToken, 'refresh_token');
   * ```
   */
  async revokeToken(
    token?: string,
    tokenTypeHint?: 'access_token' | 'refresh_token'
  ): Promise<boolean> {
    const tokenToRevoke = token || getAccessToken();

    if (!tokenToRevoke) {
      throw new Error('No token provided and no current access token available');
    }

    this.log('Revoking token', { tokenTypeHint });

    try {
      await this.axiosInstance.post(
        `${this.config.authVitalHost}/oauth/revoke`,
        {
          token: tokenToRevoke,
          ...(tokenTypeHint && { token_type_hint: tokenTypeHint }),
        }
      );

      // If we revoked the current access token, clear local state
      if (!token || token === getAccessToken()) {
        this.clearAuth();
      }

      this.log('Token revoked successfully');
      return true;
    } catch (error) {
      this.log('Token revocation failed', { error });
      return false;
    }
  }

  // ===========================================================================
  // DIAGNOSTICS
  // ===========================================================================

  /**
   * Get current state snapshot for debugging
   *
   * @returns State snapshot (safe to log)
   */
  getDebugState(): {
    isAuthenticated: boolean;
    hasUser: boolean;
    isSessionMonitoring: boolean;
    tokenStore: ReturnType<typeof getStateSnapshot>;
  } {
    return {
      isAuthenticated: this.isAuthenticated(),
      hasUser: !!this.currentUser,
      isSessionMonitoring: isSessionMonitoring(),
      tokenStore: getStateSnapshot(),
    };
  }
}
