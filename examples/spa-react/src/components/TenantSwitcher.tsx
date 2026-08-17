import { useState } from 'react';
import { useAuthVitalClient } from '@authvital/browser/react';
import type { EnhancedJwtPayload } from '@authvital/browser';
import { detectTenant, tenantUrl, KNOWN_TENANTS } from '../lib/tenant';

/**
 * Tenant list + switcher.
 *
 * NOTE: the browser SDK has no in-place `setActiveTenant`/`switchTenant` method
 * and no "list my tenants" call. In AuthVital a token is scoped to one tenant,
 * so "switching" == re-authenticating with a `tenant_hint`. We do that two ways:
 *   1. Re-run the OAuth login passing `tenantHint` (client.login supports it).
 *   2. Navigate to the tenant's subdomain (acme.app.lvh.me), whose origin is
 *      enumerated in the seeded allowed_web_origins.
 * The "known tenants" list is derived from the seed rather than fetched.
 */
export default function TenantSwitcher({ payload }: { payload: EnhancedJwtPayload }) {
  const client = useAuthVitalClient();
  const current = detectTenant();
  const [hint, setHint] = useState(current.subdomain ?? '');

  const activeTenant = payload.tenant_subdomain ?? current.subdomain ?? '(none)';

  const switchViaLogin = (tenant: string) => {
    // Re-auth with a tenant hint — the SDK forwards it as `tenant_hint` to
    // /oauth/authorize so the IdP can scope the new token to that tenant.
    client.login({ tenantHint: tenant });
  };

  return (
    <section className="card">
      <h2>Tenant context &amp; switcher</h2>
      <p>
        Active tenant (from JWT): <strong>{activeTenant}</strong>
        {payload.tenant_id && <span className="muted"> · {payload.tenant_id}</span>}
      </p>

      <div className="row">
        <label>
          tenant_hint:&nbsp;
          <input
            value={hint}
            onChange={(e) => setHint(e.target.value.trim())}
            placeholder="acme"
          />
        </label>
        <button disabled={!hint} onClick={() => switchViaLogin(hint)}>
          Re-login with hint
        </button>
      </div>

      <p className="muted" style={{ marginTop: 12 }}>Jump to a tenant subdomain:</p>
      <div className="chips">
        {KNOWN_TENANTS.map((t) => (
          <a className="chip link" key={t} href={tenantUrl(t)}>{t}.app.lvh.me</a>
        ))}
        <a className="chip link" href={tenantUrl(null)}>app.lvh.me (apex)</a>
      </div>
    </section>
  );
}
