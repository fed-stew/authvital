/**
 * Reset Password Page - Complete Password Reset Flow
 *
 * Users land here after clicking the reset link in their email.
 * Verifies the token, then allows setting a new password.
 * Displays branding from the requesting application for a seamless experience.
 */

import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Loader2, AlertCircle, Lock, CheckCircle, XCircle, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { authApi } from '@/lib/api';

// =============================================================================
// COLOR SANITIZATION (prevent CSS injection attacks)
// =============================================================================

// Validate CSS color to prevent injection attacks
const isValidCssColor = (color: string): boolean => {
  // Only allow hex colors, rgb(), rgba(), hsl(), hsla()
  const colorRegex = /^(#[0-9a-fA-F]{3,8}|rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(,\s*[\d.]+)?\s*\)|hsla?\(\s*\d+\s*,\s*[\d.]+%?\s*,\s*[\d.]+%?\s*(,\s*[\d.]+)?\s*\))$/;
  return colorRegex.test(color.trim());
};

// Sanitize color with fallback
const sanitizeColor = (color: string | undefined, fallback: string): string => {
  if (!color) return fallback;
  return isValidCssColor(color) ? color : fallback;
};

// Use current origin for API calls (frontend is served from same origin as backend)
const API_URL = import.meta.env.VITE_API_URL || window.location.origin;

// =============================================================================
// TYPES
// =============================================================================

interface AppBranding {
  clientId: string;
  name: string;
  logoUrl?: string;
  iconUrl?: string;
  primaryColor?: string;
  backgroundColor?: string;
  accentColor?: string;
  supportUrl?: string;
  privacyUrl?: string;
  termsUrl?: string;
}

type PageState = 'loading' | 'invalid' | 'form' | 'success';

// =============================================================================
// COMPONENT
// =============================================================================

export function ResetPassword() {
  const [searchParams] = useSearchParams();

  // Token from URL
  const token = searchParams.get('token') || '';

  // URL params for branding and navigation
  const redirectUri = searchParams.get('redirect_uri') || '';
  const clientId = searchParams.get('client_id') || (() => {
    try {
      if (redirectUri) {
        const url = new URL(redirectUri, window.location.origin);
        return url.searchParams.get('client_id');
      }
    } catch { /* ignore */ }
    return null;
  })();

  // Page state
  const [pageState, setPageState] = useState<PageState>('loading');
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [maskedEmail, setMaskedEmail] = useState<string | null>(null);

  // Form state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Branding state
  const [branding, setBranding] = useState<AppBranding | null>(null);
  const [isBrandingLoading, setIsBrandingLoading] = useState(true);

  // Build URLs with preserved params
  const buildAuthUrl = (path: string) => {
    const params = new URLSearchParams();
    if (redirectUri) params.set('redirect_uri', redirectUri);
    else if (clientId) params.set('client_id', clientId);
    const queryString = params.toString();
    return `${path}${queryString ? `?${queryString}` : ''}`;
  };

  const loginUrl = buildAuthUrl('/auth/login');
  const forgotPasswordUrl = buildAuthUrl('/auth/forgot-password');

  // Fetch branding on mount
  useEffect(() => {
    const fetchBranding = async () => {
      try {
        if (clientId) {
          const response = await fetch(`${API_URL}/api/branding/${clientId}`);
          if (response.ok) {
            const data = await response.json();
            setBranding(data);
          }
        } else {
          const configRes = await fetch(`${API_URL}/api/signup/config`);
          if (configRes.ok) {
            const config = await configRes.json();
            if (config.branding) {
              setBranding({
                clientId: '',
                name: config.branding.name || 'AuthVader',
                logoUrl: config.branding.logoUrl,
                primaryColor: config.branding.primaryColor,
              });
            }
          }
        }
      } catch {
        console.debug('Could not fetch branding, using defaults');
      } finally {
        setIsBrandingLoading(false);
      }
    };

    fetchBranding();
  }, [clientId]);

  // Verify token on mount
  useEffect(() => {
    const verifyToken = async () => {
      if (!token) {
        setTokenError('No reset token provided. Please request a new password reset link.');
        setPageState('invalid');
        return;
      }

      try {
        const result = await authApi.verifyResetToken(token);
        if (result.valid) {
          setMaskedEmail(result.email || null);
          setPageState('form');
        } else {
          setTokenError('This reset link is invalid or has expired.');
          setPageState('invalid');
        }
      } catch (err: unknown) {
        console.error('Token verification error:', err);
        // Check for specific error messages
        if (err && typeof err === 'object' && 'response' in err) {
          const response = (err as { response?: { data?: { message?: string } } }).response;
          setTokenError(response?.data?.message || 'This reset link is invalid or has expired.');
        } else {
          setTokenError('Unable to verify reset link. Please try again or request a new one.');
        }
        setPageState('invalid');
      }
    };

    verifyToken();
  }, [token]);

  // Form validation
  const validateForm = (): string | null => {
    if (!newPassword) {
      return 'Password is required';
    }
    if (newPassword.length < 8) {
      return 'Password must be at least 8 characters';
    }
    if (newPassword !== confirmPassword) {
      return 'Passwords do not match';
    }
    return null;
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const validationError = validateForm();
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setIsSubmitting(true);

    try {
      await authApi.resetPassword(token, newPassword);
      setPageState('success');
    } catch (err: unknown) {
      console.error('Password reset error:', err);
      if (err && typeof err === 'object' && 'response' in err) {
        const response = (err as { response?: { data?: { message?: string } } }).response;
        setFormError(response?.data?.message || 'Failed to reset password. Please try again.');
      } else if (err && typeof err === 'object' && 'code' in err && err.code === 'ERR_NETWORK') {
        setFormError('Unable to connect. Please check your internet connection.');
      } else {
        setFormError('Failed to reset password. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // ==========================================================================
  // DYNAMIC STYLES
  // ==========================================================================

  const primaryColor = sanitizeColor(branding?.primaryColor, '#8b5cf6');
  const backgroundColor = sanitizeColor(branding?.backgroundColor, '#0f172a');
  const accentColor = sanitizeColor(branding?.accentColor, primaryColor);

  const buttonStyle = {
    background: `linear-gradient(to right, ${primaryColor}, ${accentColor})`,
  };

  const focusRingStyle = {
    '--focus-ring-color': primaryColor,
  } as React.CSSProperties;

  const bgStyle: React.CSSProperties = backgroundColor.includes('gradient')
    ? { background: backgroundColor }
    : { backgroundColor };

  // ==========================================================================
  // LOADING STATE (branding or token verification)
  // ==========================================================================

  if (isBrandingLoading || pageState === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={bgStyle}>
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-white/50 mx-auto" />
          <p className="text-muted-foreground mt-4 text-sm">Verifying reset link...</p>
        </div>
      </div>
    );
  }

  // ==========================================================================
  // RENDER HEADER (shared across states)
  // ==========================================================================

  const renderHeader = (title: string, subtitle?: string) => (
    <div className="text-center mb-8">
      {branding?.logoUrl ? (
        <div className="mb-6">
          <img
            src={branding.logoUrl}
            alt={branding.name}
            className="h-12 max-w-[200px] mx-auto object-contain"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>
      ) : branding?.iconUrl ? (
        <div className="mb-6">
          <img
            src={branding.iconUrl}
            alt={branding.name}
            className="w-16 h-16 mx-auto rounded-xl object-contain"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>
      ) : (
        <div
          className="w-16 h-16 mx-auto mb-6 rounded-xl flex items-center justify-center text-white"
          style={{ backgroundColor: primaryColor }}
        >
          <Lock className="w-8 h-8" />
        </div>
      )}

      <h1 className="text-2xl font-bold text-white">{title}</h1>
      {subtitle && <p className="text-muted-foreground mt-2">{subtitle}</p>}
    </div>
  );

  // ==========================================================================
  // INVALID TOKEN STATE
  // ==========================================================================

  if (pageState === 'invalid') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={bgStyle}>
        <div className="w-full max-w-md" style={focusRingStyle}>
          <div className="p-8 rounded-xl bg-card border border-white/10 shadow-2xl">
            {renderHeader('Reset Link Invalid')}

            <div className="flex items-start gap-3 p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive mb-6">
              <XCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium">Unable to reset password</p>
                <p className="mt-1 opacity-80">{tokenError}</p>
              </div>
            </div>

            <div className="space-y-3">
              <Link to={forgotPasswordUrl}>
                <Button
                  type="button"
                  className="w-full py-3 text-white font-medium hover:opacity-90 transition-opacity"
                  style={buttonStyle}
                >
                  Request new reset link
                </Button>
              </Link>

              <Link to={loginUrl}>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full py-3"
                >
                  Back to login
                </Button>
              </Link>
            </div>
          </div>

          <p className="mt-4 text-center text-xs text-muted-foreground/50">
            Secured by{' '}
            <a
              href="https://www.authvader.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-muted-foreground transition-colors"
            >
              AuthVader
            </a>
          </p>
        </div>
      </div>
    );
  }

  // ==========================================================================
  // SUCCESS STATE
  // ==========================================================================

  if (pageState === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={bgStyle}>
        <div className="w-full max-w-md" style={focusRingStyle}>
          <div className="p-8 rounded-xl bg-card border border-white/10 shadow-2xl">
            {renderHeader('Password Reset Complete', 'Your password has been updated')}

            <div className="flex items-start gap-3 p-4 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 mb-6">
              <CheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium">Success!</p>
                <p className="mt-1 text-green-400/80">
                  Your password has been reset successfully. You can now log in with your new password.
                </p>
              </div>
            </div>

            <Link to={loginUrl}>
              <Button
                type="button"
                className="w-full py-3 text-white font-medium hover:opacity-90 transition-opacity"
                style={buttonStyle}
              >
                Continue to login
              </Button>
            </Link>
          </div>

          <p className="mt-4 text-center text-xs text-muted-foreground/50">
            Secured by{' '}
            <a
              href="https://www.authvader.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-muted-foreground transition-colors"
            >
              AuthVader
            </a>
          </p>
        </div>
      </div>
    );
  }

  // ==========================================================================
  // FORM STATE
  // ==========================================================================

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={bgStyle}>
      <div className="w-full max-w-md" style={focusRingStyle}>
        <div className="p-8 rounded-xl bg-card border border-white/10 shadow-2xl">
          {renderHeader(
            'Set new password',
            maskedEmail ? `Resetting password for ${maskedEmail}` : 'Enter your new password below'
          )}

          {/* Form Error */}
          {formError && (
            <div className="flex items-center gap-2 p-3 mb-6 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span className="text-sm">{formError}</span>
            </div>
          )}

          {/* Password Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* New Password */}
            <div>
              <label className="block text-sm font-medium text-white mb-1">
                New password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoFocus
                  minLength={8}
                  className="w-full pl-10 pr-10 py-3 rounded-lg bg-secondary border border-white/10 text-white placeholder-muted-foreground focus:outline-none focus:ring-2 focus:border-transparent transition-shadow"
                  style={{
                    // @ts-ignore - CSS custom property
                    '--tw-ring-color': primaryColor,
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Minimum 8 characters</p>
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-sm font-medium text-white mb-1">
                Confirm new password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={8}
                  className="w-full pl-10 pr-10 py-3 rounded-lg bg-secondary border border-white/10 text-white placeholder-muted-foreground focus:outline-none focus:ring-2 focus:border-transparent transition-shadow"
                  style={{
                    // @ts-ignore - CSS custom property
                    '--tw-ring-color': primaryColor,
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white transition-colors"
                >
                  {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Password match indicator */}
            {confirmPassword && (
              <div className={`flex items-center gap-2 text-sm ${
                newPassword === confirmPassword ? 'text-green-400' : 'text-amber-400'
              }`}>
                {newPassword === confirmPassword ? (
                  <><CheckCircle className="w-4 h-4" /> Passwords match</>
                ) : (
                  <><AlertCircle className="w-4 h-4" /> Passwords do not match</>
                )}
              </div>
            )}

            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 text-white font-medium hover:opacity-90 transition-opacity"
              style={buttonStyle}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Resetting password...
                </>
              ) : (
                'Reset password'
              )}
            </Button>
          </form>

          {/* Back to login */}
          <div className="mt-6 text-center">
            <p className="text-sm text-muted-foreground">
              Remember your password?{' '}
              <Link
                to={loginUrl}
                className="font-medium hover:underline"
                style={{ color: primaryColor }}
              >
                Sign in
              </Link>
            </p>
          </div>
        </div>

        {/* Security note */}
        <p className="mt-4 text-center text-xs text-muted-foreground/50">
          Secured by{' '}
          <a
            href="https://www.authvader.com"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-muted-foreground transition-colors"
          >
            AuthVader
          </a>
        </p>
      </div>
    </div>
  );
}
