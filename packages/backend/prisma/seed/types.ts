// =============================================================================
// SEED TYPES — Shape of the YAML config
// =============================================================================
// One home for every "what the seed file looks like" interface. Edit the YAML
// contract here and nowhere else.

export interface SeedBranding {
  name?: string;
  logo_url?: string;
  icon_url?: string;
  primary_color?: string;
  background_color?: string;
  accent_color?: string;
  support_url?: string;
  privacy_url?: string;
  terms_url?: string;
}

export interface SeedInstance {
  name?: string;
  allow_sign_up?: boolean;
  auto_create_tenant?: boolean;
  allow_generic_domains?: boolean;
  allow_anonymous_sign_up?: boolean;
  branding?: SeedBranding;
}

export interface SeedSuperAdmin {
  email: string;
  password: string;
  display_name?: string;
}

export interface SeedRole {
  name: string;
  slug: string;
  description?: string;
  is_default?: boolean;
}

export interface SeedLicenseType {
  name: string;
  slug: string;
  description?: string;
  max_members?: number | null;
  features?: Record<string, boolean>;
  status?: 'ACTIVE' | 'DRAFT' | 'HIDDEN';
  display_order?: number;
}

/**
 * A single OAuth credential (maps 1:1 to an ApplicationClient row). An app
 * container may declare at most ONE SPA + ONE MACHINE credential
 * (DB constraint: @@unique([applicationId, type])).
 */
export interface SeedCredential {
  // Anything not 'MACHINE' is coerced to 'SPA' (the historical default).
  type?: 'SPA' | 'MACHINE';
  client_id?: string;
  // MACHINE (confidential) clients only — SPA is a public PKCE client and must
  // NOT carry a secret (enforced in normalize.ts).
  client_secret?: string;
  redirect_uris?: string[];
  post_logout_redirect_uris?: string[];
  allowed_web_origins?: string[];
  initiate_login_uri?: string;
  access_token_ttl?: number;
  refresh_token_ttl?: number;
  // ── M2M authorization (MACHINE credentials only) ──────────────────────────
  m2m_trusted_all_tenants?: boolean;
  m2m_allowed_scopes?: string[];
  m2m_tenant_grants?: string[];
}

/**
 * An application CONTAINER (product). It owns roles, licensing, webhooks and
 * one-or-more OAuth credentials. Two shapes are accepted:
 *
 *   NEW (preferred): nested `credentials:` (or `clients:` alias) list.
 *   OLD (backward-compat): flat single-credential OAuth fields on the app
 *     itself (`type`, `client_id`, `redirect_uris`, ...). normalize.ts folds
 *     these into a single synthetic SeedCredential.
 */
export interface SeedApplication {
  name: string;
  slug: string;
  description?: string;

  // ── NEW container model: nested credentials (`clients` is an alias) ───────
  credentials?: SeedCredential[];
  clients?: SeedCredential[];

  // ── OLD flat single-credential fields (backward-compat only) ──────────────
  type?: 'SPA' | 'MACHINE';
  client_id?: string;
  client_secret?: string;
  redirect_uris?: string[];
  post_logout_redirect_uris?: string[];
  allowed_web_origins?: string[];
  initiate_login_uri?: string;
  access_token_ttl?: number;
  refresh_token_ttl?: number;
  m2m_trusted_all_tenants?: boolean;
  allowed_scopes?: string[]; // old flat name; maps to credential.m2m_allowed_scopes

  // ── Container-level M2M tenant grants (consumed by m2m-grants.seeder) ─────
  m2m_tenant_grants?: string[];

  // ── Roles & licensing (container-level) ───────────────────────────────────
  roles?: SeedRole[];
  licensing_mode?: 'FREE' | 'TENANT_WIDE' | 'PER_SEAT';
  license_types?: SeedLicenseType[];
  default_seat_count?: number;
  auto_provision?: boolean;
  auto_grant_to_owner?: boolean;

  // Webhook configuration (per-application identity-sync webhooks).
  // Maps 1:1 to Application.webhookUrl / webhookEnabled / webhookEvents.
  //   webhook_url     — single endpoint that receives signed sync events
  //   webhook_enabled — master on/off switch (delivery is skipped when false)
  //   webhook_events  — optional event filter (e.g. ["subject.*", "member.*"]).
  //                     An empty array / omitted means "deliver ALL events".
  webhook_url?: string;
  webhook_enabled?: boolean;
  webhook_events?: string[];
}

export interface SeedTenant {
  id?: string; // Optional explicit ID
  name: string;
  slug: string;
}

export interface SeedMembershipAppRoles {
  [appSlug: string]: string[];
}

export interface SeedMembership {
  tenant: string; // tenant slug
  tenant_role: 'owner' | 'admin' | 'member' | 'billing-admin';
  app_roles?: SeedMembershipAppRoles;
}

export interface SeedUser {
  id?: string; // Optional explicit ID (sub/UUID)
  email: string;
  password: string;
  given_name?: string;
  family_name?: string;
  display_name?: string;
  phone?: string;
  memberships?: SeedMembership[];
}

export interface SeedSubscription {
  tenant: string; // tenant slug
  application: string; // application slug
  license_type: string; // license type slug (must belong to the application)
  quantity: number; // seats purchased (auto-bumped to fit assign_to)
  assign_to?: string[]; // user emails to hand seats to (idempotent)
  current_period_end?: string; // ISO date; defaults to now + 1 year
}

export interface SeedConfig {
  instance?: SeedInstance;
  super_admin?: SeedSuperAdmin;
  applications?: SeedApplication[];
  tenants?: SeedTenant[];
  users?: SeedUser[];
  subscriptions?: SeedSubscription[];
}

/**
 * Reference to a seeded application: its DB id plus the raw (unhashed) client
 * secret if we minted one this run (so we can print it once for the operator).
 */
export interface AppRef {
  id: string;
  clientSecret?: string;
}
