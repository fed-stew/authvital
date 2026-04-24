/**
 * @authvital/server - Crypto Utilities
 *
 * Encryption/decryption utilities for secure session management.
 * Uses AES-256-GCM for authenticated encryption.
 *
 * Also re-exports JWT verification utilities from @authvital/core
 * for server-side token validation.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync, timingSafeEqual as cryptoTimingSafeEqual } from 'crypto';

// Re-export JWT verification utilities from core
export {
  JWKSClient,
  JWKSError,
  SigningKeyNotFoundError,
  verifyToken,
  decodeToken,
  JWTVerificationError,
  type JWK,
  type JsonWebKeySet,
  /** @deprecated Use JsonWebKeySet instead */
  type JWKS,
  type JWKSClientOptions,
  type VerifyOptions,
  type VerifyResult,
  // Note: JwtHeader and JwtPayload are also available from @authvital/core types
} from '@authvital/core';

// =============================================================================
// CONSTANTS
// =============================================================================

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128 bits
const _AUTH_TAG_LENGTH = 16; // 128 bits
const SALT_LENGTH = 32; // 256 bits
const KEY_LENGTH = 32; // 256 bits

// =============================================================================
// TYPES
// =============================================================================

/**
 * Encrypted data structure containing all components needed for decryption.
 */
export interface EncryptedData {
  /** The encrypted payload (base64 encoded) */
  encrypted: string;
  /** Initialization vector (base64 encoded) */
  iv: string;
  /** Authentication tag for GCM (base64 encoded) */
  authTag: string;
  /** Salt used for key derivation (base64 encoded) */
  salt: string;
}

/**
 * Serialized encrypted data string format.
 * Format: base64(encrypted).base64(iv).base64(authTag).base64(salt)
 */
export type EncryptedString = string;

// =============================================================================
// KEY DERIVATION
// =============================================================================

/**
 * Derive a 256-bit key from a password and salt using scrypt.
 *
 * @param password - The password/secret to derive from
 * @param salt - The salt for key derivation
 * @returns A 32-byte (256-bit) key
 */
function deriveKey(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, KEY_LENGTH);
}

// =============================================================================
// ENCRYPTION
// =============================================================================

/**
 * Encrypt data using AES-256-GCM.
 *
 * @param data - The plaintext data to encrypt
 * @param secret - The secret key for encryption
 * @returns Encrypted data structure
 */
export function encrypt(data: string, secret: string): EncryptedData {
  // Generate random salt and derive key
  const salt = randomBytes(SALT_LENGTH);
  const key = deriveKey(secret, salt);

  // Generate random IV
  const iv = randomBytes(IV_LENGTH);

  // Create cipher
  const cipher = createCipheriv(ALGORITHM, key, iv);

  // Encrypt data
  let encrypted = cipher.update(data, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  // Get authentication tag
  const authTag = cipher.getAuthTag();

  return {
    encrypted,
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    salt: salt.toString('base64'),
  };
}

/**
 * Encrypt data and serialize to a compact string format.
 *
 * @param data - The plaintext data to encrypt
 * @param secret - The secret key for encryption
 * @returns Serialized encrypted string
 */
export function encryptToString(data: string, secret: string): EncryptedString {
  const encrypted = encrypt(data, secret);
  return `${encrypted.encrypted}.${encrypted.iv}.${encrypted.authTag}.${encrypted.salt}`;
}

// =============================================================================
// DECRYPTION
// =============================================================================

/**
 * Decrypt data using AES-256-GCM.
 *
 * @param encryptedData - The encrypted data structure
 * @param secret - The secret key for decryption
 * @returns Decrypted plaintext
 * @throws Error if decryption fails (invalid key, tampered data, etc.)
 */
export function decrypt(encryptedData: EncryptedData, secret: string): string {
  // Derive key from password and salt
  const salt = Buffer.from(encryptedData.salt, 'base64');
  const key = deriveKey(secret, salt);

  // Create decipher
  const iv = Buffer.from(encryptedData.iv, 'base64');
  const authTag = Buffer.from(encryptedData.authTag, 'base64');
  const decipher = createDecipheriv(ALGORITHM, key, iv);

  // Set authentication tag
  decipher.setAuthTag(authTag);

  // Decrypt data
  let decrypted = decipher.update(encryptedData.encrypted, 'base64', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Parse and decrypt a serialized encrypted string.
 *
 * @param encryptedString - The serialized encrypted string
 * @param secret - The secret key for decryption
 * @returns Decrypted plaintext
 * @throws Error if parsing or decryption fails
 */
export function decryptFromString(encryptedString: EncryptedString, secret: string): string {
  const parts = encryptedString.split('.');

  if (parts.length !== 4) {
    throw new Error('Invalid encrypted string format');
  }

  const [encrypted, iv, authTag, salt] = parts;

  return decrypt(
    {
      encrypted,
      iv,
      authTag,
      salt,
    },
    secret
  );
}

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Validate that a secret is suitable for encryption (minimum 32 characters).
 *
 * @param secret - The secret to validate
 * @returns true if valid, false otherwise
 */
export function isValidSecret(secret: string): boolean {
  return secret.length >= 32;
}

/**
 * Generate a cryptographically secure random secret.
 *
 * @param length - The length of the secret (default: 64)
 * @returns A random secret string
 */
export function generateSecret(length = 64): string {
  return randomBytes(length).toString('base64url');
}

// =============================================================================
// HASHING UTILITIES
// =============================================================================

/**
 * Create a hash of data using SHA-256.
 * Useful for creating fingerprints without storing sensitive data.
 *
 * @param data - The data to hash
 * @returns SHA-256 hash (hex encoded)
 */
export function hash(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Create a timing-safe comparison of two strings.
 * Prevents timing attacks when comparing secrets.
 *
 * @param a - First string
 * @param b - Second string
 * @returns true if strings are equal
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);

  if (bufA.length !== bufB.length) {
    return false;
  }

  return cryptoTimingSafeEqual(bufA, bufB);
}

// =============================================================================
// RE-EXPORTS
// =============================================================================

export { randomBytes } from 'crypto';
