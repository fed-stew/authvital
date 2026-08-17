import { useEffect } from 'react';
import { useAuth, useAuthVitalClient } from '@authvital/browser/react';
import { detectTenant } from '../lib/tenant';

/** IdP-initiated login landing; auto-starts OAuth with the subdomain tenant hint. */
export default function Login() {
  const { isAuthenticated, isLoading } = useAuth();
  const client = useAuthVitalClient();
  const { subdomain } = detectTenant();

  useEffect(() => {
    if (isLoading) return;
    if (isAuthenticated) {
      window.location.replace('/');
      return;
    }
    client.login(subdomain ? { tenantHint: subdomain } : {});
  }, [isAuthenticated, isLoading, client, subdomain]);

  return (
    <main className="container narrow">
      <h1>Redirecting to sign in...</h1>
      <p className="muted">
        Starting the OAuth flow{subdomain ? <> for tenant <strong>{subdomain}</strong></> : ''}.
      </p>
    </main>
  );
}
