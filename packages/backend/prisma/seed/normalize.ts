// =============================================================================
// APPLICATION NORMALIZATION — container/credential shape resolution
// =============================================================================
// One place that turns a raw `SeedApplication` (which may be written in EITHER
// the new nested-credential shape OR the old flat single-credential shape) into
// a clean list of `SeedCredential`s. Shared by the applications + m2m-grants
// seeders so the compat rules live in exactly one spot (DRY).

import { SeedApplication, SeedCredential } from './types';

/**
 * Resolve an application's credentials, supporting BOTH shapes:
 *
 *   NEW (container model — preferred):
 *     - name: "Web BFF"
 *       credentials:            # or `clients:` (alias)
 *         - { type: SPA, client_id: ... , redirect_uris: [...] }
 *         - { type: MACHINE, client_id: ..., client_secret: ... }
 *
 *   OLD (flat — backward-compat):
 *     - name: "Backend API Worker"
 *       type: MACHINE
 *       client_id: ...
 *       client_secret: ...
 *   → normalized into a SINGLE-credential container so old seed files still work.
 *
 * Invariants enforced (matching the DB `@@unique([applicationId, type])`):
 *   - at least one credential
 *   - at most ONE SPA + at most ONE MACHINE per app
 *   - SPA credentials must NOT carry a client_secret (public PKCE client)
 */
export function normalizeCredentials(app: SeedApplication): SeedCredential[] {
  const nested = app.credentials ?? app.clients;

  const credentials: SeedCredential[] = nested?.length
    ? nested.map((c) => coerceType(c))
    : [flatToCredential(app)];

  assertCredentialInvariants(app.slug, credentials);
  return credentials;
}

/** Coerce a nested credential's type (anything not MACHINE is treated as SPA). */
function coerceType(cred: SeedCredential): SeedCredential {
  return { ...cred, type: cred.type === 'MACHINE' ? 'MACHINE' : 'SPA' };
}

/**
 * BACKWARD-COMPAT: synthesize a single credential from the old flat app-level
 * OAuth fields. Type defaults to SPA (the historical default) when omitted.
 */
function flatToCredential(app: SeedApplication): SeedCredential {
  return {
    type: app.type === 'MACHINE' ? 'MACHINE' : 'SPA',
    client_id: app.client_id,
    client_secret: app.client_secret,
    redirect_uris: app.redirect_uris,
    post_logout_redirect_uris: app.post_logout_redirect_uris,
    allowed_web_origins: app.allowed_web_origins,
    initiate_login_uri: app.initiate_login_uri,
    access_token_ttl: app.access_token_ttl,
    refresh_token_ttl: app.refresh_token_ttl,
    m2m_trusted_all_tenants: app.m2m_trusted_all_tenants,
    // Old flat key `allowed_scopes` -> new credential key `m2m_allowed_scopes`.
    m2m_allowed_scopes: app.allowed_scopes,
    m2m_tenant_grants: app.m2m_tenant_grants,
  };
}

function assertCredentialInvariants(slug: string, creds: SeedCredential[]): void {
  if (creds.length === 0) {
    throw new Error(`Application "${slug}" declares no credentials.`);
  }

  const spa = creds.filter((c) => c.type === 'SPA').length;
  const machine = creds.filter((c) => c.type === 'MACHINE').length;
  if (spa > 1 || machine > 1) {
    throw new Error(
      `Application "${slug}" declares ${spa} SPA + ${machine} MACHINE credential(s). ` +
        `At most one of each type is allowed per app container ` +
        `(DB constraint: @@unique([applicationId, type])).`,
    );
  }

  for (const cred of creds) {
    if (cred.type === 'SPA' && cred.client_secret) {
      throw new Error(
        `Application "${slug}" has an SPA credential with a client_secret. ` +
          `SPA is a public PKCE client and must NOT define a secret ` +
          `(use a MACHINE credential for confidential/M2M flows).`,
      );
    }
  }
}

/** Convenience: the (optional) MACHINE credential of an app, if any. */
export function machineCredential(app: SeedApplication): SeedCredential | undefined {
  return normalizeCredentials(app).find((c) => c.type === 'MACHINE');
}
