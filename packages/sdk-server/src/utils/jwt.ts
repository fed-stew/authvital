/**
 * @authvital/server - JWT decode helpers
 *
 * Lightweight, dependency-free decoding of JWT claims.
 *
 * IMPORTANT: These helpers DO NOT verify the signature. They are only for
 * reading claims from tokens whose authenticity has already been established
 * by another mechanism (e.g. an AES-256-GCM encrypted session cookie that
 * only our server could have produced). Never trust the output of these
 * helpers for tokens received directly from an untrusted client without
 * verifying the signature first (see AuthVitalJwtGuard for verification).
 */

/**
 * Standard OIDC + AuthVital claims we care about, plus a catch-all index.
 */
export interface DecodedTokenClaims {
  /** Subject — the user ID */
  sub?: string;
  /** AuthVital tenant ID (snake_case, as emitted by the auth server) */
  tenant_id?: string;
  /** camelCase fallback for tenant ID */
  tenantId?: string;
  /** Authentication Method References (RFC 8176), e.g. ['pwd', 'otp'] */
  amr?: string[];
  /**
   * Present when the token was minted under a tenant MFA grace period
   * (policy REQUIRED, user not yet enrolled). Unix seconds at which the
   * grace window closes and minting will be refused.
   */
  mfa_grace_expires_at?: number;
  /** Anything else present on the token */
  [key: string]: unknown;
}

/**
 * Decode the payload (claims) of a JWT without verifying its signature.
 *
 * @param token - The JWT string.
 * @returns The decoded claims, or null if the token is malformed.
 */
export function decodeJwtClaims(token: string): DecodedTokenClaims | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }
    // Convert base64url -> base64 and restore padding.
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '==='.slice(0, (4 - (base64.length % 4)) % 4);
    const json = Buffer.from(padded, 'base64').toString('utf-8');
    return JSON.parse(json) as DecodedTokenClaims;
  } catch {
    return null;
  }
}

/**
 * Extract the `userId` (sub) and `tenantId` (tenant_id/tenantId) from an
 * access token. Both are required by the integration permission endpoints, so
 * this returns null (fail-closed) if either is missing.
 *
 * @param token - The JWT access token.
 * @returns `{ userId, tenantId }` or null if either claim is absent.
 */
export function extractUserAndTenant(
  token: string,
): { userId: string; tenantId: string } | null {
  const claims = decodeJwtClaims(token);
  if (!claims) {
    return null;
  }
  const userId = claims.sub;
  const tenantId = claims.tenant_id ?? claims.tenantId;
  if (!userId || !tenantId) {
    return null;
  }
  return { userId: String(userId), tenantId: String(tenantId) };
}
