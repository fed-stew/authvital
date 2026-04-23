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
   * @param options - Authorization options
   */
  login(options: AuthorizationOptions = {}): void {
    this.log('Redirecting to login', options);

    const url = this.buildAuthorizationUrl({
      ...options,
      screen: options.screen || 'login',
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
   * @param options - Authorization options
   */
  signup(options: AuthorizationOptions = {}): void {
    this.log('Redirecting to signup', options);

    const url = this.buildAuthorizationUrl({
      ...options,
      screen: 'signup',
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

    // Get authorization code
    const code = params.get('code');
    const state = params.get('state') || undefined;

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

    // Optional params
    if (this.config.scope) {
      url.searchParams.set('scope', this.config.scope);
    }

    if (options.state) {
      url.searchParams.set('state', options.state);
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
    tokenStore: ReturnType<typeof getStateSnapshot>;
  } {
    return {
      isAuthenticated: this.isAuthenticated(),
      hasUser: !!this.currentUser,
      tokenStore: getStateSnapshot(),
    };
  }
}
