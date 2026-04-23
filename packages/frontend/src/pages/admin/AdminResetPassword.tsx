import * as React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertCircle, Lock, ArrowLeft, CheckCircle, XCircle, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { superAdminApi } from '@/lib/api';

type PageState = 'loading' | 'invalid' | 'form' | 'success';

export function AdminResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';

  // Page state
  const [pageState, setPageState] = React.useState<PageState>('loading');
  const [tokenError, setTokenError] = React.useState<string | null>(null);
  const [maskedEmail, setMaskedEmail] = React.useState<string | null>(null);

  // Form state
  const [newPassword, setNewPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [formError, setFormError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Verify token on mount
  React.useEffect(() => {
    const verifyToken = async () => {
      if (!token) {
        setTokenError('No reset token provided. Please request a new password reset link.');
        setPageState('invalid');
        return;
      }

      try {
        const result = await superAdminApi.verifyResetToken(token);
        if (result.valid) {
          setMaskedEmail(result.email || null);
          setPageState('form');
        } else {
          setTokenError('This reset link is invalid or has expired.');
          setPageState('invalid');
        }
      } catch (err: any) {
        const message = err?.response?.data?.message || 'This reset link is invalid or has expired.';
        setTokenError(message);
        setPageState('invalid');
      }
    };

    verifyToken();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!newPassword) {
      setFormError('Password is required');
      return;
    }
    if (newPassword.length < 8) {
      setFormError('Password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setFormError('Passwords do not match');
      return;
    }

    setIsSubmitting(true);

    try {
      await superAdminApi.resetPassword(token, newPassword);
      setPageState('success');
    } catch (err: any) {
      const message = err?.response?.data?.message || 'Failed to reset password. Please try again.';
      setFormError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Shared layout wrapper
  const PageWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4">
      <div className="w-full max-w-md">
        {/* Logo/Brand */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500">
            <ShieldCheck className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">
            AuthVital Admin
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Reset your admin password
          </p>
        </div>

        {children}

        {/* Footer */}
        <div className="mt-6 text-center text-sm text-muted-foreground">
          <p>
            Protected by enterprise-grade authentication
          </p>
        </div>
      </div>
    </div>
  );

  // ---------------------------------------------------------------------------
  // Loading State
  // ---------------------------------------------------------------------------
  if (pageState === 'loading') {
    return (
      <PageWrapper>
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center gap-4">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <p className="text-sm text-muted-foreground">Verifying reset link...</p>
            </div>
          </CardContent>
        </Card>
      </PageWrapper>
    );
  }

  // ---------------------------------------------------------------------------
  // Invalid Token State
  // ---------------------------------------------------------------------------
  if (pageState === 'invalid') {
    return (
      <PageWrapper>
        <Card>
          <CardHeader>
            <CardTitle>Reset Link Invalid</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Error Message */}
            <div className="flex items-start gap-2 rounded-md border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-50">
              <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <p>{tokenError}</p>
            </div>

            <Link to="/admin/forgot-password" className="block">
              <Button type="button" className="w-full">
                Request new reset link
              </Button>
            </Link>

            <Link to="/admin/login" className="block">
              <Button type="button" variant="outline" className="w-full">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to login
              </Button>
            </Link>
          </CardContent>
        </Card>
      </PageWrapper>
    );
  }

  // ---------------------------------------------------------------------------
  // Success State
  // ---------------------------------------------------------------------------
  if (pageState === 'success') {
    return (
      <PageWrapper>
        <Card>
          <CardHeader>
            <CardTitle>Password Reset Complete</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Success Message */}
            <div className="flex items-start gap-2 rounded-md border border-green-500/50 bg-green-500/10 p-3 text-sm text-green-50">
              <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <p>
                Your password has been reset successfully. You can now log in with your new password.
              </p>
            </div>

            <Link to="/admin/login" className="block">
              <Button type="button" className="w-full">
                Continue to login
              </Button>
            </Link>
          </CardContent>
        </Card>
      </PageWrapper>
    );
  }

  // ---------------------------------------------------------------------------
  // Form State
  // ---------------------------------------------------------------------------
  return (
    <PageWrapper>
      <Card>
        <CardHeader>
          <CardTitle>Set New Password</CardTitle>
          {maskedEmail && (
            <CardDescription>
              Resetting password for {maskedEmail}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Form Error */}
            {formError && (
              <div className="flex items-start gap-2 rounded-md border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-50">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <p>{formError}</p>
              </div>
            )}

            {/* New Password */}
            <div className="space-y-2">
              <label
                htmlFor="newPassword"
                className="text-sm font-medium text-foreground"
              >
                New Password
              </label>
              <Input
                id="newPassword"
                type="password"
                placeholder="Enter new password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={isSubmitting}
                autoComplete="new-password"
                required
                minLength={8}
                className="bg-card"
              />
            </div>

            {/* Confirm Password */}
            <div className="space-y-2">
              <label
                htmlFor="confirmPassword"
                className="text-sm font-medium text-foreground"
              >
                Confirm Password
              </label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={isSubmitting}
                autoComplete="new-password"
                required
                minLength={8}
                className="bg-card"
              />
            </div>

            {/* Password Match Indicator */}
            {confirmPassword && (
              <div className={`flex items-center gap-2 text-sm ${
                newPassword === confirmPassword ? 'text-green-400' : 'text-amber-400'
              }`}>
                {newPassword === confirmPassword ? (
                  <><CheckCircle className="h-4 w-4" /> Passwords match</>
                ) : (
                  <><AlertCircle className="h-4 w-4" /> Passwords do not match</>
                )}
              </div>
            )}

            {/* Hint */}
            <p className="text-xs text-muted-foreground">Minimum 8 characters</p>

            {/* Submit Button */}
            <Button
              type="submit"
              className="w-full"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                  Resetting password...
                </span>
              ) : (
                'Reset Password'
              )}
            </Button>

            {/* Back to Login */}
            <div className="text-center">
              <Link
                to="/admin/login"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <span className="inline-flex items-center gap-1">
                  <ArrowLeft className="h-3 w-3" />
                  Back to login
                </span>
              </Link>
            </div>

            {/* Security Notice */}
            <div className="flex items-center justify-center gap-2 rounded-md border border-white/10 bg-white/5 p-3">
              <Lock className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">
                Choose a strong, unique password
              </p>
            </div>
          </form>
        </CardContent>
      </Card>
    </PageWrapper>
  );
}
