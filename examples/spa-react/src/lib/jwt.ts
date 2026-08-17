import type { EnhancedJwtPayload } from '@authvital/browser';

/**
 * Decode a JWT payload for DISPLAY ONLY (no signature verification).
 *
 * The browser SDK already validates tokens on the wire and only ever holds a
 * token the IdP issued; here we simply base64url-decode the middle segment so
 * the UI can show the raw claims panel (app_roles, license, etc.).
 */
export function decodeJwt(token: string | null): EnhancedJwtPayload | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const json = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json) as EnhancedJwtPayload;
  } catch {
    return null;
  }
}

/** Format a unix-seconds timestamp claim (exp/iat) as a readable local time. */
export function formatEpoch(value: unknown): string {
  if (typeof value !== 'number') return '—';
  return new Date(value * 1000).toLocaleString();
}
