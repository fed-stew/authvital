import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button, Card, Input, Label } from '../../components/ui';
import { superAdminApi } from '../../lib/api';
import { useAdmin } from '@/contexts/AdminContext';

interface LocationState {
  challengeToken: string;
  requiresSetup?: boolean;
}

/**
 * MFA Verification page for Super Admin login
 *
 * Shown after password is verified but MFA is required.
 * Receives challengeToken from login response via location state.
 */
export default function MfaVerify() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState | null;

  const { refresh } = useAdmin();

  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // If user needs to set up MFA first, redirect to setup
  if (state?.requiresSetup) {
    // Store the challenge token for after setup
    sessionStorage.setItem('mfa_challenge_token', state.challengeToken);
    navigate('/admin/mfa/setup', { replace: true });
    return null;
  }

  // No challenge token = shouldn't be here
  if (!state?.challengeToken) {
    navigate('/admin/login', { replace: true });
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!state?.challengeToken) return;
    if (code.length !== 6 && !code.includes('-')) return; // 6 digits or backup code format

    setIsSubmitting(true);
    setError(null);

    try {
      await superAdminApi.mfaVerify(state.challengeToken, code.trim());
      // Refresh admin context to recognize the new session
      await refresh();
      // Cookie is set by the response, navigate to dashboard
      navigate('/admin', { replace: true });
    } catch (err: unknown) {
      // Extract error message - check axios response.data.message first
      const axiosMessage = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      const message = axiosMessage || 'Invalid code. Please try again.';
      setError(message);
      setCode('');
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleUseBackupCode() {
    // Clear the input to let them enter a backup code
    setCode('');
    setError(null);
  }

  const isBackupCodeFormat = code.includes('-') || code.length === 8;

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center p-4">
      <Card className="w-full max-w-sm p-6 shadow-xl">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-6 h-6 text-indigo-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
              />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-gray-900">Two-Factor Authentication</h1>
          <p className="text-sm text-gray-500 mt-1">
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
            <Label htmlFor="code" className="sr-only">
              Verification Code
            </Label>
            <Input
              id="code"
              type="text"
              inputMode={isBackupCodeFormat ? 'text' : 'numeric'}
              maxLength={isBackupCodeFormat ? 9 : 6}
              placeholder={isBackupCodeFormat ? 'XXXX-XXXX' : '000000'}
              value={code}
              onChange={(e) => {
                const val = e.target.value;
                // Allow digits, and hyphens for backup codes
                if (/^[0-9A-Za-z-]*$/.test(val)) {
                  setCode(val.toUpperCase());
                }
              }}
              className="text-center text-2xl tracking-widest font-mono"
              autoFocus
              autoComplete="one-time-code"
            />
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={(!isBackupCodeFormat && code.length !== 6) || isSubmitting}
          >
            {isSubmitting ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                Verifying...
              </span>
            ) : (
              'Verify'
            )}
          </Button>
        </form>

        <div className="mt-6 pt-4 border-t border-gray-100">
          <button
            type="button"
            onClick={handleUseBackupCode}
            className="w-full text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            Lost your device? Use a backup code
          </button>
        </div>

        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => navigate('/admin/login')}
            className="text-sm text-indigo-600 hover:text-indigo-700"
          >
            ← Back to login
          </button>
        </div>
      </Card>
    </div>
  );
}
