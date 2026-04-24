/**
 * @authvital/server - Server-Side API Client
 *
 * HTTP client for making authenticated API calls from server environments.
 * Handles token refresh on 401 responses and session cookie updates.
 */

import type { TokenResponse, User } from '@authvital/shared';
import type { SessionTokens } from '../session/index.js';
import type { M2MTokenResponse } from './types.js';

// =============================================================================
// INTROSPECTION TYPES
// =============================================================================

/**
 * OAuth 2.0 Token Introspection Response (RFC 7662)
 *
 * Contains the metadata and validity information for a token.
 *
 * @see https://tools.ietf.org/html/rfc7662
 */
export interface IntrospectionResponse {
  /** Whether the token is currently active */
  active: boolean;
  /** Scope of the token (space-delimited string) */
  scope?: string;
  /** Client ID that requested the token */
  client_id?: string;
  /** Resource owner username */
  username?: string;
  /** Token type (e.g., "Bearer", "Refresh") */
  token_type?: string;
  /** Token expiration timestamp (Unix epoch) */
  exp?: number;
  /** Token issuance timestamp (Unix epoch) */
  iat?: number;
  /** Token not-before timestamp (Unix epoch) */
  nbf?: number;
  /** Subject (user ID) of the token */
  sub?: string;
  /** Audience(s) for the token */
  aud?: string | string[];
  /** Issuer of the token */
  iss?: string;
  /** JWT ID (unique identifier for the token) */
  jti?: string;
}

// =============================================================================
// TYPES
// =============================================================================

/**
 * Server client configuration.
 */
export interface ServerClientConfig {
  /** AuthVital API host */
  authVitalHost: string;
  /** OAuth client ID */
  clientId: string;
  /** OAuth client secret (for token refresh) */
  clientSecret: string;
  /** Request timeout in ms */
  timeout?: number;
}

/**
 * Request options for API calls.
 */
export interface RequestOptions {
  /** HTTP method */
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Request headers */
  headers?: Record<string, string>;
  /** Request body */
  body?: unknown;
  /** Query parameters */
  query?: Record<string, string | number | boolean | undefined>;
}

/**
 * API response wrapper.
 */
export interface ApiResponse<T> {
  /** Response data */
  data?: T;
  /** Error information */
  error?: ApiError;
  /** HTTP status code */
  status: number;
  /** Whether the request succeeded */
  ok: boolean;
}

/**
 * API error structure.
 */
export interface ApiError {
  /** Error code */
  code: string;
  /** Error message */
  message: string;
  /** Additional error details */
  details?: Record<string, unknown>;
}

/**
 * Token refresh handler callback.
 * Called when tokens are refreshed so the session can be updated.
 */
export type TokenRefreshHandler = (tokens: TokenResponse) => void | Promise<void>;

// =============================================================================
// SERVER CLIENT CLASS
// =============================================================================

/**
 * Server-side API client for AuthVital.
 *
 * Features:
 * - Automatic Authorization header attachment
 * - Token refresh on 401 responses
 * - Session cookie update notifications
 * - Type-safe API responses
 * - Machine-to-Machine (M2M) token management via Client Credentials Grant
 */
export class ServerClient {
  private readonly config: ServerClientConfig;
  private tokens: SessionTokens | null = null;
  private refreshHandler: TokenRefreshHandler | null = null;
  private refreshing = false;
  private refreshPromise: Promise<TokenResponse | null> | null = null;

  // M2M token management
  private m2mToken: { accessToken: string; expiresAt: number; scope: string } | null = null;
  private m2mTokenPromise: Promise<string | null> | null = null;

  /**
   * Create a new server client.
   *
   * @param config - Client configuration
   * @param tokens - Optional initial session tokens
   */
  constructor(config: ServerClientConfig, tokens?: SessionTokens) {
    this.config = {
      timeout: 30000,
      ...config,
    };
    this.tokens = tokens ?? null;
  }

  /**
   * Set the current session tokens.
   *
   * @param tokens - Session tokens
   */
  setTokens(tokens: SessionTokens | null): void {
    this.tokens = tokens;
  }

  /**
   * Get the current session tokens.
   *
   * @returns Current tokens or null
   */
  getTokens(): SessionTokens | null {
    return this.tokens;
  }

  /**
   * Register a token refresh handler.
   *
   * @param handler - Callback invoked when tokens are refreshed
   */
  onTokenRefresh(handler: TokenRefreshHandler): void {
    this.refreshHandler = handler;
  }

  /**
   * Check if the client has valid tokens.
   *
   * @returns true if tokens are available and not expired
   */
  isAuthenticated(): boolean {
    if (!this.tokens) return false;

    const now = Math.floor(Date.now() / 1000);
    const bufferSeconds = 60;
    return this.tokens.expiresAt > now + bufferSeconds;
  }

  // ===========================================================================
  // HTTP METHODS
  // ===========================================================================

  /**
   * Make a GET request.
   *
   * @param path - API path (without host)
   * @param options - Request options
   * @returns API response
   */
  async get<T>(path: string, options: Omit<RequestOptions, 'method' | 'body'> = {}): Promise<ApiResponse<T>> {
    return this.request<T>(path, { ...options, method: 'GET' });
  }

  /**
   * Make a POST request.
   *
   * @param path - API path (without host)
   * @param body - Request body
   * @param options - Request options
   * @returns API response
   */
  async post<T>(
    path: string,
    body?: unknown,
    options: Omit<RequestOptions, 'method' | 'body'> = {}
  ): Promise<ApiResponse<T>> {
    return this.request<T>(path, { ...options, method: 'POST', body });
  }

  /**
   * Make a PUT request.
   *
   * @param path - API path (without host)
   * @param body - Request body
   * @param options - Request options
   * @returns API response
   */
  async put<T>(
    path: string,
    body?: unknown,
    options: Omit<RequestOptions, 'method' | 'body'> = {}
  ): Promise<ApiResponse<T>> {
    return this.request<T>(path, { ...options, method: 'PUT', body });
  }

  /**
   * Make a PATCH request.
   *
   * @param path - API path (without host)
   * @param body - Request body
   * @param options - Request options
   * @returns API response
   */
  async patch<T>(
    path: string,
    body?: unknown,
    options: Omit<RequestOptions, 'method' | 'body'> = {}
  ): Promise<ApiResponse<T>> {
    return this.request<T>(path, { ...options, method: 'PATCH', body });
  }

  /**
   * Make a DELETE request.
   *
   * @param path - API path (without host)
   * @param options - Request options
   * @returns API response
   */
  async delete<T>(path: string, options: Omit<RequestOptions, 'method'> = {}): Promise<ApiResponse<T>> {
    return this.request<T>(path, { ...options, method: 'DELETE' });
  }

  // ===========================================================================
  // CORE REQUEST METHOD
  // ===========================================================================

  /**
   * Make an authenticated API request.
   *
   * @param path - API path
   * @param options - Request options
   * @returns API response
   */
  async request<T>(path: string, options: RequestOptions): Promise<ApiResponse<T>> {
    const url = this.buildUrl(path, options.query);

    // Prepare headers
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      ...options.headers,
    };

    // Add authorization header if we have tokens
    if (this.tokens?.accessToken) {
      headers['Authorization'] = `Bearer ${this.tokens.accessToken}`;
    }

    try {
      const response = await fetch(url, {
        method: options.method ?? 'GET',
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: AbortSignal.timeout(this.config.timeout ?? 30000),
      });

      // Handle 401 Unauthorized - attempt token refresh
      if (response.status === 401 && this.tokens?.refreshToken && !this.refreshing) {
        const refreshed = await this.refreshTokens();

        if (refreshed) {
          // Retry the request with new token
          return this.request<T>(path, options);
        }
      }

      // Parse response
      let data: T | undefined;
      let error: ApiError | undefined;

      if (response.ok) {
        const contentType = response.headers.get('content-type');
        if (contentType?.includes('application/json')) {
          data = await response.json() as T;
        }
      } else {
        try {
          const errorData = await response.json() as { code?: string; message?: string; error?: string; details?: Record<string, unknown> };
          error = {
            code: errorData.code || `HTTP_${response.status}`,
            message: errorData.message || errorData.error || `HTTP Error ${response.status}`,
            details: errorData.details,
          };
        } catch {
          error = {
            code: `HTTP_${response.status}`,
            message: `HTTP Error ${response.status}`,
          };
        }
      }

      return {
        data,
        error,
        status: response.status,
        ok: response.ok,
      };
    } catch (err) {
      return {
        status: 0,
        ok: false,
        error: {
          code: 'NETWORK_ERROR',
          message: err instanceof Error ? err.message : 'Network request failed',
        },
      };
    }
  }

  // ===========================================================================
  // API CONVENIENCE METHODS
  // ===========================================================================

  /**
   * Get the current user.
   *
   * @returns Current user or null if not authenticated
   */
  async getCurrentUser(): Promise<User | null> {
    const response = await this.get<User>('/api/users/me');
    return response.ok ? response.data ?? null : null;
  }

  /**
   * Get current tenant memberships.
   *
   * @returns List of tenant memberships
   */
  async getTenantMemberships(): Promise<unknown[] | null> {
    const response = await this.get<{ memberships: unknown[] }>('/api/tenants/memberships');
    return response.ok ? response.data?.memberships ?? null : null;
  }

  /**
   * Check if the user has a specific permission.
   *
   * @param permission - Permission to check
   * @returns true if user has permission
   */
  async hasPermission(permission: string): Promise<boolean> {
    const response = await this.post<{ allowed: boolean }>('/api/auth/check-permission', {
      permission,
    });
    return response.ok ? response.data?.allowed ?? false : false;
  }

  // ===========================================================================
  // TOKEN REFRESH
  // ===========================================================================

  /**
   * Refresh the access token using the refresh token.
   *
   * @returns New tokens or null if refresh failed
   */
  async refreshTokens(): Promise<TokenResponse | null> {
    // Prevent concurrent refresh attempts
    if (this.refreshing && this.refreshPromise) {
      return this.refreshPromise;
    }

    if (!this.tokens?.refreshToken) {
      return null;
    }

    this.refreshing = true;
    this.refreshPromise = this.performRefresh();

    try {
      const result = await this.refreshPromise;
      return result;
    } finally {
      this.refreshing = false;
      this.refreshPromise = null;
    }
  }

  private async performRefresh(): Promise<TokenResponse | null> {
    if (!this.tokens?.refreshToken) {
      return null;
    }

    const url = `${this.config.authVitalHost}/api/oauth/token`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: this.tokens.refreshToken,
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        // Clear tokens on refresh failure
        this.tokens = null;
        return null;
      }

      const tokens = await response.json() as TokenResponse;

      // Update stored tokens
      this.tokens = {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? this.tokens?.refreshToken ?? null,
        expiresAt: Math.floor(Date.now() / 1000) + tokens.expires_in,
        sessionId: this.tokens?.sessionId ?? '',
      };

      // Notify handler
      if (this.refreshHandler) {
        await this.refreshHandler(tokens);
      }

      return tokens;
    } catch {
      return null;
    }
  }

  // ===========================================================================
  // M2M TOKEN MANAGEMENT (Client Credentials Grant)
  // ===========================================================================

  /**
   * Get a client credentials token for Machine-to-Machine (M2M) authentication.
   *
   * Implements the OAuth 2.0 Client Credentials Grant flow to obtain an access
   * token for server-to-server API calls. The token is cached and automatically
   * refreshed when nearing expiration.
   *
   * @param scope - Optional scope to request (space-delimited string)
   * @returns The access token or null if the request failed
   *
   * @example
   * ```typescript
   * const token = await client.getClientCredentialsToken('users:read users:write');
   * if (token) {
   *   // Use token for API calls
   *   const response = await fetch('/api/users', {
   *     headers: { 'Authorization': `Bearer ${token}` }
   *   });
   * }
   * ```
   */
  async getClientCredentialsToken(scope?: string): Promise<string | null> {
    // Check if we have a valid cached token for the requested scope
    if (this.isM2MTokenValid()) {
      const token = this.m2mToken!;
      if (!scope || token.scope === scope) {
        return token.accessToken;
      }
    }

    // Prevent concurrent token requests
    if (this.m2mTokenPromise) {
      return this.m2mTokenPromise;
    }

    this.m2mTokenPromise = this.fetchClientCredentialsToken(scope);

    try {
      const token = await this.m2mTokenPromise;
      return token;
    } finally {
      this.m2mTokenPromise = null;
    }
  }

  /**
   * Clear the cached M2M token.
   *
   * Use this to force a fresh token request on the next getClientCredentialsToken() call,
   * or when switching scopes.
   */
  clearM2MToken(): void {
    this.m2mToken = null;
    this.m2mTokenPromise = null;
  }

  /**
   * Check if the current M2M token is valid (not expired).
   *
   * @returns true if we have a valid, non-expired M2M token
   */
  private isM2MTokenValid(): boolean {
    if (!this.m2mToken) return false;

    // Add 60-second buffer before expiration
    const now = Math.floor(Date.now() / 1000);
    return this.m2mToken.expiresAt > now + 60;
  }

  /**
   * Fetch a new M2M token from the token endpoint.
   *
   * @param scope - Optional scope to request
   * @returns The access token or null if the request failed
   */
  private async fetchClientCredentialsToken(scope?: string): Promise<string | null> {
    const url = `${this.config.authVitalHost}/oauth/token`;

    const params = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
    });

    if (scope) {
      params.set('scope', scope);
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
        body: params,
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: `HTTP ${response.status}` }));
        console.error('[ServerClient] Failed to get M2M token:', error);
        return null;
      }

      const data = await response.json() as M2MTokenResponse;

      // Store the token with expiration
      this.m2mToken = {
        accessToken: data.access_token,
        expiresAt: Math.floor(Date.now() / 1000) + data.expires_in,
        scope: data.scope || scope || '',
      };

      return data.access_token;
    } catch (error) {
      console.error('[ServerClient] Error fetching M2M token:', error);
      return null;
    }
  }

  // ===========================================================================
  // TOKEN INTROSPECTION & REVOCATION
  // ===========================================================================

  /**
   * Introspect a token to check its validity and get metadata
   *
   * Calls the OAuth introspection endpoint (RFC 7662) to check if a token
   * is active and retrieve its associated metadata. Uses client credentials
   * for authentication at the introspection endpoint.
   *
   * @param token - The token to introspect (defaults to current access token)
   * @returns Promise resolving to the introspection response
   *
   * @example
   * ```typescript
   * // Introspect current token
   * const result = await client.introspectToken();
   * console.log('Token active:', result.active);
   *
   * // Introspect a token from a request
   * const result = await client.introspectToken(accessTokenFromHeader);
   * if (!result.active) {
   *   return res.status(401).json({ error: 'Invalid token' });
   * }
   * ```
   */
  async introspectToken(token?: string): Promise<IntrospectionResponse> {
    const tokenToIntrospect = token || this.tokens?.accessToken;

    if (!tokenToIntrospect) {
      throw new Error('No token provided and no current access token available');
    }

    const response = await this.request<IntrospectionResponse>('/oauth/introspect', {
      method: 'POST',
      body: { token: tokenToIntrospect },
    });

    if (!response.ok) {
      throw new Error(response.error?.message || 'Token introspection failed');
    }

    return response.data ?? { active: false };
  }

  /**
   * Revoke a token
   *
   * Calls the OAuth revocation endpoint (RFC 7009) to revoke a token.
   * This invalidates the token at the authorization server. Uses client
   * credentials for authentication at the revocation endpoint.
   *
   * @param token - The token to revoke (defaults to current access token)
   * @param tokenTypeHint - Hint for the token type ('access_token' or 'refresh_token')
   * @returns Promise resolving to true if revocation was successful
   *
   * @example
   * ```typescript
   * // Revoke current access token on logout
   * await client.revokeToken();
   *
   * // Revoke a specific refresh token
   * await client.revokeToken(refreshToken, 'refresh_token');
   * ```
   */
  async revokeToken(
    token?: string,
    tokenTypeHint?: 'access_token' | 'refresh_token'
  ): Promise<boolean> {
    const tokenToRevoke = token || this.tokens?.accessToken;

    if (!tokenToRevoke) {
      throw new Error('No token provided and no current access token available');
    }

    const body: Record<string, string> = { token: tokenToRevoke };
    if (tokenTypeHint) {
      body.token_type_hint = tokenTypeHint;
    }

    const response = await this.request<{ success: boolean }>('/oauth/revoke', {
      method: 'POST',
      body,
    });

    // If we revoked the current access token, clear local state
    if (!token || token === this.tokens?.accessToken) {
      this.tokens = null;
    }

    return response.ok && (response.data?.success ?? false);
  }

  // ===========================================================================
  // UTILITY METHODS
  // ===========================================================================

  /**
   * Build a full URL with query parameters.
   *
   * @param path - API path
   * @param query - Query parameters
   * @returns Full URL
   */
  private buildUrl(
    path: string,
    query?: Record<string, string | number | boolean | undefined>
  ): string {
    // Ensure path starts with /
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const url = new URL(normalizedPath, this.config.authVitalHost);

    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    return url.toString();
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create a new server client.
 *
 * @param config - Client configuration
 * @param tokens - Optional initial session tokens
 * @returns Configured server client
 */
export function createServerClient(
  config: ServerClientConfig,
  tokens?: SessionTokens
): ServerClient {
  return new ServerClient(config, tokens);
}
