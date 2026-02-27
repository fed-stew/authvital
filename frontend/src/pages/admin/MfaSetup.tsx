import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Input, Label } from '../../components/ui';
import { superAdminApi } from '../../lib/api';

interface MfaSetupData {
  secret: string;
  qrCodeDataUrl: string;
  backupCodes: string[];
}

/**
 * MFA Setup page for Super Admins
 *
 * Flow:
 * 1. Call /super-admin/mfa/setup to get QR code and backup codes
 * 2. User scans QR with authenticator app
 * 3. User enters first TOTP code to verify
 * 4. Call /super-admin/mfa/enable to complete setup
 */
export default function MfaSetup() {
  const navigate = useNavigate();

  const [step, setStep] = useState<'loading' | 'scan' | 'verify' | 'backup' | 'complete'>('loading');
  const [setupData, setSetupData] = useState<MfaSetupData | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copiedBackupCodes, setCopiedBackupCodes] = useState(false);

  // Start MFA setup on mount
  useEffect(() => {
    startSetup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startSetup() {
    try {
      setError(null);
      const data = await superAdminApi.mfaSetup();
      setSetupData(data);
      setStep('scan');
    } catch (err: unknown) {
      const errorMessage =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      setError(errorMessage || 'Failed to start MFA setup');
      setStep('scan'); // Show error state
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!setupData || !verificationCode.trim()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      await superAdminApi.mfaEnable({
        secret: setupData.secret,
        code: verificationCode.trim(),
        backupCodes: setupData.backupCodes,
      });
      setStep('backup');
    } catch (err: unknown) {
      const errorMessage =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      setError(errorMessage || 'Invalid verification code. Please try again.');
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
    const codesText = `AuthVital MFA Backup Codes\n${'='.repeat(30)}\n\nStore these codes in a safe place. Each code can only be used once.\n\n${setupData.backupCodes.join('\n')}\n\nGenerated: ${new Date().toISOString()}`;
    const blob = new Blob([codesText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'authvital-backup-codes.txt';
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleComplete() {
    navigate('/admin/settings');
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-6">
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
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-gray-900">
            {step === 'backup' || step === 'complete'
              ? 'MFA Enabled!'
              : 'Set Up Two-Factor Authentication'}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {step === 'scan' && 'Scan the QR code with your authenticator app'}
            {step === 'verify' && 'Enter the 6-digit code from your app'}
            {step === 'backup' && 'Save your backup codes'}
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
            {error}
          </div>
        )}

        {/* Step: Scan QR Code */}
        {step === 'scan' && setupData && (
          <div className="space-y-6">
            <div className="flex justify-center">
              <img
                src={setupData.qrCodeDataUrl}
                alt="MFA QR Code"
                className="w-48 h-48 border rounded-lg"
              />
            </div>

            <div className="text-center">
              <p className="text-xs text-gray-500 mb-2">Can't scan? Enter this code manually:</p>
              <code className="text-xs bg-gray-100 px-2 py-1 rounded font-mono break-all">
                {setupData.secret}
              </code>
            </div>

            <Button onClick={() => setStep('verify')} className="w-full">
              I've scanned the code
            </Button>
          </div>
        )}

        {/* Step: Verify Code */}
        {step === 'verify' && (
          <form onSubmit={handleVerify} className="space-y-4">
            <div>
              <Label htmlFor="code">Verification Code</Label>
              <Input
                id="code"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="000000"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                className="text-center text-2xl tracking-widest font-mono"
                autoFocus
              />
              <p className="text-xs text-gray-500 mt-1">
                Enter the 6-digit code from your authenticator app
              </p>
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep('scan')}
                className="flex-1"
              >
                Back
              </Button>
              <Button
                type="submit"
                className="flex-1"
                disabled={verificationCode.length !== 6 || isSubmitting}
              >
                {isSubmitting ? 'Verifying...' : 'Verify'}
              </Button>
            </div>
          </form>
        )}

        {/* Step: Backup Codes */}
        {step === 'backup' && setupData && (
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-sm text-amber-800">
                <strong>Important:</strong> Save these backup codes in a secure location. You'll
                need them if you lose access to your authenticator app.
              </p>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <div className="grid grid-cols-2 gap-2 font-mono text-sm">
                {setupData.backupCodes.map((code, i) => (
                  <div key={i} className="bg-white px-2 py-1 rounded border text-center">
                    {code}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={copyBackupCodes} className="flex-1">
                {copiedBackupCodes ? '✓ Copied!' : 'Copy'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={downloadBackupCodes}
                className="flex-1"
              >
                Download
              </Button>
            </div>

            <Button onClick={handleComplete} className="w-full">
              I've saved my backup codes
            </Button>
          </div>
        )}

        {/* Loading state */}
        {step === 'loading' && (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          </div>
        )}
      </Card>
    </div>
  );
}
