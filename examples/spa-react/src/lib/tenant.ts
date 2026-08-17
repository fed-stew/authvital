// Tenant-subdomain detection for the *.app.lvh.me topology.
//
// app.lvh.me            -> apex host, no tenant hint
// acme.app.lvh.me       -> tenant "acme"
//
// The seeded "My Local App" client enumerates these subdomains in its
// allowed_web_origins / redirect_uris, so switching tenant == visiting a
// different subdomain (and passing tenant_hint into the login flow).

const APEX_SUFFIX = '.app.lvh.me';
const APEX_HOST = 'app.lvh.me';

export interface TenantContext {
  /** Detected tenant subdomain, or null on the apex host. */
  subdomain: string | null;
  /** Full current hostname. */
  host: string;
  /** Apex host for this app family (app.lvh.me). */
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
  // Fallback (e.g. localhost during `vite dev`): treat as apex, no tenant.
  return { subdomain: null, host: hostname, apexHost: hostname };
}

/** Build the URL for the same app under a specific tenant subdomain. */
export function tenantUrl(subdomain: string | null): string {
  const host = subdomain ? `${subdomain}${APEX_SUFFIX}` : APEX_HOST;
  return `https://${host}/`;
}

// Tenants seeded for "My Local App" (see seed.config.yaml allowed_web_origins).
export const KNOWN_TENANTS = ['acme', 'globex', 'licenseco', 'otherco'] as const;
