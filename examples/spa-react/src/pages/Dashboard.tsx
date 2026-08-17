import { useAuth, useAuthVitalClient, useAccessToken } from '@authvital/browser/react';
import { APP_NAME } from '../config';
import { decodeJwt } from '../lib/jwt';
import { detectTenant } from '../lib/tenant';
import ClaimsPanel from '../components/ClaimsPanel';
import TenantSwitcher from '../components/TenantSwitcher';
import AdminZone from '../components/AdminZone';

export default function Dashboard() {
  const { isAuthenticated, isLoading, user, logout } = useAuth();
  const client = useAuthVitalClient();
  const accessToken = useAccessToken();
  const tenant = detectTenant();
  const payload = decodeJwt(accessToken);

  return (
    <main className="container">
      <header className="app-header">
        <div>
          <h1>{APP_NAME}</h1>
          <p className="muted">SPA · @authvital/browser · {tenant.host}</p>
        </div>
        {isAuthenticated && (
          <button className="secondary" onClick={() => logout()}>Log out</button>
        )}
      </header>

      <section className="card note">
        <strong>Subdomain demo.</strong>{' '}
        {tenant.subdomain ? (
          <>You are on <code>{tenant.subdomain}.app.lvh.me</code> — the app runs in the{' '}
          <strong>{tenant.subdomain}</strong> tenant context and passes{' '}
          <code>tenant_hint={tenant.subdomain}</code> into login.</>
        ) : (
          <>You are on the apex <code>app.lvh.me</code> (no tenant hint). Visit e.g.{' '}
          <code>acme.app.lvh.me</code> to run inside a specific tenant.</>
        )}
      </section>

      {isLoading && <p className="muted">Checking authentication...</p>}

      {!isLoading && !isAuthenticated && (
        <section className="card">
          <h2>You are signed out</h2>
          <p className="muted">Sign in against the IdP at auth.lvh.me.</p>
          <div className="row">
            <button onClick={() => client.login(tenant.subdomain ? { tenantHint: tenant.subdomain } : {})}>
              Log in
            </button>
            <button className="secondary" onClick={() => client.signup(tenant.subdomain ? { tenantHint: tenant.subdomain } : {})}>
              Sign up
            </button>
          </div>
        </section>
      )}

      {!isLoading && isAuthenticated && (
        <>
          <section className="card">
            <h2>Signed in</h2>
            <p>
              <strong>{user?.name || user?.givenName || user?.email}</strong>
              <br />
              <span className="muted">{user?.email}{user?.emailVerified ? ' (verified)' : ''}</span>
            </p>
          </section>

          {payload ? (
            <>
              <ClaimsPanel payload={payload} />
              <TenantSwitcher payload={payload} />
              <AdminZone payload={payload} />
            </>
          ) : (
            <section className="card error">
              Could not decode the access token for display.
            </section>
          )}
        </>
      )}

      <footer className="muted">
        Routes: <code>/</code> · <code>/auth/callback</code> · <code>/login</code> · <code>/invite</code>
      </footer>
    </main>
  );
}
