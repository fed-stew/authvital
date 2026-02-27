/**
 * @authvital/sdk - Base Client
 *
 * Shared HTTP utilities, token management, and JWT validation for the AuthVital SDK.
 * All namespaces extend from this base to access authenticated API calls.
 */

import { JwtValidator, type JwtPayload } from './jwt-validator';
import type { TokenResponse } from './types';

// =============================================================================
// CONFIGURATION
// =============================================================================

export interface AuthVitalConfig {
  /** AuthVital IDP URL (e.g., "https://auth.example.com") */
  authVitalHost: string;
  /** OAuth client_id for your application */
  clientId: string;
  /** OAuth client_secret for your application */
  clientSecret: string;
  /** JWKS cache TTL in seconds (default: 3600 = 1 hour) */
  jwksCacheTtl?: number;
  /** Expected audience for JWT validation (defaults to clientId) */
  audience?: string;
}

// =============================================================================
// RESULT TYPES
// =============================================================================

export interface GetCurrentUserResult {
  /** Whether the request is authenticated with a valid token */
  authenticated: boolean;
  /** The decoded JWT payload (user data) if authenticated */
  user: JwtPayload | null;
  /** Error message if authentication failed */
  error?: string;
}

export interface ValidatedClaims {
  /** User ID (sub claim) */
  sub: string;
  /** Tenant ID (tenant_id claim) - only present if token is tenant-scoped */
  tenantId: string;
  /** Tenant subdomain/slug (tenant_subdomain claim) */
  tenantSubdomain?: string;
  /** User's email (if email scope was requested) */
  email?: string;
  /** User's tenant roles (tenant_roles claim) */
  tenant_roles?: string[];
  /** Full JWT payload */
  payload: JwtPayload;
}

// =============================================================================
// REQUEST TYPE (works with Express, Fetch API, Next.js, etc.)
// =============================================================================

export type RequestLike =
  | Request // Fetch API Request
  | { headers: { authorization?: string; Authorization?: string } } // Express-like
  | { headers: Headers } // Fetch API Headers object
  | { headers: { get: (name: string) => string | null } }; // Headers with get method

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Extract Authorization header from various request types
 */
export function extractAuthorizationHeader(request: RequestLike): string | null {
  const headers = request.headers;

  // Fetch API Headers object (has .get method)
  if (headers && typeof (headers as Headers).get === 'function') {
    return (headers as Headers).get('authorization') || (headers as Headers).get('Authorization');
  }

  // Plain object headers (Express-like)
  if (headers && typeof headers === 'object') {
    return (
      (headers as { authorization?: string; Authorization?: string }).authorization ||
      (headers as { authorization?: string; Authorization?: string }).Authorization ||
      null
    );
  }

  return null;
}

/**
 * Append client_id query parameter to a URI
 * Handles URIs that already have query params
 */
export function appendClientIdToUri(uri: string | null, clientId: string): string | null {
  if (!uri) return null;
  const separator = uri.includes('?') ? '&' : '?';
  return `${uri}${separator}client_id=${encodeURIComponent(clientId)}`;
}

// =============================================================================
// BASE CLIENT CLASS
// =============================================================================

/**
 * Base client with shared HTTP utilities and token management.
 *
 * Provides:
 * - M2M token management (client_credentials flow)
 * - Authenticated requests (forwarding user JWTs)
 * - JWT validation and claims extraction
 */
export class BaseClient {
  readonly config: AuthVitalConfig;
  readonly jwtValidator: JwtValidator;
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;

  constructor(config: AuthVitalConfig) {
    // Validate required config
    if (!config.authVitalHost) {
      throw new Error(
        'authVitalHost is required. Pass it in config or set AV_HOST environment variable.',
      );
    }

    this.config = {
      ...config,
      authVitalHost: config.authVitalHost.replace(/\/$/, ''), // Remove trailing slash
    };

    // Initialize JWT validator with JWKS caching
    this.jwtValidator = new JwtValidator({
      authVitalHost: this.config.authVitalHost,
      cacheTtl: config.jwksCacheTtl,
      audience: config.audience ?? config.clientId,
    });
  }

  // ===========================================================================
  // GET CURRENT USER (JWT Validation)
  // ===========================================================================

  /**
   * Validate JWT from an incoming request and return the decoded user.
   *
   * - Extracts Authorization header from the request
   * - Validates JWT signature using cached JWKS (public endpoint, no auth needed)
   * - Returns decoded JWT payload
   * - Does NOT call the IDP
   *
   * @example
   * ```ts
   * // Express
   * app.get('/api/auth/me', async (req, res) => {
   *   const { authenticated, user, error } = await authvital.getCurrentUser(req);
   *   if (!authenticated) return res.status(401).json({ error });
   *   res.json(user);
   * });
   * ```
   */
  async getCurrentUser(request: RequestLike): Promise<GetCurrentUserResult> {
    const authHeader = extractAuthorizationHeader(request);

    if (!authHeader) {
      return {
        authenticated: false,
        user: null,
        error: 'Missing Authorization header',
      };
    }

    if (!authHeader.startsWith('Bearer ')) {
      return {
        authenticated: false,
        user: null,
        error: 'Invalid Authorization header format (expected Bearer token)',
      };
    }

    const token = authHeader.slice(7);

    if (!token) {
      return {
        authenticated: false,
        user: null,
        error: 'Empty token',
      };
    }

    const result = await this.jwtValidator.validateToken(token);

    if (!result.valid) {
      return {
        authenticated: false,
        user: null,
        error: result.error,
      };
    }

    return {
      authenticated: true,
      user: result.payload!,
    };
  }

  // ===========================================================================
  // VALIDATE REQUEST & EXTRACT CLAIMS
  // ===========================================================================

  /**
   * Validate the JWT from an incoming request and extract key claims.
   *
   * This is the recommended way to get user/tenant context for API calls.
   * Throws an error if the token is invalid or missing required claims.
   *
   * @param request - The incoming HTTP request (Express, Next.js, Fetch API, etc.)
   * @returns Validated claims including sub (userId) and tenantId
   * @throws Error if token is invalid or missing tenant_id claim
   *
   * @example
   * ```ts
   * // Express
   * app.get('/api/members', async (req, res) => {
   *   const claims = await authvital.validateRequest(req);
   *   const members = await authvital.memberships.listForApplication(claims);
   *   res.json(members);
   * });
   * ```
   */
  async validateRequest(request: RequestLike): Promise<ValidatedClaims> {
    const { authenticated, user, error } = await this.getCurrentUser(request);

    if (!authenticated || !user) {
      throw new Error(error || 'Unauthorized');
    }

    if (!user.sub) {
      throw new Error('Invalid token: missing sub claim');
    }

    // tenant_id is required for tenant-scoped operations
    const tenantId = user.tenant_id as string | undefined;
    if (!tenantId) {
      throw new Error(
        'Invalid token: missing tenant_id claim. Ensure the token was issued for a specific tenant.',
      );
    }

    return {
      sub: user.sub,
      tenantId,
      tenantSubdomain: user.tenant_subdomain as string | undefined,
      email: user.email as string | undefined,
      payload: user,
    };
  }

  // ===========================================================================
  // INTERNAL: Token Management for M2M calls
  // ===========================================================================

  /**
   * Get M2M access token (client_credentials flow)
   *
   * Returns cached token if still valid, otherwise fetches a new one.
   */
  async getAccessToken(): Promise<string> {
    // Return cached token if still valid (with 60s buffer)
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 60000) {
      return this.accessToken;
    }

    const response = await fetch(`${this.config.authVitalHost}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        scope: 'system:admin',
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(
        (error as { message?: string }).message || `Token exchange failed: ${response.status}`,
      );
    }

    const data: TokenResponse = await response.json();
    this.accessToken = data.access_token;
    this.tokenExpiresAt = Date.now() + data.expires_in * 1000;

    return this.accessToken;
  }

  /**
   * Make an M2M authenticated request
   *
   * Uses client_credentials token for machine-to-machine calls.
   */
  async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown,
    isRetry = false,
  ): Promise<T> {
    const token = await this.getAccessToken();

    const response = await fetch(`${this.config.authVitalHost}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    // If we get a 401 and haven't retried yet, clear the cached token and retry once
    // This handles cases like server key rotation where the cached token is no longer valid
    if (response.status === 401 && !isRetry) {
      this.accessToken = null;
      this.tokenExpiresAt = 0;
      return this.request<T>(method, path, body, true);
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(
        (error as { message?: string }).message || `Request failed: ${response.status}`,
      );
    }

    return response.json();
  }

  /**
   * Make an authenticated request using the JWT from the original request
   *
   * This version forwards the user's JWT token instead of using the
   * M2M (client_credentials) token. Used for endpoints that require
   * user context and validate tenant permissions.
   *
   * @param originalRequest - The incoming request with JWT
   * @param method - HTTP method
   * @param path - API path
   * @param body - Request body (for POST/PUT)
   * @returns Parsed response
   * @throws Error if request fails or JWT is required
   */
  async authenticatedRequest<T>(
    originalRequest: RequestLike,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const authHeader = extractAuthorizationHeader(originalRequest);

    if (!authHeader) {
      throw new Error('No Authorization header found in request');
    }

    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
    };

    if (body && method !== 'GET') {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(`${this.config.authVitalHost}${path}`, options);

    if (!response.ok) {
      const error = await response.text();
      try {
        const json = JSON.parse(error);
        throw new Error(
          (json as { message?: string }).message || `Request failed: ${response.status} ${error}`,
        );
      } catch {
        throw new Error(`Request failed: ${response.status} ${error}`);
      }
    }

    return response.json();
  }
}
