import { useAuthCallback } from '@authvital/browser/react';
import { useNavigate } from 'react-router-dom';

/**
 * OAuth return handler for /auth/callback. useAuthCallback() exchanges the
 * authorization code for tokens (validating the CSRF state param) exactly once
 * on mount, then we replace the URL back to "/".
 */
export default function Callback() {
  const navigate = useNavigate();
  const { isProcessing, error } = useAuthCallback({
    onSuccess: () => navigate('/', { replace: true }),
  });

  return (
    <main className="container narrow">
      <h1>Signing you in...</h1>
      {isProcessing && <p className="muted">Exchanging authorization code for tokens.</p>}
      {error && (
        <div className="card error">
          <strong>Login failed:</strong> {error.code}
          {error.description ? ` — ${error.description}` : ''}
          <p><a href="/">Back to dashboard</a></p>
        </div>
      )}
    </main>
  );
}
