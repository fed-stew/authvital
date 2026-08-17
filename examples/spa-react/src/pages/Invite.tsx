import { useMemo } from 'react';
import { useAuthVitalClient } from '@authvital/browser/react';
import { detectTenant } from '../lib/tenant';

/**
 * Invitation accept flow at /invite?token=...
 *
 * NOTE: the browser SDK does not expose a dedicated `useInvitation` hook or a
 * `fetch()/acceptAndLogin()` pair. Invitation acceptance is folded into the
 * OAuth login: client.login({ inviteToken }) forwards `invite_token` to
 * /oauth/authorize, and the IdP accepts the invite as part of authenticating
 * (i.e. "accept and log in"). We read ?token= from the URL and drive that flow.
 */
export default function Invite() {
  const client = useAuthVitalClient();
  const { subdomain } = detectTenant();

  const token = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('token');
  }, []);

  const accept = () => {
    if (!token) return;
    client.login({
      inviteToken: token,
      ...(subdomain ? { tenantHint: subdomain } : {}),
    });
  };

  return (
    <main className="container narrow">
      <h1>Accept invitation</h1>
      {token ? (
        <div className="card">
          <p>You have an invitation token:</p>
          <pre className="raw">{token}</pre>
          <p className="muted">
            Accepting will start an OAuth login carrying this token; the IdP joins
            you to the tenant and logs you in.
          </p>
          <button onClick={accept}>Accept &amp; sign in</button>
        </div>
      ) : (
        <div className="card error">
          <strong>No invitation token.</strong>
          <p className="muted">
            Open this page with <code>?token=YOUR_INVITE_TOKEN</code> in the URL.
          </p>
          <p><a href="/">Back to dashboard</a></p>
        </div>
      )}
    </main>
  );
}
