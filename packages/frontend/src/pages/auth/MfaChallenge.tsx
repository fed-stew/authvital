import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

interface LocationState {
  challengeToken: string;
  redirectUri?: string;
  clientId?: string;
}

/**
 * MFA Challenge page for regular users during OAuth login
 * 
 * Shown after password is verified but MFA is required.
 * After successful verification, continues the OAuth flow.
 */
export default function MfaChallenge() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState | null;
  
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Get challenge data from state or sessionStorage (in case of page refresh)
  const [challengeData, setChallengeData] = useState<LocationState | null>(null);

  useEffect(() => {
    if (state?.challengeToken) {
      setChallengeData(state);
      // Store in sessionStorage for page refresh resilience
      sessionStorage.setItem('mfa_challenge', JSON.stringify(state));
    } else {
      // Try to restore from sessionStorage
      const stored = sessionStorage.getItem('mfa_challenge');
      if (stored) {
        setChallengeData(JSON.parse(stored));
      }
    }
  }, [state]);

  // No challenge data = shouldn't be here
  if (!challengeData?.challengeToken && !state?.challengeToken) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-xl p-8 max-w-sm w-full text-center">
          <p className="text-gray-600 mb-4">Session expired. Please log in again.</p>
          <button
            onClick={() => navigate('/auth/login')}
            className="text-indigo-600 hover:text-indigo-700 font-medium"
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data = challengeData || state;
    if (!data?.challengeToken || (code.length !== 6 && !code.includes('-'))) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/mfa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          challengeToken: data.challengeToken,
          code: code.trim(),
          redirectUri: data.redirectUri,
          clientId: data.clientId,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || 'Invalid verification code');
      }

      // Clear stored challenge data
      sessionStorage.removeItem('mfa_challenge');

      // If there's a redirect URL in the response, go there
      if (result.redirectUrl) {
        window.location.href = result.redirectUrl;
      } else if (data.redirectUri) {
        // Continue OAuth flow
        window.location.href = data.redirectUri;
      } else {
        // Fallback to app picker
        navigate('/auth/app-picker');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Verification failed';
      setError(message);
      setCode('');
    } finally {
      setIsSubmitting(false);
    }
  }

  const isBackupCodeFormat = code.includes('-') || code.length === 8;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl p-8 max-w-sm w-full">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Two-Factor Authentication</h1>
          <p className="text-gray-500 mt-2">
            {isBackupCodeFormat 
              ? 'Enter your backup code' 
              : 'Enter the 6-digit code from your authenticator app'}
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="code" className="sr-only">Verification Code</label>
            <input
              id="code"
              type="text"
              inputMode={isBackupCodeFormat ? "text" : "numeric"}
              maxLength={isBackupCodeFormat ? 9 : 6}
              placeholder={isBackupCodeFormat ? "XXXX-XXXX" : "000000"}
              value={code}
              onChange={(e) => {
                const val = e.target.value;
                if (/^[0-9A-Za-z-]*$/.test(val)) {
                  setCode(val.toUpperCase());
                }
              }}
              className="w-full px-4 py-3 text-center text-2xl tracking-widest font-mono border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              autoFocus
              autoComplete="one-time-code"
            />
          </div>

          <button
            type="submit"
            disabled={(!isBackupCodeFormat && code.length !== 6) || isSubmitting}
            className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-medium rounded-lg transition-colors flex items-center justify-center"
          >
            {isSubmitting ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Verifying...
              </>
            ) : 'Verify'}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-gray-100 text-center">
          <button
            type="button"
            onClick={() => setCode('')}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Lost your device? Use a backup code
          </button>
        </div>

        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => {
              sessionStorage.removeItem('mfa_challenge');
              navigate('/auth/login');
            }}
            className="text-sm text-indigo-600 hover:text-indigo-700"
          >
            ← Back to login
          </button>
        </div>
      </div>
    </div>
  );
}
