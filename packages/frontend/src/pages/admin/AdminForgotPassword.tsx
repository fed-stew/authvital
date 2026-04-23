import * as React from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Mail, ArrowLeft, CheckCircle, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { superAdminApi } from '@/lib/api';

export function AdminForgotPassword() {
  const [email, setEmail] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isSuccess, setIsSuccess] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email) {
      setError('Please enter your email address');
      return;
    }

    setIsLoading(true);

    try {
      await superAdminApi.forgotPassword(email);
      setIsSuccess(true);
    } catch (err: any) {
      if (err?.code === 'ERR_NETWORK') {
        setError('Unable to connect to the server. Please check your connection and try again.');
      } else {
        // Don't reveal whether the email exists — always show success
        setIsSuccess(true);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setEmail('');
    setError(null);
    setIsSuccess(false);
  };

  return (
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

        {/* Forgot Password Card */}
        <Card>
          <CardHeader>
            <CardTitle>Forgot Password</CardTitle>
            <CardDescription>
              Enter your email to receive a reset link
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isSuccess ? (
              <div className="space-y-4">
                {/* Success Message */}
                <div className="flex items-start gap-2 rounded-md border border-green-500/50 bg-green-500/10 p-3 text-sm text-green-50">
                  <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <p>
                    Check your inbox — If an account exists with this email, a reset link has been sent.
                  </p>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={resetForm}
                >
                  Try again
                </Button>

                <Link to="/admin/login" className="block">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to login
                  </Button>
                </Link>
              </div>
            ) : (
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

                {/* Submit Button */}
                <Button
                  type="submit"
                  className="w-full"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                      <Mail className="h-4 w-4" />
                      Sending...
                    </span>
                  ) : (
                    'Send Reset Link'
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
              </form>
            )}
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
