// Tenant-subdomain detection for the *.seat.lvh.me topology.
//
// seat.lvh.me             -> apex host, no tenant hint
// licenseco.seat.lvh.me   -> tenant "licenseco"

const APEX_SUFFIX = '.seat.lvh.me';
const APEX_HOST = 'seat.lvh.me';

export interface TenantContext {
  subdomain: string | null;
  host: string;
  apexHost: string;
}

export function detectTenant(hostname: string = window.location.hostname): TenantContext {
  if (hostname === APEX_HOST) {
    return { subdomain: null, host: hostname, apexHost: APEX_HOST };
  }
  if (hostname.endsWith(APEX_SUFFIX)) {
    const prefix = hostname.slice(0, -APEX_SUFFIX.length);
    return { subdomain: prefix || null, host: hostname, apexHost: APEX_HOST };
  }
  return { subdomain: null, host: hostname, apexHost: hostname };
}

export function tenantUrl(subdomain: string | null): string {
  const host = subdomain ? `${subdomain}${APEX_SUFFIX}` : APEX_HOST;
  return `https://${host}/`;
}

// Tenants seeded for "Seat App" (see seed.config.yaml allowed_web_origins).
export const KNOWN_TENANTS = ['licenseco', 'otherco'] as const;
