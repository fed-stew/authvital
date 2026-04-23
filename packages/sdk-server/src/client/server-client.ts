/**
 * @authvital/server - Server-Side API Client
 *
 * HTTP client for making authenticated API calls from server environments.
 * Handles token refresh on 401 responses and session cookie updates.
 */

import type { TokenResponse, User } from '@authvital/shared';
import type { SessionTokens } from '../session/index.js';

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
 */
export class ServerClient {
  private readonly config: ServerClientConfig;
  private tokens: SessionTokens | null = null;
  private refreshHandler: TokenRefreshHandler | null = null;
  private refreshing = false;
  private refreshPromise: Promise<TokenResponse | null> | null = null;

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
