/**
 * @authvital/core - JWT Verification
 *
 * JWT token verification utilities using Web Crypto API.
 * Supports RS256, RS384, RS512, ES256, ES384, ES512, HS256, HS384, HS512.
 *
 * Uses Web Crypto API for all cryptographic operations (no external dependencies).
 *
 * @packageDocumentation
 */

import { JWKSClient, type JWKSClientOptions } from './jwks.js';
import type { JwtHeader, JwtPayload } from '../types/index.js';

// Re-export types for convenience
export type { JwtHeader, JwtPayload };

/**
 * Options for token verification.
 */
export interface VerifyOptions {
  /** Expected issuer (iss claim) */
  issuer?: string;
  /** Expected audience (aud claim) */
  audience?: string | string[];
  /** JWKS URI for fetching signing keys */
  jwksUri: string;
  /** Clock tolerance in seconds for exp/nbf validation (default: 0) */
  clockTolerance?: number;
  /** Maximum age of the token in seconds (for iat validation) */
  maxAge?: number;
  /** JWKS client options (alternative to jwksUri) */
  jwksClient?: JWKSClient;
}

/**
 * Result of token verification.
 */
export type VerifyResult =
  | { valid: true; payload: JwtPayload }
  | { valid: false; error: string };

// =============================================================================
// ERROR CLASSES
// =============================================================================

/**
 * Error thrown when JWT verification fails.
 */
export class JWTVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JWTVerificationError';
  }
}

// =============================================================================
// TOKEN DECODING
// =============================================================================

/**
 * Decode a JWT token without verifying the signature.
 *
 * WARNING: This does not validate the signature! Only use this when you
 * need to inspect token contents before verification, or for debugging.
 *
 * @param token - The JWT token string
 * @returns Decoded header and payload, or null if invalid format
 *
 * @example
 * ```typescript
 * const decoded = decodeToken(token);
 * if (decoded) {
 *   console.log('Algorithm:', decoded.header.alg);
 *   console.log('Subject:', decoded.payload.sub);
 * }
 * ```
 */
export function decodeToken(token: string): { header: JwtHeader; payload: JwtPayload } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    const header = safeBase64UrlDecode(parts[0]);
    const payload = safeBase64UrlDecode(parts[1]);

    if (!header || !payload) {
      return null;
    }

    return {
      header: JSON.parse(header) as JwtHeader,
      payload: JSON.parse(payload) as JwtPayload,
    };
  } catch {
    return null;
  }
}

/**
 * Safely decode base64url-encoded string.
 *
 * @param str - The base64url-encoded string
 * @returns The decoded string, or null if decoding fails
 */
function safeBase64UrlDecode(str: string): string | null {
  try {
    // Add padding if needed
    const padding = 4 - (str.length % 4);
    const padded = padding !== 4 ? str + '='.repeat(padding) : str;

    // Convert base64url to base64
    const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');

    // Decode using atob
    return atob(base64);
  } catch {
    return null;
  }
}

// =============================================================================
// TOKEN VERIFICATION
// =============================================================================

/**
 * Verify a JWT token's signature and claims.
 *
 * This function performs the following validations:
 * 1. Token format (must have 3 parts separated by dots)
 * 2. Signature (using the appropriate algorithm and key)
 * 3. Expiration time (exp claim)
 * 4. Not before time (nbf claim)
 * 5. Issued at time (iat claim, if maxAge specified)
 * 6. Issuer (iss claim, if issuer option provided)
 * 7. Audience (aud claim, if audience option provided)
 *
 * @param token - The JWT token to verify
 * @param options - Verification options including JWKS URI
 * @returns VerifyResult indicating success or specific error
 *
 * @example
 * ```typescript
 * const result = await verifyToken(token, {
 *   jwksUri: 'https://auth.example.com/.well-known/jwks.json',
 *   issuer: 'https://auth.example.com',
 *   audience: 'my-api',
 *   clockTolerance: 30, // 30 seconds tolerance
 * });
 *
 * if (result.valid) {
 *   console.log('Token valid for user:', result.payload.sub);
 * } else {
 *   console.error('Token invalid:', result.error);
 * }
 * ```
 */
export async function verifyToken(
  token: string,
  options: VerifyOptions
): Promise<VerifyResult> {
  try {
    // Decode the token to get header and payload
    const decoded = decodeToken(token);
    if (!decoded) {
      return { valid: false, error: 'Invalid token format' };
    }

    const { header, payload } = decoded;

    // Validate algorithm (reject 'none')
    if (!header.alg || header.alg === 'none') {
      return { valid: false, error: 'Algorithm "none" is not allowed' };
    }

    // Get the signing key
    const jwksClient = options.jwksClient ?? new JWKSClient({ jwksUri: options.jwksUri });

    if (!header.kid) {
      // For HMAC algorithms, we might not have a kid
      // Try to verify directly if we can derive the key
      if (header.alg.startsWith('HS')) {
        // HS256/384/512 require a shared secret - not supported via JWKS
        return { valid: false, error: 'HMAC algorithms require shared secret (not supported via JWKS)' };
      }
      return { valid: false, error: 'Token missing key ID (kid) in header' };
    }

    const signingKey = await jwksClient.getSigningKey(header.kid);

    // Verify the signature
    const signatureValid = await verifySignature(token, header.alg, signingKey);
    if (!signatureValid) {
      return { valid: false, error: 'Invalid token signature' };
    }

    // Validate claims
    const claimValidation = validateClaims(payload, options);
    if (!claimValidation.valid) {
      return claimValidation;
    }

    return { valid: true, payload };
  } catch (error) {
    if (error instanceof JWTVerificationError) {
      return { valid: false, error: error.message };
    }

    return {
      valid: false,
      error: `Verification failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Verify a token's signature using the specified algorithm.
 *
 * @param token - The complete JWT token
 * @param algorithm - The JWS algorithm (e.g., 'RS256')
 * @param key - The CryptoKey for verification
 * @returns true if signature is valid
 */
async function verifySignature(
  token: string,
  algorithm: string,
  key: CryptoKey
): Promise<boolean> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return false;
  }

  const message = `${parts[0]}.${parts[1]}`;
  const signature = base64UrlToArrayBuffer(parts[2]);

  const encoder = new TextEncoder();
  const messageBuffer = encoder.encode(message);

  try {
    // Determine the algorithm parameters
    const algorithmParams = getVerificationAlgorithm(algorithm);

    return await crypto.subtle.verify(
      algorithmParams,
      key,
      signature,
      messageBuffer
    );
  } catch {
    return false;
  }
}

/**
 * Get the Web Crypto API algorithm parameters for verification.
 *
 * @param alg - The JWS algorithm identifier
 * @returns Algorithm parameters for crypto.subtle.verify
 */
function getVerificationAlgorithm(alg: string): AlgorithmIdentifier | RsaPssParams | EcdsaParams | HmacImportParams {
  // RSA-PKCS1-v1_5 algorithms
  if (alg === 'RS256') {
    return { name: 'RSASSA-PKCS1-v1_5' };
  }
  if (alg === 'RS384') {
    return { name: 'RSASSA-PKCS1-v1_5' };
  }
  if (alg === 'RS512') {
    return { name: 'RSASSA-PKCS1-v1_5' };
  }

  // RSA-PSS algorithms
  if (alg === 'PS256') {
    return { name: 'RSA-PSS', saltLength: 32 };
  }
  if (alg === 'PS384') {
    return { name: 'RSA-PSS', saltLength: 48 };
  }
  if (alg === 'PS512') {
    return { name: 'RSA-PSS', saltLength: 64 };
  }

  // ECDSA algorithms
  if (alg === 'ES256') {
    return { name: 'ECDSA', hash: { name: 'SHA-256' } };
  }
  if (alg === 'ES384') {
    return { name: 'ECDSA', hash: { name: 'SHA-384' } };
  }
  if (alg === 'ES512') {
    return { name: 'ECDSA', hash: { name: 'SHA-512' } };
  }

  // HMAC algorithms
  if (alg === 'HS256') {
    return { name: 'HMAC', hash: { name: 'SHA-256' } };
  }
  if (alg === 'HS384') {
    return { name: 'HMAC', hash: { name: 'SHA-384' } };
  }
  if (alg === 'HS512') {
    return { name: 'HMAC', hash: { name: 'SHA-512' } };
  }

  throw new JWTVerificationError(`Unsupported algorithm: ${alg}`);
}

/**
 * Convert base64url string to ArrayBuffer.
 *
 * @param str - The base64url-encoded string
 * @returns ArrayBuffer containing the decoded bytes
 */
function base64UrlToArrayBuffer(str: string): ArrayBuffer {
  // Add padding if needed
  const padding = 4 - (str.length % 4);
  const padded = padding !== 4 ? str + '='.repeat(padding) : str;

  // Convert base64url to base64
  const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');

  // Decode to binary string, then to Uint8Array
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes.buffer;
}

// =============================================================================
// CLAIM VALIDATION
// =============================================================================

/**
 * Validate JWT claims against verification options.
 *
 * @param payload - The decoded JWT payload
 * @param options - Verification options
 * @returns VerifyResult indicating success or specific claim validation error
 */
function validateClaims(
  payload: JwtPayload,
  options: VerifyOptions
): VerifyResult {
  const now = Math.floor(Date.now() / 1000);
  const clockTolerance = options.clockTolerance ?? 0;

  // Validate expiration (exp)
  if (payload.exp !== undefined) {
    if (now > payload.exp + clockTolerance) {
      return { valid: false, error: 'Token has expired' };
    }
  }

  // Validate not before (nbf)
  if (payload.nbf !== undefined) {
    if (now < payload.nbf - clockTolerance) {
      return { valid: false, error: 'Token is not yet valid (nbf)' };
    }
  }

  // Validate issued at (iat) if maxAge specified
  if (options.maxAge !== undefined && payload.iat !== undefined) {
    if (now > payload.iat + options.maxAge + clockTolerance) {
      return { valid: false, error: 'Token is too old (maxAge exceeded)' };
    }
  }

  // Validate issuer (iss)
  if (options.issuer !== undefined) {
    if (payload.iss !== options.issuer) {
      return {
        valid: false,
        error: `Invalid issuer: expected '${options.issuer}', got '${payload.iss}'`,
      };
    }
  }

  // Validate audience (aud)
  if (options.audience !== undefined) {
    const tokenAud = payload.aud;
    const expectedAud = Array.isArray(options.audience)
      ? options.audience
      : [options.audience];

    if (tokenAud === undefined) {
      return { valid: false, error: 'Token missing audience claim' };
    }

    const tokenAudArray = Array.isArray(tokenAud) ? tokenAud : [tokenAud];
    const audMatch = expectedAud.some((aud) => tokenAudArray.includes(aud));

    if (!audMatch) {
      return {
        valid: false,
        error: `Invalid audience: expected one of [${expectedAud.join(', ')}], got [${tokenAudArray.join(', ')}]`,
      };
    }
  }

  return { valid: true, payload };
}

// =============================================================================
// UTILITY EXPORTS
// =============================================================================

export { JWKSClient };
export type { JWKSClientOptions };
