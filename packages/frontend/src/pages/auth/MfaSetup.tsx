import { useNavigate, useSearchParams } from 'react-router-dom';
import { MfaSetupWizard } from '../../components/MfaSetupWizard';

/**
 * MFA Setup page for regular users
 *
 * Flow (implemented by the shared MfaSetupWizard):
 * 1. Call /api/auth/mfa/setup to get QR code and backup codes
 * 2. User scans QR with authenticator app
 * 3. User enters first TOTP code to verify
 * 4. Call /api/auth/mfa/enable to complete setup
 */
export default function MfaSetup() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get('returnTo') || '/';

  function handleComplete() {
    // Navigate to return URL or home
    if (returnTo.startsWith('/')) {
      navigate(returnTo);
    } else {
      window.location.href = returnTo;
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl p-8 max-w-md w-full">
        <MfaSetupWizard onComplete={handleComplete} />
      </div>
    </div>
  );
}
