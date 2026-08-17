/**
 * @authvital/core - Hosted Console Deep-Link URL Builders
 *
 * The AuthVital hosted console is the canonical tenant-admin UI. These pure
 * helpers build deep links straight into its real frontend routes so
 * integrators can send users to the right page (and the app/org switchers)
 * without hand-assembling paths.
 *
 * Every path here is verified against `packages/frontend/src/App.tsx`:
 *
 *   /tenant/:tenantId                         -> overview (index redirect)
 *   /tenant/:tenantId/overview
 *   /tenant/:tenantId/members
 *   /tenant/:tenantId/applications
 *   /tenant/:tenantId/applications/:appId     -> per-app users
 *   /tenant/:tenantId/access-matrix           -> members x apps grid
 *   /tenant/:tenantId/licenses
 *   /tenant/:tenantId/billing
 *   /tenant/:tenantId/audit
 *   /tenant/:tenantId/sso
 *   /tenant/:tenantId/domains
 *   /tenant/:tenantId/general                 -> tenant settings
 *   /account/settings                         -> per-user account (see urls.ts)
 *   /auth/app-picker                          -> switch app
 *   /auth/org-picker                          -> switch org
 *
 * @packageDocumentation
 */

// =============================================================================
// OPTIONS
// =============================================================================

/** Base options for tenant-scoped management deep links. */
export interface ManagementUrlOptions {
  /** The AuthVital hosted console origin, e.g. `https://auth.example.com` */
  authVitalHost: string;
  /** The tenant/organization id to build the link for */
  tenantId: string;
}

/** Options for the per-application users page (adds the application id). */
export interface ApplicationUsersUrlOptions extends ManagementUrlOptions {
  /** The application id whose users/licenses to show */
  appId: string;
}

/** Options for the app-switcher entry point (`/auth/app-picker`). */
export interface AppPickerUrlOptions {
  /** Preselect a tenant by slug */
  tenant?: string;
  /** Human-readable tenant name (display only) */
  tenantName?: string;
}

/** Options for the org-switcher entry point (`/auth/org-picker`). */
export interface OrgPickerUrlOptions {
  /** OAuth client id to continue the flow with */
  clientId?: string;
  /** Where to send the user after they pick an org */
  redirectUri?: string;
}

// =============================================================================
// INTERNAL HELPERS
// =============================================================================

/** Strip a single trailing slash so path joins stay clean. */
function normalizeHost(authVitalHost: string): string {
  return authVitalHost.replace(/\/$/, '');
}

/** Build the tenant-scoped base path: `<host>/tenant/<tenantId>`. */
function tenantBase(authVitalHost: string, tenantId: string): string {
  return `${normalizeHost(authVitalHost)}/tenant/${encodeURIComponent(tenantId)}`;
}

// =============================================================================
// TENANT MANAGEMENT PAGE HELPERS
// =============================================================================

/**
 * Tenant management root. Resolves to the overview page (the console's index
 * route redirects `/tenant/:tenantId` -> `/tenant/:tenantId/overview`).
 */
export function getManagementUrl(options: ManagementUrlOptions): string {
  return tenantBase(options.authVitalHost, options.tenantId);
}

/** Tenant overview page: `/tenant/:tenantId/overview`. */
export function getOverviewUrl(options: ManagementUrlOptions): string {
  return `${tenantBase(options.authVitalHost, options.tenantId)}/overview`;
}

/** Tenant members page: `/tenant/:tenantId/members`. */
export function getMembersUrl(options: ManagementUrlOptions): string {
  return `${tenantBase(options.authVitalHost, options.tenantId)}/members`;
}

/** Tenant applications page: `/tenant/:tenantId/applications`. */
export function getApplicationsUrl(options: ManagementUrlOptions): string {
  return `${tenantBase(options.authVitalHost, options.tenantId)}/applications`;
}

/**
 * Per-application users page:
 * `/tenant/:tenantId/applications/:appId`.
 */
export function getApplicationUsersUrl(options: ApplicationUsersUrlOptions): string {
  return `${tenantBase(options.authVitalHost, options.tenantId)}/applications/${encodeURIComponent(options.appId)}`;
}

/**
 * Members x applications access-grid page:
 * `/tenant/:tenantId/access-matrix`.
 */
export function getAccessMatrixUrl(options: ManagementUrlOptions): string {
  return `${tenantBase(options.authVitalHost, options.tenantId)}/access-matrix`;
}

/** Tenant licenses page: `/tenant/:tenantId/licenses`. */
export function getLicensesUrl(options: ManagementUrlOptions): string {
  return `${tenantBase(options.authVitalHost, options.tenantId)}/licenses`;
}

/** Tenant billing page: `/tenant/:tenantId/billing`. */
export function getBillingUrl(options: ManagementUrlOptions): string {
  return `${tenantBase(options.authVitalHost, options.tenantId)}/billing`;
}

/** Tenant audit-log page: `/tenant/:tenantId/audit`. */
export function getAuditUrl(options: ManagementUrlOptions): string {
  return `${tenantBase(options.authVitalHost, options.tenantId)}/audit`;
}

/** Tenant SSO settings page: `/tenant/:tenantId/sso`. */
export function getSsoUrl(options: ManagementUrlOptions): string {
  return `${tenantBase(options.authVitalHost, options.tenantId)}/sso`;
}

/** Tenant domains page: `/tenant/:tenantId/domains`. */
export function getDomainsUrl(options: ManagementUrlOptions): string {
  return `${tenantBase(options.authVitalHost, options.tenantId)}/domains`;
}

/**
 * Tenant general settings page: `/tenant/:tenantId/general`.
 * (This is the tenant-level "settings" page in the hosted console.)
 */
export function getSettingsUrl(options: ManagementUrlOptions): string {
  return `${tenantBase(options.authVitalHost, options.tenantId)}/general`;
}

/**
 * Build every tenant-scoped management deep link at once.
 *
 * @example
 * ```ts
 * const urls = getManagementUrls({ authVitalHost, tenantId });
 * // urls.members -> https://auth.example.com/tenant/t_123/members
 * ```
 */
export function getManagementUrls(options: ManagementUrlOptions): {
  root: string;
  overview: string;
  members: string;
  applications: string;
  accessMatrix: string;
  licenses: string;
  billing: string;
  audit: string;
  sso: string;
  domains: string;
  settings: string;
} {
  return {
    root: getManagementUrl(options),
    overview: getOverviewUrl(options),
    members: getMembersUrl(options),
    applications: getApplicationsUrl(options),
    accessMatrix: getAccessMatrixUrl(options),
    licenses: getLicensesUrl(options),
    billing: getBillingUrl(options),
    audit: getAuditUrl(options),
    sso: getSsoUrl(options),
    domains: getDomainsUrl(options),
    settings: getSettingsUrl(options),
  };
}

// =============================================================================
// APP / ORG SWITCHER ENTRY POINTS
// =============================================================================

/**
 * App-switcher entry point: `/auth/app-picker`.
 *
 * Use this to offer "switch app" in the single-account-many-apps flow. The
 * hosted page reads the optional `tenant` (slug) and `tenant_name` params.
 */
export function getAppPickerUrl(authVitalHost: string, options: AppPickerUrlOptions = {}): string {
  const url = new URL(`${normalizeHost(authVitalHost)}/auth/app-picker`);
  if (options.tenant) {
    url.searchParams.set('tenant', options.tenant);
  }
  if (options.tenantName) {
    url.searchParams.set('tenant_name', options.tenantName);
  }
  return url.toString();
}

/**
 * Org-switcher entry point: `/auth/org-picker`.
 *
 * Use this to offer "switch org". The hosted page reads the optional
 * `client_id` and `redirect_uri` params to continue the flow afterwards.
 */
export function getOrgPickerUrl(authVitalHost: string, options: OrgPickerUrlOptions = {}): string {
  const url = new URL(`${normalizeHost(authVitalHost)}/auth/org-picker`);
  if (options.clientId) {
    url.searchParams.set('client_id', options.clientId);
  }
  if (options.redirectUri) {
    url.searchParams.set('redirect_uri', options.redirectUri);
  }
  return url.toString();
}
