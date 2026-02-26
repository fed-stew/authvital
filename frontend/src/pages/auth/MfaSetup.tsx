import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

interface MfaSetupData {
  secret: string;
  qrCodeDataUrl: string;
  backupCodes: string[];
}

/**
 * MFA Setup page for regular users
 * 
 * Flow:
 * 1. Call /api/auth/mfa/setup to get QR code and backup codes
 * 2. User scans QR with authenticator app
 * 3. User enters first TOTP code to verify
 * 4. Call /api/auth/mfa/enable to complete setup
 */
export default function MfaSetup() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get('returnTo') || '/';
  
  const [step, setStep] = useState<'loading' | 'scan' | 'verify' | 'backup' | 'error'>('loading');
  const [setupData, setSetupData] = useState<MfaSetupData | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copiedBackupCodes, setCopiedBackupCodes] = useState(false);

  useEffect(() => {
    startSetup();
  }, []);

  async function startSetup() {
    try {
      setError(null);
      const response = await fetch('/api/auth/mfa/setup', {
        method: 'POST',
        credentials: 'include',
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to start MFA setup');
      }
      
      const data = await response.json();
      setSetupData(data);
      setStep('scan');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start MFA setup');
      setStep('error');
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!setupData || !verificationCode.trim()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/mfa/enable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          secret: setupData.secret,
          code: verificationCode.trim(),
          backupCodes: setupData.backupCodes,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Invalid verification code');
      }

      setStep('backup');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setIsSubmitting(false);
    }
  }

  function copyBackupCodes() {
    if (!setupData) return;
    const codesText = setupData.backupCodes.join('\n');
    navigator.clipboard.writeText(codesText);
    setCopiedBackupCodes(true);
    setTimeout(() => setCopiedBackupCodes(false), 2000);
  }

  function downloadBackupCodes() {
    if (!setupData) return;
    const codesText = `MFA Backup Codes\n${'='.repeat(30)}\n\nStore these codes in a safe place.\nEach code can only be used once.\n\n${setupData.backupCodes.join('\n')}\n\nGenerated: ${new Date().toISOString()}`;
    const blob = new Blob([codesText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mfa-backup-codes.txt';
    a.click();
    URL.revokeObjectURL(url);
  }

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
        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            {step === 'backup' ? 'MFA Enabled!' : 'Set Up Two-Factor Authentication'}
          </h1>
          <p className="text-gray-500 mt-2">
            {step === 'scan' && 'Scan the QR code with your authenticator app'}
            {step === 'verify' && 'Enter the 6-digit code from your app'}
            {step === 'backup' && 'Save your backup codes'}
            {step === 'error' && 'Something went wrong'}
          </p>
        </div>

        {error && step !== 'error' && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
            {error}
          </div>
        )}

        {/* Loading */}
        {step === 'loading' && (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
          </div>
        )}

        {/* Error */}
        {step === 'error' && (
          <div className="text-center py-6">
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-600">
              {error || 'Failed to initialize MFA setup'}
            </div>
            <button
              onClick={startSetup}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Scan QR Code */}
        {step === 'scan' && setupData && (
          <div className="space-y-6">
            <div className="flex justify-center">
              <img 
                src={setupData.qrCodeDataUrl} 
                alt="MFA QR Code" 
                className="w-48 h-48 border-4 border-gray-100 rounded-xl"
              />
            </div>
            
            <div className="text-center">
              <p className="text-xs text-gray-500 mb-2">Can't scan? Enter this code manually:</p>
              <code className="text-xs bg-gray-100 px-3 py-2 rounded-lg font-mono break-all block">
                {setupData.secret}
              </code>
            </div>

            <button 
              onClick={() => setStep('verify')} 
              className="w-full py-3 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors"
            >
              I've scanned the code →
            </button>
          </div>
        )}

        {/* Verify Code */}
        {step === 'verify' && (
          <form onSubmit={handleVerify} className="space-y-4">
            <div>
              <label htmlFor="code" className="block text-sm font-medium text-gray-700 mb-1">
                Verification Code
              </label>
              <input
                id="code"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="000000"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                className="w-full px-4 py-3 text-center text-2xl tracking-widest font-mono border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                autoFocus
              />
              <p className="text-xs text-gray-500 mt-2 text-center">
                Enter the 6-digit code from your authenticator app
              </p>
            </div>

            <div className="flex gap-3">
              <button 
                type="button" 
                onClick={() => setStep('scan')}
                className="flex-1 py-3 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
              >
                ← Back
              </button>
              <button 
                type="submit" 
                className="flex-1 py-3 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors disabled:bg-indigo-400"
                disabled={verificationCode.length !== 6 || isSubmitting}
              >
                {isSubmitting ? 'Verifying...' : 'Verify'}
              </button>
            </div>
          </form>
        )}

        {/* Backup Codes */}
        {step === 'backup' && setupData && (
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <p className="text-sm text-amber-800">
                <strong>⚠️ Important:</strong> Save these backup codes in a secure location. 
                You'll need them if you lose access to your authenticator app.
              </p>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <div className="grid grid-cols-2 gap-2 font-mono text-sm">
                {setupData.backupCodes.map((code, i) => (
                  <div key={i} className="bg-white px-3 py-2 rounded border text-center">
                    {code}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <button 
                type="button" 
                onClick={copyBackupCodes}
                className="flex-1 py-2 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
              >
                {copiedBackupCodes ? '✓ Copied!' : '📋 Copy'}
              </button>
              <button 
                type="button" 
                onClick={downloadBackupCodes}
                className="flex-1 py-2 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
              >
                📥 Download
              </button>
            </div>

            <button 
              onClick={handleComplete} 
              className="w-full py-3 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 transition-colors"
            >
              ✓ I've saved my backup codes
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
