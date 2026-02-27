import * as React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AlertCircle, Lock } from 'lucide-react';
import { useAdmin } from '@/contexts/AdminContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';

// =============================================================================
// COMPONENT
// =============================================================================

export function AdminLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isLoading } = useAdmin();

  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  // Get redirect path from location state, default to /admin
  const from = (location.state as any)?.from?.pathname || '/admin';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Basic validation
    if (!email || !password) {
      setError('Please enter both email and password');
      return;
    }

    try {
      const result = await login(email, password);

      // Check if MFA verification is required
      if (result.mfaRequired) {
        navigate('/admin/mfa/verify', {
          replace: true,
          state: { challengeToken: result.mfaChallengeToken },
        });
        return;
      }

      // Check if MFA setup is required
      if (result.mfaSetupRequired) {
        navigate('/admin/mfa/verify', {
          replace: true,
          state: {
            challengeToken: result.mfaChallengeToken,
            requiresSetup: true,
          },
        });
        return;
      }

      // Check if password change is required
      if (result.mustChangePassword) {
        navigate('/admin/change-password', { replace: true });
        return;
      }

      // Navigate to the page they were trying to access
      navigate(from, { replace: true });
    } catch (err: unknown) {
      const errorMessage =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        (err instanceof Error ? err.message : null) ||
        'Failed to login. Please check your credentials.';
      setError(errorMessage);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4">
      <div className="w-full max-w-md">
        {/* Logo/Brand */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary">
            <span className="text-3xl font-bold text-primary-foreground">A</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground">
            AuthVital Admin
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in to access the super admin console
          </p>
        </div>

        {/* Login Card */}
        <Card>
          <CardHeader>
            <CardTitle>Sign In</CardTitle>
            <CardDescription>
              Enter your email and password to continue
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Error Message */}
              {error && (
                <div className="flex items-start gap-2 rounded-md border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-50">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <p>{error}</p>
                </div>
              )}

              {/* Email Input */}
              <div className="space-y-2">
                <label
                  htmlFor="email"
                  className="text-sm font-medium text-foreground"
                >
                  Email
                </label>
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@authvital.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                  autoComplete="email"
                  required
                  className="bg-card"
                />
              </div>

              {/* Password Input */}
              <div className="space-y-2">
                <label
                  htmlFor="password"
                  className="text-sm font-medium text-foreground"
                >
                  Password
                </label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  autoComplete="current-password"
                  required
                  className="bg-card"
                />
              </div>

              {/* Submit Button */}
              <Button
                type="submit"
                className="w-full"
                disabled={isLoading}
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                    Signing in...
                  </span>
                ) : (
                  'Sign In'
                )}
              </Button>

              {/* Security Notice */}
              <div className="flex items-center justify-center gap-2 rounded-md border border-white/10 bg-white/5 p-3">
                <Lock className="h-4 w-4 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">
                  Secure login powered by AuthVital
                </p>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="mt-6 text-center text-sm text-muted-foreground">
          <p>
            Protected by enterprise-grade authentication
          </p>
        </div>
      </div>
    </div>
  );
}
