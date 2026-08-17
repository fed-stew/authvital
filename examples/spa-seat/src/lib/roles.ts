import type { EnhancedJwtPayload } from '@authvital/browser';

// Capability tiers for the licensing portal, derived from the tenant role in
// the JWT. This is UI gating only — every mutating action is still enforced
// server-side by AuthVital.
export interface SeatCapabilities {
  tier: 'owner/billing' | 'admin' | 'member' | 'none';
  canView: boolean;
  canManageSeats: boolean;   // assign/revoke seats
  canProvision: boolean;     // provision seat inventory / subscription
}

export function capabilitiesFor(payload: EnhancedJwtPayload | null): SeatCapabilities {
  const roles = payload?.tenant_roles ?? [];
  const has = (r: string) => roles.includes(r);

  if (has('owner') || has('billing-admin')) {
    return { tier: 'owner/billing', canView: true, canManageSeats: true, canProvision: true };
  }
  if (has('admin')) {
    return { tier: 'admin', canView: true, canManageSeats: true, canProvision: false };
  }
  if (has('member')) {
    return { tier: 'member', canView: true, canManageSeats: false, canProvision: false };
  }
  return { tier: 'none', canView: false, canManageSeats: false, canProvision: false };
}
