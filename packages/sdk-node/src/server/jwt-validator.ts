/**
 * @authvital/sdk - JWT Validator
 * 
 * Validates JWTs issued by AuthVital using JWKS (JSON Web Key Set).
 * Automatically fetches keys from the IDP's well-known endpoint,
 * handles caching, and supports key rotation.
 * 
 * @example
 * ```ts
 * import { createJwtValidator } from '@authvital/sdk/server';
 * 
 * const validator = createJwtValidator({
 *   authVitalHost: process.env.AV_HOST,
 * });
 * 
 * // Validate a token
 * const payload = await validator.validateToken(token);
 * 
 * // Get public keys for manual verification
 * const keys = await validator.getPublicKeys();
 * ```
 */

export interface JwtValidatorConfig {
  /** AuthVital IDP URL (e.g., "https://auth.example.com") */
  authVitalHost: string;
  /** Cache TTL in seconds (default: 3600 = 1 hour) */
  cacheTtl?: number;
  /** Expected audience (client_id) - optional but recommended */
  audience?: string;
  /** Expected issuer - defaults to authVitalHost */
  issuer?: string;
}

export interface JwksKey {
  kty: string;
  kid: string;
  use?: string;
  alg?: string;
  n?: string;
  e?: string;
  x5c?: string[];
}

export interface Jwks {
  keys: JwksKey[];
}

export interface JwtHeader {
  alg: string;
  typ?: string;
  kid?: string;
}

export interface JwtPayload {
  iss?: string;
  sub?: string;
  aud?: string | string[];
  exp?: number;
  nbf?: number;
  iat?: number;
  jti?: string;
  [key: string]: unknown;
}

export interface ValidateTokenResult {
  valid: boolean;
  payload?: JwtPayload;
  error?: string;
}

/**
 * JWT Validator for AuthVital tokens
 * 
 * Fetches JWKS from the IDP, caches keys, and validates tokens.
 * Handles key rotation automatically by refetching JWKS when a key is not found.
 */
export class JwtValidator {
  private config: Required<Omit<JwtValidatorConfig, 'audience'>> & { audience?: string };
  private jwksCache: Jwks | null = null;
  private jwksCacheTime: number = 0;
  private fetchPromise: Promise<Jwks> | null = null;

  constructor(config: JwtValidatorConfig) {
    // Validate required config
    if (!config.authVitalHost) {
      throw new Error(
        'authVitalHost is required. Pass it in config or set AV_HOST environment variable.',
      );
    }

    this.config = {
      authVitalHost: config.authVitalHost.replace(/\/$/, ''), // Remove trailing slash
      cacheTtl: config.cacheTtl ?? 3600,
      audience: config.audience,
      issuer: config.issuer ?? config.authVitalHost.replace(/\/$/, ''),
    };
  }

  /**
   * Get the JWKS URL for this IDP
   */
  getJwksUrl(): string {
    return `${this.config.authVitalHost}/.well-known/jwks.json`;
  }

  /**
   * Get the OpenID Configuration URL
   */
  getOpenIdConfigUrl(): string {
    return `${this.config.authVitalHost}/.well-known/openid-configuration`;
  }

  /**
   * Fetch public keys from the JWKS endpoint
   * Results are cached according to cacheTtl
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
   * Fetch JWKS from the IDP
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
   * Find a key by its ID (kid)
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
   * Decode a JWT without verification (to get header/payload)
   */
  decodeToken(token: string): { header: JwtHeader; payload: JwtPayload } | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;

      const header = JSON.parse(this.base64UrlDecode(parts[0]));
      const payload = JSON.parse(this.base64UrlDecode(parts[1]));

      return { header, payload };
    } catch {
      return null;
    }
  }

  /**
   * Validate a JWT token
   * 
   * @param token - The JWT to validate
   * @returns Validation result with payload if valid
   */
  async validateToken(token: string): Promise<ValidateTokenResult> {
    try {
      // Decode token to get header and payload
      const decoded = this.decodeToken(token);
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
   * Verify RS256 signature using Web Crypto API
   */
  private async verifySignature(token: string, jwk: JwksKey): Promise<boolean> {
    const parts = token.split('.');
    if (parts.length !== 3) return false;

    const [headerB64, payloadB64, signatureB64] = parts;
    const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
    const signatureBytes = this.base64UrlDecodeToBuffer(signatureB64);
    // Convert to ArrayBuffer (workaround for TypeScript strict typing)
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
   * Base64URL decode to string
   */
  private base64UrlDecode(str: string): string {
    // Add padding if needed
    const padded = str + '==='.slice(0, (4 - str.length % 4) % 4);
    const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');
    
    // Node.js
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(base64, 'base64').toString('utf-8');
    }
    
    // Browser
    return decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
  }

  /**
   * Base64URL decode to Uint8Array
   */
  private base64UrlDecodeToBuffer(str: string): Uint8Array {
    const padded = str + '==='.slice(0, (4 - str.length % 4) % 4);
    const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');
    
    // Node.js
    if (typeof Buffer !== 'undefined') {
      return new Uint8Array(Buffer.from(base64, 'base64'));
    }
    
    // Browser
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  /**
   * Clear the JWKS cache (useful for testing or forced refresh)
   */
  clearCache(): void {
    this.jwksCache = null;
    this.jwksCacheTime = 0;
  }

  // ===========================================================================
  // PERMISSION HELPER METHODS
  // ===========================================================================

  /**
   * Check if the JWT payload has a specific tenant permission
   * 
   * @param payload - Decoded JWT payload
   * @param permission - Permission to check (e.g., 'licenses:manage')
   * @returns true if user has the permission (wildcards supported)
   * 
   * @example
   * ```ts
   * const { user } = await validator.getCurrentUser(authHeader);
   * if (validator.hasTenantPermission(user, 'licenses:manage')) {
   *   // User can manage licenses
   * }
   * ```
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
   * Check if the JWT payload has a specific app permission
   * 
   * @param payload - Decoded JWT payload
   * @param permission - Permission to check (e.g., 'projects:create')
   * @returns true if user has the permission (wildcards supported)
   * 
   * @example
   * ```ts
   * const { user } = await validator.getCurrentUser(authHeader);
   * if (validator.hasAppPermission(user, 'projects:create')) {
   *   // User can create projects
   * }
   * ```
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
   * Check if the JWT payload has a specific feature enabled
   * 
   * This reads from the `license.features` array in the JWT.
   * No API call needed - feature information is embedded in the token!
   * 
   * @param payload - Decoded JWT payload
   * @param featureKey - Feature to check (e.g., 'sso', 'audit_logs')
   * @returns true if feature is enabled
   * 
   * @example
   * ```ts
   * const { user } = await validator.getCurrentUser(authHeader);
   * if (validator.hasFeature(user, 'sso')) {
   *   // User's tenant has SSO enabled
   * }
   * ```
   */
  hasFeature(payload: JwtPayload, featureKey: string): boolean {
    const license = payload.license as { features?: string[] } | undefined;
    return license?.features?.includes(featureKey) ?? false;
  }

  /**
   * Get the license type from JWT payload
   * 
   * @param payload - Decoded JWT payload
   * @returns License type slug (e.g., 'pro', 'enterprise') or null
   * 
   * @example
   * ```ts
   * const { user } = await validator.getCurrentUser(authHeader);
   * const licenseType = validator.getLicenseType(user);
   * if (licenseType === 'enterprise') {
   *   // Show enterprise features
   * }
   * ```
   */
  getLicenseType(payload: JwtPayload): string | null {
    const license = payload.license as { type?: string } | undefined;
    return license?.type ?? null;
  }

  /**
   * Check if wildcard pattern matches permission
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
   * This is the helper for implementing `/api/auth/me` endpoints.
   * 
   * - Does NOT call the IDP
   * - Validates JWT signature using cached JWKS
   * - Returns the decoded JWT payload
   * 
   * @example
   * ```ts
   * const validator = createJwtValidator({ authVitalHost: process.env.AV_HOST });
   * 
   * // GET /api/auth/me
   * app.get('/api/auth/me', async (req, res) => {
   *   const result = await validator.getCurrentUser(req.headers.authorization);
   *   
   *   if (!result.authenticated) {
   *     return res.status(401).json({ error: result.error });
   *   }
   *   
   *   res.json(result.user);
   * });
   * ```
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

    // Validate token (uses cached JWKS, fetches if not present)
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

/**
 * Create a JWT validator instance
 * 
 * @example
 * ```ts
 * const validator = createJwtValidator({
 *   authVitalHost: 'https://auth.example.com',
 *   audience: 'my-client-id', // optional but recommended
 * });
 * 
 * const result = await validator.validateToken(token);
 * if (result.valid) {
 *   console.log('User:', result.payload.sub);
 * }
 * ```
 */
export function createJwtValidator(config: JwtValidatorConfig): JwtValidator {
  return new JwtValidator(config);
}

// =============================================================================
// GET CURRENT USER HELPER (for /api/auth/me)
// =============================================================================

export interface GetCurrentUserResult {
  /** Whether the request is authenticated with a valid token */
  authenticated: boolean;
  /** The decoded JWT payload (user data) if authenticated */
  user: JwtPayload | null;
  /** Error message if authentication failed */
  error?: string;
}

/**
 * Extract and validate the current user from an Authorization header.
 * This is the helper for implementing `/api/auth/me` endpoints.
 * 
 * - Does NOT call the IDP
 * - Validates JWT signature using cached JWKS (fetches if not cached)
 * - Returns the decoded JWT payload
 * 
 * @example
 * ```ts
 * import { getCurrentUser, createJwtValidator } from '@authvital/sdk/server';
 * 
 * // Create a validator (typically once at startup)
 * const validator = createJwtValidator({
 *   authVitalHost: process.env.AV_HOST,
 * });
 * 
 * // GET /api/auth/me
 * app.get('/api/auth/me', async (req, res) => {
 *   const result = await getCurrentUser(req.headers.authorization, validator);
 *   
 *   if (!result.authenticated) {
 *     return res.status(401).json({ error: result.error });
 *   }
 *   
 *   // Return the decoded JWT claims (no IDP call!)
 *   res.json(result.user);
 * });
 * ```
 * 
 * @example Next.js API Route
 * ```ts
 * import { getCurrentUser, createJwtValidator } from '@authvital/sdk/server';
 * 
 * const validator = createJwtValidator({ authVitalHost: process.env.AV_HOST });
 * 
 * export async function GET(request: Request) {
 *   const result = await getCurrentUser(
 *     request.headers.get('authorization'),
 *     validator
 *   );
 *   
 *   if (!result.authenticated) {
 *     return Response.json({ error: result.error }, { status: 401 });
 *   }
 *   
 *   return Response.json(result.user);
 * }
 * ```
 */
export async function getCurrentUser(
  authorizationHeader: string | null | undefined,
  validator: JwtValidator,
): Promise<GetCurrentUserResult> {
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

  // Validate token (uses cached JWKS, fetches if not present)
  const validationResult = await validator.validateToken(token);

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

/**
 * Convenience function that creates a validator and gets the current user in one call.
 * Use this for simple cases; for better performance, create the validator once and reuse it.
 * 
 * @example
 * ```ts
 * import { getCurrentUserFromConfig } from '@authvital/sdk/server';
 * 
 * // GET /api/auth/me (simple one-liner)
 * app.get('/api/auth/me', async (req, res) => {
 *   const result = await getCurrentUserFromConfig(
 *     req.headers.authorization,
 *     { authVitalHost: process.env.AV_HOST }
 *   );
 *   
 *   if (!result.authenticated) {
 *     return res.status(401).json({ error: result.error });
 *   }
 *   
 *   res.json(result.user);
 * });
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
// EXPRESS MIDDLEWARE
// =============================================================================

/**
 * Express/Connect middleware factory for JWT validation
 * 
 * @example
 * ```ts
 * import { createJwtMiddleware } from '@authvital/sdk/server';
 * 
 * const requireAuth = createJwtMiddleware({
 *   authVitalHost: process.env.AV_HOST,
 * });
 * 
 * app.get('/api/protected', requireAuth, (req, res) => {
 *   console.log('User:', req.user);
 *   res.json({ message: 'Hello!' });
 * });
 * ```
 */
export function createJwtMiddleware(config: JwtValidatorConfig) {
  const validator = createJwtValidator(config);

  return async (req: any, res: any, next: any) => {
    // Get token from Authorization header
    const authHeader = req.headers?.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid Authorization header' });
    }

    const token = authHeader.slice(7);
    const result = await validator.validateToken(token);

    if (!result.valid) {
      return res.status(401).json({ error: result.error || 'Invalid token' });
    }

    // Attach user payload to request
    req.user = result.payload;
    next();
  };
}

/**
 * Create options for passport-jwt Strategy
 * 
 * @example
 * ```ts
 * import { Strategy as JwtStrategy } from 'passport-jwt';
 * import { createPassportJwtOptions } from '@authvital/sdk/server';
 * 
 * const options = await createPassportJwtOptions({
 *   authVitalHost: process.env.AV_HOST,
 * });
 * 
 * passport.use(new JwtStrategy(options, (payload, done) => {
 *   // payload is the decoded JWT
 *   done(null, payload);
 * }));
 * ```
 */
export async function createPassportJwtOptions(config: JwtValidatorConfig): Promise<{
  jwtFromRequest: (req: any) => string | null;
  secretOrKeyProvider: (req: any, rawJwt: any, done: any) => void;
  issuer: string;
  audience?: string;
  algorithms: string[];
}> {
  // Validate required config
  if (!config.authVitalHost) {
    throw new Error(
      'authVitalHost is required. Pass it in config or set AV_HOST environment variable.',
    );
  }

  const validator = createJwtValidator(config);

  return {
    jwtFromRequest: (req: any) => {
      const authHeader = req.headers?.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        return authHeader.slice(7);
      }
      return null;
    },
    secretOrKeyProvider: async (_req: any, rawJwt: any, done: any) => {
      try {
        const decoded = validator.decodeToken(rawJwt);
        if (!decoded?.header.kid) {
          return done(new Error('Token missing kid header'));
        }

        const jwks = await validator.getPublicKeys();
        const key = jwks.keys.find(k => k.kid === decoded.header.kid);
        
        if (!key) {
          return done(new Error(`Unknown signing key: ${decoded.header.kid}`));
        }

        // Convert JWK to PEM for passport-jwt
        const pem = jwkToPem(key);
        done(null, pem);
      } catch (error) {
        done(error);
      }
    },
    issuer: config.issuer ?? config.authVitalHost.replace(/\/$/, ''),
    audience: config.audience,
    algorithms: ['RS256'],
  };
}

/**
 * Convert a JWK to PEM format (for libraries that need PEM)
 */
function jwkToPem(jwk: JwksKey): string {
  if (jwk.kty !== 'RSA' || !jwk.n || !jwk.e) {
    throw new Error('Only RSA keys are supported');
  }

  // This is a simplified implementation
  // For production, consider using a library like 'jwk-to-pem'
  const n = base64UrlToBase64(jwk.n);
  const e = base64UrlToBase64(jwk.e);

  // Build ASN.1 structure for RSA public key
  const nBytes = Buffer.from(n, 'base64');
  const eBytes = Buffer.from(e, 'base64');

  // RSAPublicKey ::= SEQUENCE { modulus INTEGER, publicExponent INTEGER }
  const rsaPublicKey = Buffer.concat([
    Buffer.from([0x30]), // SEQUENCE
    encodeLength(nBytes.length + eBytes.length + 4 + (nBytes[0] & 0x80 ? 1 : 0) + (eBytes[0] & 0x80 ? 1 : 0)),
    Buffer.from([0x02]), // INTEGER (modulus)
    encodeLength(nBytes.length + (nBytes[0] & 0x80 ? 1 : 0)),
    nBytes[0] & 0x80 ? Buffer.from([0x00]) : Buffer.alloc(0),
    nBytes,
    Buffer.from([0x02]), // INTEGER (exponent)
    encodeLength(eBytes.length + (eBytes[0] & 0x80 ? 1 : 0)),
    eBytes[0] & 0x80 ? Buffer.from([0x00]) : Buffer.alloc(0),
    eBytes,
  ]);

  // SubjectPublicKeyInfo wrapper
  const rsaOid = Buffer.from([0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00]);
  const bitString = Buffer.concat([
    Buffer.from([0x03]),
    encodeLength(rsaPublicKey.length + 1),
    Buffer.from([0x00]),
    rsaPublicKey,
  ]);

  const spki = Buffer.concat([
    Buffer.from([0x30]),
    encodeLength(rsaOid.length + bitString.length),
    rsaOid,
    bitString,
  ]);

  const base64 = spki.toString('base64');
  const lines = base64.match(/.{1,64}/g) || [];
  return `-----BEGIN PUBLIC KEY-----\n${lines.join('\n')}\n-----END PUBLIC KEY-----`;
}

function base64UrlToBase64(str: string): string {
  const padded = str + '==='.slice(0, (4 - str.length % 4) % 4);
  return padded.replace(/-/g, '+').replace(/_/g, '/');
}

function encodeLength(len: number): Buffer {
  if (len < 128) {
    return Buffer.from([len]);
  }
  const bytes = [];
  while (len > 0) {
    bytes.unshift(len & 0xff);
    len >>= 8;
  }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}
