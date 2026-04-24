/**
 * @authvital/core - JWKS Client
 *
 * JSON Web Key Set (JWKS) client with caching for JWT verification.
 * Fetches and caches public keys from a JWKS endpoint for token validation.
 *
 * Uses Web Crypto API for all cryptographic operations (no external dependencies).
 *
 * @packageDocumentation
 */

// =============================================================================
// TYPES
// =============================================================================

/**
 * JSON Web Key structure as defined by RFC 7517.
 */
export interface JWK {
  /** Key type (e.g., 'RSA', 'EC', 'oct') */
  kty: string;
  /** Key ID for matching with JWT header */
  kid?: string;
  /** Public key use (e.g., 'sig' for signing) */
  use?: string;
  /** Key operations */
  key_ops?: string[];
  /** Algorithm intended for use with this key */
  alg?: string;
  /** X.509 URL */
  x5u?: string;
  /** X.509 certificate chain */
  x5c?: string[];
  /** X.509 certificate SHA-1 thumbprint */
  x5t?: string;
  /** X.509 certificate SHA-256 thumbprint */
  'x5t#S256'?: string;
  // RSA-specific parameters
  n?: string;
  e?: string;
  d?: string;
  p?: string;
  q?: string;
  dp?: string;
  dq?: string;
  qi?: string;
  // EC-specific parameters
  crv?: string;
  x?: string;
  y?: string;
  // Symmetric key
  k?: string;
}

/**
 * JSON Web Key Set structure.
 * @alias JsonWebKeySet - use this alias to avoid conflicts with the JWKS URL constant
 */
export interface JsonWebKeySet {
  /** Array of JSON Web Keys */
  keys: JWK[];
}

/**
 * @deprecated Use JsonWebKeySet instead. Kept for backward compatibility.
 */
export type JWKS = JsonWebKeySet;

/**
 * Options for creating a JWKS client.
 */
export interface JWKSClientOptions {
  /** URI of the JWKS endpoint */
  jwksUri: string;
  /** Cache expiry time in milliseconds (default: 1 hour) */
  cacheExpiryMs?: number;
  /** Request timeout in milliseconds (default: 5000) */
  timeoutMs?: number;
}

// =============================================================================
// ERROR CLASSES
// =============================================================================

/**
 * Error thrown when a JWKS operation fails.
 */
export class JWKSError extends Error {
  constructor(message: string, public cause?: Error) {
    super(message);
    this.name = 'JWKSError';
  }
}

/**
 * Error thrown when a signing key is not found.
 */
export class SigningKeyNotFoundError extends JWKSError {
  constructor(kid: string) {
    super(`Unable to find a signing key that matches '${kid}'`);
    this.name = 'SigningKeyNotFoundError';
  }
}

// =============================================================================
// JWKS CLIENT
// =============================================================================

/**
 * JWKS client with intelligent caching.
 *
 * Fetches and caches public keys from a JWKS endpoint, converting them
 * to Web Crypto API CryptoKey objects for JWT verification.
 *
 * @example
 * ```typescript
 * const jwksClient = new JWKSClient({
 *   jwksUri: 'https://auth.example.com/.well-known/jwks.json',
 *   cacheExpiryMs: 3600_000, // 1 hour
 * });
 *
 * const signingKey = await jwksClient.getSigningKey('key-id-123');
 * ```
 */
export class JWKSClient {
  private jwksUri: string;
  private cache: Map<string, CryptoKey> = new Map();
  private cacheExpiry: number;
  private lastFetch: number = 0;
  private timeoutMs: number;

  /**
   * Create a new JWKS client.
   *
   * @param options - Client configuration options
   */
  constructor(options: JWKSClientOptions) {
    if (!options.jwksUri) {
      throw new JWKSError('jwksUri is required');
    }

    this.jwksUri = options.jwksUri;
    this.cacheExpiry = options.cacheExpiryMs ?? 3600_000; // Default: 1 hour
    this.timeoutMs = options.timeoutMs ?? 5000;
  }

  /**
   * Get a signing key by its Key ID (kid).
   *
   * Checks the cache first, fetches from JWKS endpoint if not cached
   * or if the cache has expired.
   *
   * @param kid - The Key ID from the JWT header
   * @returns The CryptoKey for verifying signatures
   * @throws SigningKeyNotFoundError if the key is not found
   * @throws JWKSError if fetching or parsing fails
   */
  async getSigningKey(kid: string): Promise<CryptoKey> {
    // Check if we have a valid cached key
    const cachedKey = this.cache.get(kid);
    if (cachedKey && !this.isCacheExpired()) {
      return cachedKey;
    }

    // Fetch fresh JWKS if cache is expired or key not found
    await this.fetchJWKS();

    // Try to get the key again after fetch
    const key = this.cache.get(kid);
    if (!key) {
      throw new SigningKeyNotFoundError(kid);
    }

    return key;
  }

  /**
   * Clear the key cache.
   *
   * Forces the next getSigningKey() call to fetch fresh keys from the JWKS endpoint.
   */
  clearCache(): void {
    this.cache.clear();
    this.lastFetch = 0;
  }

  /**
   * Check if the cache has expired.
   *
   * @returns true if cache is expired or has never been fetched
   */
  private isCacheExpired(): boolean {
    if (this.lastFetch === 0) return true;
    return Date.now() - this.lastFetch > this.cacheExpiry;
  }

  /**
   * Fetch JWKS from the configured endpoint and update the cache.
   *
   * @throws JWKSError if the fetch fails or the response is invalid
   */
  private async fetchJWKS(): Promise<void> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

      const response = await fetch(this.jwksUri, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new JWKSError(
          `Failed to fetch JWKS: HTTP ${response.status} ${response.statusText}`
        );
      }

      const jwks: JsonWebKeySet = await response.json();

      if (!jwks.keys || !Array.isArray(jwks.keys)) {
        throw new JWKSError('Invalid JWKS format: missing or invalid "keys" array');
      }

      // Convert each JWK to CryptoKey and update cache
      const newCache = new Map<string, CryptoKey>();

      for (const jwk of jwks.keys) {
        if (!jwk.kid) continue; // Skip keys without a kid

        try {
          const cryptoKey = await this.importJWK(jwk);
          newCache.set(jwk.kid, cryptoKey);
        } catch (error) {
          // Log but don't fail - some keys might not be importable
          console.warn(`[JWKS] Failed to import key ${jwk.kid}:`, error);
        }
      }

      // Replace the cache atomically
      this.cache = newCache;
      this.lastFetch = Date.now();
    } catch (error) {
      if (error instanceof JWKSError) {
        throw error;
      }

      if (error instanceof Error && error.name === 'AbortError') {
        throw new JWKSError(`JWKS fetch timed out after ${this.timeoutMs}ms`);
      }

      throw new JWKSError(
        `Failed to fetch JWKS: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Import a JWK into the Web Crypto API as a CryptoKey.
   *
   * Supports RSA and EC keys for JWT signature verification.
   *
   * @param jwk - The JSON Web Key to import
   * @returns The imported CryptoKey
   * @throws Error if the key type is not supported
   */
  private async importJWK(jwk: JWK): Promise<CryptoKey> {
    // Determine the algorithm based on the JWK
    const algorithm = this.getImportAlgorithm(jwk);

    // Import the key
    return await crypto.subtle.importKey(
      'jwk',
      jwk as JsonWebKey,
      algorithm,
      true, // extractable
      ['verify'] // key usages
    );
  }

  /**
   * Determine the import algorithm parameters for a JWK.
   *
   * @param jwk - The JSON Web Key
   * @returns Algorithm parameters for crypto.subtle.importKey
   * @throws Error if the key type or algorithm is not supported
   */
  private getImportAlgorithm(jwk: JWK): AlgorithmIdentifier | RsaHashedImportParams | EcKeyImportParams {
    // RSA keys
    if (jwk.kty === 'RSA') {
      // Determine hash algorithm from the 'alg' property
      const alg = jwk.alg ?? 'RS256';

      if (alg.startsWith('RS') || alg.startsWith('PS')) {
        const hashAlgorithm = this.getHashAlgorithm(alg);
        return {
          name: alg.startsWith('PS') ? 'RSA-PSS' : 'RSASSA-PKCS1-v1_5',
          hash: { name: hashAlgorithm },
        };
      }
    }

    // EC keys
    if (jwk.kty === 'EC') {
      const namedCurve = this.getECCurve(jwk.crv);
      return {
        name: 'ECDSA',
        namedCurve,
      };
    }

    // Octet sequence (symmetric) keys - HMAC
    if (jwk.kty === 'oct') {
      const alg = jwk.alg ?? 'HS256';
      const hashAlgorithm = this.getHashAlgorithm(alg);
      return {
        name: 'HMAC',
        hash: { name: hashAlgorithm },
      };
    }

    throw new Error(`Unsupported key type: ${jwk.kty}`);
  }

  /**
   * Get the hash algorithm name from a JWS algorithm identifier.
   *
   * @param alg - The JWS algorithm (e.g., 'RS256', 'ES256')
   * @returns The hash algorithm name for Web Crypto API
   */
  private getHashAlgorithm(alg: string): string {
    if (alg.includes('256') || alg.includes('HS256')) return 'SHA-256';
    if (alg.includes('384') || alg.includes('HS384')) return 'SHA-384';
    if (alg.includes('512') || alg.includes('HS512')) return 'SHA-512';
    return 'SHA-256'; // Default
  }

  /**
   * Get the named curve for EC keys.
   *
   * @param crv - The curve name from the JWK
   * @returns The named curve for Web Crypto API
   */
  private getECCurve(crv?: string): string {
    switch (crv) {
      case 'P-256':
        return 'P-256';
      case 'P-384':
        return 'P-384';
      case 'P-521':
        return 'P-521';
      default:
        return 'P-256'; // Default
    }
  }
}
