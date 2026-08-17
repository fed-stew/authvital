import type { EnhancedJwtPayload } from '@authvital/browser';

/**
 * Decode a JWT payload for DISPLAY ONLY (no signature verification). The SDK
 * already validates tokens; here we just read claims for the licensing UI.
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
