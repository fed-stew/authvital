import { useState } from 'react';
import { getManagementUrls } from '@authvital/core';
import type { SeatCapabilities } from '../lib/roles';
import { AV_HOST } from '../config';

/**
 * Licensing-portal controls, rendered per capability tier so a UAT tester can
 * visually confirm what each persona is allowed to see/do.
 *
 * HOSTED-FIRST: seat assignment and inventory provisioning are done in the
 * AuthVital hosted console (`/tenant/:tenantId/licenses` and `/billing`), which
 * is the canonical tenant-admin UI. The browser SDK's job here is auth + claims
 * + GATING; management is a deep-link into the console (built with the verified
 * `@authvital/core` helper `getManagementUrls`). We gate the deep-links by the
 * same capability tier the console will enforce server-side, so the UAT tester
 * sees the honest "what can this persona reach" story.
 */
export default function SeatControls({
  caps,
  tenantId,
}: {
  caps: SeatCapabilities;
  tenantId?: string;
}) {
  const [note, setNote] = useState<string | null>(null);
  const urls = tenantId
    ? getManagementUrls({ authVitalHost: AV_HOST, tenantId })
    : null;

  return (
    <section className="card">
      <h2>Seat management</h2>
      <p>
        Capability tier: <strong>{caps.tier}</strong>
      </p>

      <div className="row">
        {/* Everyone in-tenant can view. */}
        <button
          className="secondary"
          disabled={!caps.canView}
          onClick={() => setNote('Viewing current seats (read-only, allowed for all in-tenant roles).')}
        >
          View seats
        </button>

        {caps.canManageSeats && urls && (
          <a className="chip link" href={urls.licenses} target="_blank" rel="noreferrer">
            Manage seats in console ↗
          </a>
        )}

        {caps.canProvision && urls && (
          <a className="chip link" href={urls.billing} target="_blank" rel="noreferrer">
            Provision inventory / billing ↗
          </a>
        )}
      </div>

      <ul className="muted small" style={{ marginTop: 12 }}>
        <li>View seats: {caps.canView ? 'visible' : 'hidden'}</li>
        <li>Manage seats: {caps.canManageSeats ? 'deep-link to console licenses' : 'hidden'}</li>
        <li>Provision inventory: {caps.canProvision ? 'deep-link to console billing' : 'hidden'}</li>
      </ul>

      {!tenantId && (
        <p className="muted small" style={{ marginTop: 8 }}>
          No <code>tenant_id</code> on the token yet — sign in within a tenant to
          get the console deep-links.
        </p>
      )}

      {note && <div className="card note" style={{ marginTop: 12 }}>{note}</div>}
    </section>
  );
}
