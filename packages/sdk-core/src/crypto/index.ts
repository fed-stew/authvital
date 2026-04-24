/**
 * @authvital/core - Crypto Module
 *
 * Cryptographic utilities for JWT verification and JWK handling.
 * Uses Web Crypto API for all operations (no external dependencies).
 *
 * @packageDocumentation
 */

// =============================================================================
// JWKS CLIENT
// =============================================================================

export {
  JWKSClient,
  JWKSError,
  SigningKeyNotFoundError,
  type JWK,
  type JsonWebKeySet,
  // Note: JWKS type alias not exported here to avoid conflict with JWKS constant in api module
  // Use JsonWebKeySet instead, or import JWKS type directly from ./jwks.js
  type JWKSClientOptions,
} from './jwks.js';

// =============================================================================
// JWT VERIFICATION
// =============================================================================

export {
  verifyToken,
  decodeToken,
  JWTVerificationError,
  // Types re-exported from jwt-verify.ts (JwtHeader and JwtPayload are also in types/index.ts)
  type VerifyOptions,
  type VerifyResult,
} from './jwt-verify.js';

// Note: JwtHeader and JwtPayload types are also exported from types/index.ts
// The types are identical and TypeScript will merge them correctly.