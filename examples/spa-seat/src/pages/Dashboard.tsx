import { useAuth, useAuthVitalClient, useAccessToken } from '@authvital/browser/react';
import {
  getManagementUrls,
  getAccountSettingsUrl,
  getAppPickerUrl,
  getOrgPickerUrl,
} from '@authvital/core';
import { APP_NAME, AV_HOST, AV_CLIENT_ID } from '../config';
import { decodeJwt } from '../lib/jwt';
import { detectTenant, tenantUrl, KNOWN_TENANTS } from '../lib/tenant';
import { capabilitiesFor } from '../lib/roles';
import LicensePanel from '../components/LicensePanel';
import SeatControls from '../components/SeatControls';
import PersonaLegend from '../components/PersonaLegend';

export default function Dashboard() {
  const { isAuthenticated, isLoading, user, logout } = useAuth();
  const client = useAuthVitalClient();
  const accessToken = useAccessToken();
  const tenant = detectTenant();
  const payload = decodeJwt(accessToken);
  const caps = capabilitiesFor(payload);

  return (
    <main className="container">
      <header className="app-header">
        <div>
          <h1>{APP_NAME}</h1>
          <p className="muted">PER_SEAT licensing portal · @authvital/browser · {tenant.host}</p>
        </div>
        {isAuthenticated && <button className="secondary" onClick={() => logout()}>Log out</button>}
      </header>

      <section className="card note">
        <strong>Tenant context.</strong>{' '}
        {tenant.subdomain ? (
          <>Running as tenant <strong>{tenant.subdomain}</strong> (<code>{tenant.host}</code>).</>
        ) : (
          <>Apex host <code>seat.lvh.me</code> — no tenant hint. Pick a tenant:</>
        )}
        <div className="chips" style={{ marginTop: 8 }}>
          {KNOWN_TENANTS.map((t) => (
            <a className="chip link" key={t} href={tenantUrl(t)}>{t}.seat.lvh.me</a>
          ))}
        </div>
      </section>

      {isLoading && <p className="muted">Checking authentication...</p>}

      {!isLoading && !isAuthenticated && (
        <>
          <section className="card">
            <h2>You are signed out</h2>
            <div className="row">
              <button onClick={() => client.login(tenant.subdomain ? { tenantHint: tenant.subdomain } : {})}>Log in</button>
              <button className="secondary" onClick={() => client.signup(tenant.subdomain ? { tenantHint: tenant.subdomain } : {})}>Sign up</button>
            </div>
          </section>
          <PersonaLegend />
        </>
      )}

      {!isLoading && isAuthenticated && payload && (
        <>
          <section className="card">
            <h2>Signed in</h2>
            <p>
              <strong>{user?.name || user?.email}</strong><br />
              <span className="muted">{user?.email}</span><br />
              <span className="muted">tenant_roles: {(payload.tenant_roles ?? []).join(', ') || '(none)'}</span>
            </p>
          </section>

          <LicensePanel payload={payload} />
          <SeatControls caps={caps} tenantId={payload.tenant_id} />

          <section className="card">
            <h2>Manage in the hosted console ↗</h2>
            <p className="muted">
              This portal handles auth &amp; gating; tenant administration lives
              in the AuthVital console. Verified deep-links via{' '}
              <code>@authvital/core</code>.
            </p>
            <div className="chips">
              {payload.tenant_id &&
                (() => {
                  const urls = getManagementUrls({ authVitalHost: AV_HOST, tenantId: payload.tenant_id! });
                  return (
                    <>
                      <a className="chip link" href={urls.members} target="_blank" rel="noreferrer">Manage members ↗</a>
                      <a className="chip link" href={urls.applications} target="_blank" rel="noreferrer">Manage app access ↗</a>
                      <a className="chip link" href={urls.licenses} target="_blank" rel="noreferrer">Licenses ↗</a>
                      <a className="chip link" href={urls.billing} target="_blank" rel="noreferrer">Billing ↗</a>
                      <a className="chip link" href={urls.audit} target="_blank" rel="noreferrer">Audit ↗</a>
                      <a className="chip link" href={urls.sso} target="_blank" rel="noreferrer">SSO ↗</a>
                      <a className="chip link" href={urls.domains} target="_blank" rel="noreferrer">Domains ↗</a>
                    </>
                  );
                })()}
              <a className="chip link" href={getAppPickerUrl(AV_HOST)} target="_blank" rel="noreferrer">Switch app ↗</a>
              <a className="chip link" href={getOrgPickerUrl(AV_HOST, { clientId: AV_CLIENT_ID })} target="_blank" rel="noreferrer">Switch org ↗</a>
              <a className="chip link" href={getAccountSettingsUrl(AV_HOST)} target="_blank" rel="noreferrer">Account settings ↗</a>
            </div>
          </section>

          <PersonaLegend />
        </>
      )}

      <footer className="muted">Routes: <code>/</code> · <code>/auth/callback</code> · <code>/login</code></footer>
    </main>
  );
}
