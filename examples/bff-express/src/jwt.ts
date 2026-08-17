import { decodeToken } from '@authvital/server';
import type { EnhancedJwtPayload } from '@authvital/shared';

/** Decode JWT claims (no signature check — use validateAccessToken for that). */
export function decodeClaims(token: string | null | undefined): EnhancedJwtPayload | null {
  if (!token) return null;
  const decoded = decodeToken(token);
  return decoded ? (decoded.payload as unknown as EnhancedJwtPayload) : null;
}

// ---------------------------------------------------------------------------
// Claim-based authorization helpers.
//
// The server SDK does not ship `hasAppPermission` / `hasFeatureFromJwt`, so we
// implement them here against the decoded EnhancedJwtPayload. These are the
// server-side mirror of the browser SDK's usePermissions() checks.
// ---------------------------------------------------------------------------

export function hasAppPermission(claims: EnhancedJwtPayload | null, permission: string): boolean {
  return Boolean(claims?.app_permissions?.includes(permission));
}

export function hasAppRole(claims: EnhancedJwtPayload | null, role: string): boolean {
  return Boolean(claims?.app_roles?.includes(role));
}

export function hasFeatureFromJwt(claims: EnhancedJwtPayload | null, feature: string): boolean {
  return Boolean(claims?.license?.features?.includes(feature));
}
