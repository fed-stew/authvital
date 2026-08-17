import * as crypto from 'crypto';

/**
 * Authorization codes are stored HASHED at rest (SHA-256 hex in the
 * `code_hash` column) — a database dump or backup within a code's short
 * lifetime must never yield redeemable plaintext codes.
 *
 * SHA-256 (no salt/pepper) is deliberate: codes carry 256 bits of CSPRNG
 * entropy (see generateAuthorizationCode), so brute-force is infeasible and
 * a plain hash keeps the unique-column lookup a simple O(1) index hit.
 */

/** Generate a fresh authorization code: 256 bits of CSPRNG, URL-safe. */
export function generateAuthorizationCode(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/** SHA-256 hex digest of a code — the ONLY form ever persisted or logged. */
export function hashAuthorizationCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}
