/**
 * @authvital/core - JWT Validation Utilities
 *
 * Environment-agnostic JWT validation utilities using Web Crypto API.
 * No Node.js-specific APIs - works in browsers, edge runtimes, and Node.js.
 *
 * @packageDocumentation
 */

import type {
  JwtValidatorConfig,
  ValidateTokenResult,
  GetCurrentUserResult,
  JwtHeader,
  JwtPayload,
  Jwks,
  JwksKey,
  EnhancedJwtPayload,
  UserInfo,
} from '../types/index.js';
import { buildJwksUrl } from '../oauth/urls.js';

// =============================================================================
// JWT DECODING
// =============================================================================

/**
 * Decode a JWT without verification.
 *
 * This extracts the header and payload for inspection.
 * It does NOT verify the signature - use for display purposes only.
 *
 * @param token - The JWT string to decode
 * @returns An object with header and payload, or null if invalid format
 *
 * @example
 * ```ts
 * const decoded = decodeJwt(token);
 * if (decoded) {
 *   console.log('Algorithm:', decoded.header.alg);
 *   console.log('Subject:', decoded.payload.sub);
 * }
 * ```
 */
export function decodeJwt(token: string): { header: JwtHeader; payload: JwtPayload } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const header = JSON.parse(base64UrlDecode(parts[0])) as JwtHeader;
    const payload = JSON.parse(base64UrlDecode(parts[1])) as JwtPayload;

    return { header, payload };
  } catch {
    return null;
  }
}

/**
 * Decode only the JWT payload.
 *
 * @param token - The JWT string
 * @returns The payload object or null if invalid
 */
export function decodeJwtPayload<T = JwtPayload>(token: string): T | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    return JSON.parse(base64UrlDecode(parts[1])) as T;
  } catch {
    return null;
  }
}

/**
 * Decode only the JWT header.
 *
 * @param token - The JWT string
 * @returns The header object or null if invalid
 */
export function decodeJwtHeader(token: string): JwtHeader | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    return JSON.parse(base64UrlDecode(parts[0])) as JwtHeader;
  } catch {
    return null;
  }
}

// =============================================================================
// BASE64URL HELPERS
// =============================================================================

/**
 * Base64url-decode a string to a regular string.
 */
function base64UrlDecode(str: string): string {
  // Add padding if needed
  const padding = 4 - (str.length % 4);
  const padded = padding !== 4 ? str + '='.repeat(padding) : str;
  
  // Convert base64url to base64
  const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');
  
  // Decode
  return atob(base64);
}

/**
 * Base64url-decode a string to a Uint8Array.
 */
function base64UrlDecodeToBuffer(str: string): Uint8Array {
  const padding = 4 - (str.length % 4);
  const padded = padding !== 4 ? str + '='.repeat(padding) : str;
  const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// =============================================================================
// JWT VALIDATION CLASS
// =============================================================================

/**
 * JWT Validator for AuthVital tokens.
 *
 * Validates JWTs using JWKS (JSON Web Key Set) with caching support.
 * Works with Web Crypto API for cross-platform compatibility.
 *
 * @example
 * ```ts
 * const validator = new JwtValidator({
 *   authVitalHost: 'https://auth.example.com',
 *   audience: 'my-client-id',
 * });
 *
 * const result = await validator.validateToken(token);
 * if (result.valid) {
 *   console.log('User:', result.payload.sub);
 * }
 * ```
 */
export class JwtValidator {
  private config: Required<Omit<JwtValidatorConfig, 'audience'>> & { audience?: string };
  private jwksCache: Jwks | null = null;
  private jwksCacheTime = 0;
  private fetchPromise: Promise<Jwks> | null = null;

  constructor(config: JwtValidatorConfig) {
    if (!config.authVitalHost) {
      throw new Error('authVitalHost is required');
    }

    this.config = {
      authVitalHost: config.authVitalHost.replace(/\/$/, ''),
      cacheTtl: config.cacheTtl ?? 3600,
      audience: config.audience,
      issuer: config.issuer ?? config.authVitalHost.replace(/\/$/, ''),
    };
  }

  /**
   * Get the JWKS URL for this IDP.
   */
  getJwksUrl(): string {
    return buildJwksUrl(this.config.authVitalHost);
  }

  /**
   * Fetch public keys from the JWKS endpoint.
   * Results are cached according to cacheTtl.
   */
  async getPublicKeys(forceRefresh = false): Promise<Jwks> {
    const now = Date.now();
    const cacheExpired = now - this.jwksCacheTime > this.config.cacheTtl * 1000;

    // Return cached keys if valid
    if (!forceRefresh && this.jwksCache && !cacheExpired) {
      return this.jwksCache;
    }

    // Deduplicate concurrent fetches
    if (this.fetchPromise) {
      return this.fetchPromise;
    }

    this.fetchPromise = this.fetchJwks();
    
    try {
      const jwks = await this.fetchPromise;
      this.jwksCache = jwks;
      this.jwksCacheTime = now;
      return jwks;
    } finally {
      this.fetchPromise = null;
    }
  }

  /**
   * Fetch JWKS from the IDP.
   */
  private async fetchJwks(): Promise<Jwks> {
    const response = await fetch(this.getJwksUrl());
    
    if (!response.ok) {
      throw new Error(`Failed to fetch JWKS: ${response.status} ${response.statusText}`);
    }

    const jwks = await response.json() as Jwks;
    
    if (!jwks.keys || !Array.isArray(jwks.keys)) {
      throw new Error('Invalid JWKS response: missing keys array');
    }

    return jwks;
  }

  /**
   * Find a key by its ID (kid).
   */
  private async findKey(kid: string, allowRefresh = true): Promise<JwksKey | null> {
    const jwks = await this.getPublicKeys();
    let key = jwks.keys.find(k => k.kid === kid);

    // Key not found - might be rotated, try refreshing
    if (!key && allowRefresh) {
      const refreshedJwks = await this.getPublicKeys(true);
      key = refreshedJwks.keys.find(k => k.kid === kid);
    }

    return key || null;
  }

  /**
   * Validate a JWT token.
   *
   * @param token - The JWT to validate
   * @returns Validation result with payload if valid
   */
  async validateToken(token: string): Promise<ValidateTokenResult> {
    try {
      // Decode token to get header and payload
      const decoded = decodeJwt(token);
      if (!decoded) {
        return { valid: false, error: 'Invalid token format' };
      }

      const { header, payload } = decoded;

      // Check algorithm
      if (header.alg !== 'RS256') {
        return { valid: false, error: `Unsupported algorithm: ${header.alg}` };
      }

      // Check kid
      if (!header.kid) {
        return { valid: false, error: 'Token missing kid header' };
      }

      // Find the signing key
      const key = await this.findKey(header.kid);
      if (!key) {
        return { valid: false, error: `Unknown signing key: ${header.kid}` };
      }

      // Verify signature using Web Crypto API
      const isValid = await this.verifySignature(token, key);
      if (!isValid) {
        return { valid: false, error: 'Invalid signature' };
      }

      // Check expiration
      if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
        return { valid: false, error: 'Token expired' };
      }

      // Check not before
      if (payload.nbf && payload.nbf > Math.floor(Date.now() / 1000)) {
        return { valid: false, error: 'Token not yet valid' };
      }

      // Check issuer
      if (payload.iss !== this.config.issuer) {
        return { valid: false, error: `Invalid issuer: expected ${this.config.issuer}, got ${payload.iss}` };
      }

      // Check audience (if configured)
      if (this.config.audience) {
        const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
        if (!audiences.includes(this.config.audience)) {
          return { valid: false, error: `Invalid audience: ${payload.aud}` };
        }
      }

      return { valid: true, payload };
    } catch (error) {
      return { 
        valid: false, 
        error: error instanceof Error ? error.message : 'Token validation failed' 
      };
    }
  }

  /**
   * Verify RS256 signature using Web Crypto API.
   */
  private async verifySignature(token: string, jwk: JwksKey): Promise<boolean> {
    const parts = token.split('.');
    if (parts.length !== 3) return false;

    const [headerB64, payloadB64, signatureB64] = parts;
    const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
    const signatureBytes = base64UrlDecodeToBuffer(signatureB64);
    const signature = new Uint8Array(signatureBytes).buffer as ArrayBuffer;

    // Import the public key
    const cryptoKey = await crypto.subtle.importKey(
      'jwk',
      {
        kty: jwk.kty,
        n: jwk.n,
        e: jwk.e,
        alg: 'RS256',
        use: 'sig',
      },
      {
        name: 'RSASSA-PKCS1-v1_5',
        hash: 'SHA-256',
      },
      false,
      ['verify']
    );

    // Verify the signature
    return crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      cryptoKey,
      signature,
      data
    );
  }

  /**
   * Clear the JWKS cache.
   */
  clearCache(): void {
    this.jwksCache = null;
    this.jwksCacheTime = 0;
  }

  // ===========================================================================
  // PERMISSION HELPER METHODS
  // ===========================================================================

  /**
   * Check if the JWT payload has a specific tenant permission.
   *
   * @param payload - Decoded JWT payload
   * @param permission - Permission to check (e.g., 'licenses:manage')
   * @returns true if user has the permission (wildcards supported)
   */
  hasTenantPermission(payload: JwtPayload, permission: string): boolean {
    const permissions = payload.tenant_permissions as string[] | undefined;
    if (!permissions) return false;
    
    return permissions.some(p => 
      p === permission || 
      this.matchesWildcard(p, permission)
    );
  }

  /**
   * Check if the JWT payload has a specific app permission.
   *
   * @param payload - Decoded JWT payload
   * @param permission - Permission to check (e.g., 'projects:create')
   * @returns true if user has the permission (wildcards supported)
   */
  hasAppPermission(payload: JwtPayload, permission: string): boolean {
    const permissions = payload.app_permissions as string[] | undefined;
    if (!permissions) return false;
    
    return permissions.some(p => 
      p === permission || 
      this.matchesWildcard(p, permission)
    );
  }

  /**
   * Check if the JWT payload has a specific feature enabled.
   *
   * This reads from the `license.features` array in the JWT.
   *
   * @param payload - Decoded JWT payload
   * @param featureKey - Feature to check (e.g., 'sso', 'audit_logs')
   * @returns true if feature is enabled
   */
  hasFeature(payload: JwtPayload, featureKey: string): boolean {
    const license = payload.license as { features?: string[] } | undefined;
    return license?.features?.includes(featureKey) ?? false;
  }

  /**
   * Get the license type from JWT payload.
   *
   * @param payload - Decoded JWT payload
   * @returns License type slug (e.g., 'pro', 'enterprise') or null
   */
  getLicenseType(payload: JwtPayload): string | null {
    const license = payload.license as { type?: string } | undefined;
    return license?.type ?? null;
  }

  /**
   * Check if wildcard pattern matches permission.
   *
   * @example
   * - '*' matches everything
   * - 'licenses:*' matches 'licenses:manage', 'licenses:view', etc.
   * - 'licenses:manage' only matches 'licenses:manage'
   */
  private matchesWildcard(pattern: string, permission: string): boolean {
    if (pattern === '*') return true;
    if (!pattern.includes('*')) return pattern === permission;
    
    const [patternResource] = pattern.split(':');
    const [permResource] = permission.split(':');
    
    if (pattern.endsWith(':*')) {
      return patternResource === permResource;
    }
    
    return false;
  }

  /**
   * Get the current user from an Authorization header.
   *
   * @param authorizationHeader - The Authorization header value
   * @returns GetCurrentUserResult with authentication status
   */
  async getCurrentUser(authorizationHeader: string | null | undefined): Promise<GetCurrentUserResult> {
    // No header provided
    if (!authorizationHeader) {
      return {
        authenticated: false,
        user: null,
        error: 'Missing Authorization header',
      };
    }

    // Check for Bearer token
    if (!authorizationHeader.startsWith('Bearer ')) {
      return {
        authenticated: false,
        user: null,
        error: 'Invalid Authorization header format (expected Bearer token)',
      };
    }

    const token = authorizationHeader.slice(7); // Remove 'Bearer ' prefix
    
    if (!token) {
      return {
        authenticated: false,
        user: null,
        error: 'Empty token',
      };
    }

    // Validate token
    const validationResult = await this.validateToken(token);

    if (!validationResult.valid) {
      return {
        authenticated: false,
        user: null,
        error: validationResult.error,
      };
    }

    return {
      authenticated: true,
      user: validationResult.payload!,
    };
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create a JWT validator instance.
 *
 * @example
 * ```ts
 * const validator = createJwtValidator({
 *   authVitalHost: 'https://auth.example.com',
 *   audience: 'my-client-id',
 * });
 *
 * const result = await validator.validateToken(token);
 * ```
 */
export function createJwtValidator(config: JwtValidatorConfig): JwtValidator {
  return new JwtValidator(config);
}

// =============================================================================
// STANDALONE VALIDATION FUNCTIONS
// =============================================================================

/**
 * Get current user from authorization header using a validator.
 *
 * @param authorizationHeader - The Authorization header value
 * @param validator - A JwtValidator instance
 * @returns GetCurrentUserResult with authentication status
 */
export async function getCurrentUser(
  authorizationHeader: string | null | undefined,
  validator: JwtValidator,
): Promise<GetCurrentUserResult> {
  return validator.getCurrentUser(authorizationHeader);
}

/**
 * Convenience function that creates a validator and gets the current user.
 * Use this for simple cases; for better performance, create the validator once and reuse it.
 *
 * @example
 * ```ts
 * const result = await getCurrentUserFromConfig(
 *   req.headers.authorization,
 *   { authVitalHost: 'https://auth.example.com' }
 * );
 *
 * if (result.authenticated) {
 *   console.log('User:', result.user.sub);
 * }
 * ```
 */
export async function getCurrentUserFromConfig(
  authorizationHeader: string | null | undefined,
  config: JwtValidatorConfig,
): Promise<GetCurrentUserResult> {
  const validator = createJwtValidator(config);
  return getCurrentUser(authorizationHeader, validator);
}

// =============================================================================
// JWT CLAIM UTILITIES
// =============================================================================

/**
 * Check if a JWT payload has expired.
 *
 * @param payload - The decoded JWT payload
 * @returns true if the token has expired
 */
export function isTokenExpired(payload: JwtPayload): boolean {
  if (!payload.exp) return false;
  return payload.exp < Math.floor(Date.now() / 1000);
}

/**
 * Get the remaining time until a token expires.
 *
 * @param payload - The decoded JWT payload
 * @returns Time in seconds until expiration, or null if no exp claim
 */
export function getTokenExpiresIn(payload: JwtPayload): number | null {
  if (!payload.exp) return null;
  const remaining = payload.exp - Math.floor(Date.now() / 1000);
  return remaining > 0 ? remaining : 0;
}

/**
 * Check if a JWT payload contains a specific claim.
 *
 * @param payload - The decoded JWT payload
 * @param claim - The claim name to check
 * @returns true if the claim exists and is not undefined
 */
export function hasClaim(payload: JwtPayload, claim: string): boolean {
  return payload[claim] !== undefined;
}

/**
 * Get a claim value from a JWT payload with type safety.
 *
 * @param payload - The decoded JWT payload
 * @param claim - The claim name to get
 * @param defaultValue - Default value if claim doesn't exist
 * @returns The claim value or default
 */
export function getClaim<T>(payload: JwtPayload, claim: string, defaultValue?: T): T | undefined {
  const value = payload[claim];
  return value !== undefined ? (value as T) : defaultValue;
}

/**
 * Extract user info from an AuthVital JWT payload.
 *
 * @param payload - The decoded EnhancedJwtPayload
 * @returns Object with common user fields
 */
export function extractUserInfo(payload: EnhancedJwtPayload): UserInfo {
  return {
    id: payload.sub,
    email: payload.email ?? null,
    emailVerified: payload.email_verified ?? false,
    givenName: payload.given_name ?? null,
    familyName: payload.family_name ?? null,
    name: payload.name ?? null,
    picture: payload.picture ?? null,
    tenantId: payload.tenant_id ?? null,
    tenantSubdomain: payload.tenant_subdomain ?? null,
    tenantRoles: payload.tenant_roles ?? [],
    appRoles: payload.app_roles ?? [],
    licenseType: payload.license?.type ?? null,
    licenseFeatures: payload.license?.features ?? [],
  };
}

/**
 * Type guard to check if a payload is an EnhancedJwtPayload.
 */
export function isEnhancedJwtPayload(payload: JwtPayload): payload is EnhancedJwtPayload {
  return (
    typeof payload.sub === 'string' &&
    (typeof payload.aud === 'string' || Array.isArray(payload.aud)) &&
    typeof payload.iss === 'string' &&
    typeof payload.iat === 'number' &&
    typeof payload.exp === 'number'
  );
}
