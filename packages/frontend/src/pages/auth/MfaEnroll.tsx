import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { MfaSetupWizard } from '../../components/MfaSetupWizard';

interface EnrollmentContext {
  tenantName: string;
  tenantPolicy: string;
  gracePeriodEndsAt: string | null;
  userMfaEnabled: boolean;
  requiresSetup: boolean;
}

type Phase = 'loading' | 'wizard' | 'redirecting' | 'invalid' | 'blocked';

/**
 * MFA Enrollment interrupt page (/auth/mfa/enroll?resume=<token>)
 *
 * The /oauth/authorize flow 302s here when the tenant's MFA policy blocks
 * token minting. The single-use resume token replays the original authorize
 * request once the user has enrolled (or skipped, if within grace).
 *
 * Flow:
 * 1. GET /oauth/mfa-enrollment/context to render the tenant policy banner
 * 2. Already enrolled -> immediately redeem the token and follow the redirect
 * 3. Otherwise run the shared MFA setup wizard, then redeem
 * 4. Grace variant: a "Remind me later" skip redeems without enrolling
 */
export default function MfaEnroll() {
  const [searchParams] = useSearchParams();
  const resume = searchParams.get('resume');

  const [phase, setPhase] = useState<Phase>('loading');
  const [context, setContext] = useState<EnrollmentContext | null>(null);
  const [isResuming, setIsResuming] = useState(false);
  const startedRef = useRef(false);

  const withinGrace =
    !!context?.gracePeriodEndsAt &&
    new Date(context.gracePeriodEndsAt) > new Date();

  const doResume = useCallback(async () => {
    if (!resume) return;
    setIsResuming(true);
    setPhase('redirecting');

    try {
      const response = await fetch('/oauth/mfa-enrollment/resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ resume }),
      });

      if (response.ok) {
        const data = await response.json();
        window.location.href = data.redirectUrl;
        return;
      }

      // 403 = still non-compliant and out of grace; anything else means the
      // token is expired/consumed/invalid.
      setPhase(response.status === 403 ? 'blocked' : 'invalid');
    } catch {
      setPhase('invalid');
    } finally {
      setIsResuming(false);
    }
  }, [resume]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    if (!resume) {
      setPhase('invalid');
      return;
    }

    (async () => {
      try {
        const response = await fetch(
          `/oauth/mfa-enrollment/context?resume=${encodeURIComponent(resume)}`,
          { credentials: 'include' },
        );

        if (!response.ok) {
          setPhase('invalid');
          return;
        }

        const ctx: EnrollmentContext = await response.json();
        setContext(ctx);

        if (ctx.userMfaEnabled) {
          // Already enrolled - no wizard needed, just replay the flow.
          await doResume();
        } else {
          setPhase('wizard');
        }
      } catch {
        setPhase('invalid');
      }
    })();
  }, [resume, doResume]);

  const banner = context && (
    <div className="mb-6 p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
      <p className="text-sm text-indigo-800">
        <strong>{context.tenantName}</strong> requires two-factor authentication
      </p>
      {withinGrace && context.gracePeriodEndsAt && (
        <p className="text-xs text-indigo-600 mt-1">
          You can skip until{' '}
          {new Date(context.gracePeriodEndsAt).toLocaleDateString()}
        </p>
      )}
    </div>
  );

  const footer = withinGrace ? (
    <div className="mt-4 text-center">
      <button
        type="button"
        onClick={doResume}
        disabled={isResuming}
        className="text-sm text-gray-500 hover:text-gray-700 underline disabled:opacity-50"
      >
        Remind me later
      </button>
    </div>
  ) : undefined;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl p-8 max-w-md w-full">
        {phase === 'loading' && (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
          </div>
        )}

        {phase === 'redirecting' && (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 mx-auto mb-4"></div>
            <p className="text-gray-500">Signing you in...</p>
          </div>
        )}

        {phase === 'wizard' && (
          <MfaSetupWizard onComplete={doResume} banner={banner} footer={footer} />
        )}

        {phase === 'blocked' && context && (
          <div className="text-center py-6">
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-600">
              Two-factor authentication is required to access{' '}
              <strong>{context.tenantName}</strong>. Please enable MFA to
              continue.
            </div>
            <Link to="/" className="text-indigo-600 hover:text-indigo-700 font-medium">
              Return to sign-in
            </Link>
          </div>
        )}

        {phase === 'invalid' && (
          <div className="text-center py-6">
            <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-800">
              This enrollment link is invalid, has expired, or was already
              used. Please sign in again to restart.
            </div>
            <Link to="/" className="text-indigo-600 hover:text-indigo-700 font-medium">
              Return to sign-in
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
