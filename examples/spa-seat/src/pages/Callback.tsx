import { useAuthCallback } from '@authvital/browser/react';
import { useNavigate } from 'react-router-dom';

/** OAuth return handler for /auth/callback. */
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
          <p><a href="/">Back to portal</a></p>
        </div>
      )}
    </main>
  );
}
