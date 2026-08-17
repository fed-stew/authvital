import { useState } from 'react';
import type { EnhancedJwtPayload } from '@authvital/browser';
import { formatEpoch } from '../lib/jwt';

function Chips({ items }: { items?: string[] }) {
  if (!items || items.length === 0) return <span className="muted">— none —</span>;
  return (
    <span className="chips">
      {items.map((it) => (
        <span className="chip" key={it}>{it}</span>
      ))}
    </span>
  );
}

/**
 * Decoded-claims panel: surfaces the AuthVital-specific authorization claims
 * (app_roles / app_permissions / tenant_roles / tenant_permissions) plus the
 * license block, straight from the access-token JWT.
 */
export default function ClaimsPanel({ payload }: { payload: EnhancedJwtPayload }) {
  const [showRaw, setShowRaw] = useState(false);
  const license = payload.license;

  return (
    <section className="card">
      <h2>Decoded JWT claims</h2>
      <dl className="claims">
        <dt>app_roles</dt>
        <dd><Chips items={payload.app_roles} /></dd>

        <dt>app_permissions</dt>
        <dd><Chips items={payload.app_permissions} /></dd>

        <dt>tenant_roles</dt>
        <dd><Chips items={payload.tenant_roles} /></dd>

        <dt>tenant_permissions</dt>
        <dd><Chips items={payload.tenant_permissions} /></dd>

        <dt>tenant</dt>
        <dd>
          {payload.tenant_subdomain
            ? <><code>{payload.tenant_subdomain}</code> <span className="muted">({payload.tenant_id})</span></>
            : <span className="muted">— token not tenant-scoped —</span>}
        </dd>

        <dt>license</dt>
        <dd>
          {license
            ? (
              <div>
                <strong>{license.name}</strong> <span className="muted">({license.type})</span>
                <div style={{ marginTop: 4 }}>features: <Chips items={license.features} /></div>
              </div>
            )
            : <span className="muted">— no license on this token —</span>}
        </dd>

        <dt>issued / expires</dt>
        <dd className="muted">{formatEpoch(payload.iat)} → {formatEpoch(payload.exp)}</dd>
      </dl>

      <button className="link-btn" onClick={() => setShowRaw((v) => !v)}>
        {showRaw ? 'Hide' : 'Show'} raw payload
      </button>
      {showRaw && <pre className="raw">{JSON.stringify(payload, null, 2)}</pre>}
    </section>
  );
}
