/**
 * Forgot Password Page - Password Reset Request Flow
 *
 * Allows users to request a password reset link via email.
 * Displays branding from the requesting application for a seamless experience.
 * On success, shows a generic message to prevent email enumeration attacks.
 */

import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Loader2, AlertCircle, ArrowLeft, Mail, CheckCircle } from 'lucide-react';
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

// =============================================================================
// COMPONENT
// =============================================================================

export function ForgotPassword() {
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [branding, setBranding] = useState<AppBranding | null>(null);
  const [isBrandingLoading, setIsBrandingLoading] = useState(true);

  // Get URL params
  const redirectUri = searchParams.get('redirect_uri') || '';

  // Get client_id - direct param or extract from redirect_uri URL
  const clientId = searchParams.get('client_id') || (() => {
    try {
      if (redirectUri) {
        const url = new URL(redirectUri, window.location.origin);
        return url.searchParams.get('client_id');
      }
    } catch { /* ignore */ }
    return null;
  })();

  // Build the "back to login" link with preserved params
  const backToLoginUrl = (() => {
    const params = new URLSearchParams();
    if (redirectUri) params.set('redirect_uri', redirectUri);
    else if (clientId) params.set('client_id', clientId);
    const queryString = params.toString();
    return `/auth/login${queryString ? `?${queryString}` : ''}`;
  })();

  // Fetch branding when client_id is available, or instance branding when not
  useEffect(() => {
    const fetchBranding = async () => {
      try {
        if (clientId) {
          // Fetch app-specific branding
          const response = await fetch(`${API_URL}/api/branding/${clientId}`);
          if (response.ok) {
            const data = await response.json();
            setBranding(data);
          }
        } else {
          // No clientId - fetch instance branding for generic page
          const configRes = await fetch(`${API_URL}/api/signup/config`);
          if (configRes.ok) {
            const config = await configRes.json();
            if (config.branding) {
              setBranding({
                clientId: '',
                name: config.branding.name || 'AuthVital',
                logoUrl: config.branding.logoUrl,
                primaryColor: config.branding.primaryColor,
              });
            }
          }
        }
      } catch {
        // Branding fetch failed, will use default styling
        console.debug('Could not fetch branding, using defaults');
      } finally {
        setIsBrandingLoading(false);
      }
    };

    fetchBranding();
  }, [clientId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email) {
      setError('Email is required');
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address');
      return;
    }

    setIsLoading(true);

    try {
      await authApi.forgotPassword(email);
      // Always show success, even if email doesn't exist (security best practice)
      setIsSuccess(true);
    } catch (err: unknown) {
      console.error('Forgot password error:', err);
      // Still show success to prevent email enumeration
      // Only show error for actual network/server failures
      if (err && typeof err === 'object' && 'code' in err && err.code === 'ERR_NETWORK') {
        setError('Unable to connect. Please check your internet connection.');
      } else {
        // For any API response (even errors), show success to prevent enumeration
        setIsSuccess(true);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // ==========================================================================
  // DYNAMIC STYLES
  // ==========================================================================

  const primaryColor = sanitizeColor(branding?.primaryColor, '#8b5cf6'); // Default purple
  const backgroundColor = sanitizeColor(branding?.backgroundColor, '#0f172a'); // Default dark
  const accentColor = sanitizeColor(branding?.accentColor, primaryColor);

  // Generate button gradient
  const buttonStyle = {
    background: `linear-gradient(to right, ${primaryColor}, ${accentColor})`,
  };

  // Generate focus ring color
  const focusRingStyle = {
    '--focus-ring-color': primaryColor,
  } as React.CSSProperties;

  // Background style (supports gradients)
  const bgStyle: React.CSSProperties = backgroundColor.includes('gradient')
    ? { background: backgroundColor }
    : { backgroundColor };

  // ==========================================================================
  // LOADING STATE
  // ==========================================================================

  if (isBrandingLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={bgStyle}>
        <Loader2 className="w-8 h-8 animate-spin text-white/50" />
      </div>
    );
  }

  // ==========================================================================
  // RENDER
  // ==========================================================================

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={bgStyle}>
      <div className="w-full max-w-md" style={focusRingStyle}>
        {/* Card */}
        <div className="p-8 rounded-xl bg-card border border-white/10 shadow-2xl">
          {/* Back to Login Link */}
          <Link
            to={backToLoginUrl}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-white transition-colors mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to login
          </Link>

          {/* Header with Branding */}
          <div className="text-center mb-8">
            {branding?.logoUrl ? (
              // App Logo
              <div className="mb-6">
                <img
                  src={branding.logoUrl}
                  alt={branding.name}
                  className="h-12 max-w-[200px] mx-auto object-contain"
                  onError={(e) => {
                    // Hide broken image
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              </div>
            ) : branding?.iconUrl ? (
              // App Icon (square)
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
              // Default icon with mail symbol
              <div
                className="w-16 h-16 mx-auto mb-6 rounded-xl flex items-center justify-center text-white"
                style={{ backgroundColor: primaryColor }}
              >
                <Mail className="w-8 h-8" />
              </div>
            )}

            <h1 className="text-2xl font-bold text-white">
              Reset your password
            </h1>
            <p className="text-muted-foreground mt-2">
              {isSuccess
                ? "Check your email for a reset link"
                : "Enter your email and we'll send you a reset link"}
            </p>
          </div>

          {/* Success State */}
          {isSuccess ? (
            <div className="space-y-6">
              <div className="flex items-start gap-3 p-4 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400">
                <CheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium">Check your inbox</p>
                  <p className="mt-1 text-green-400/80">
                    If an account exists with this email, a reset link has been sent.
                  </p>
                </div>
              </div>

              <p className="text-sm text-muted-foreground text-center">
                Didn't receive the email?{' '}
                <button
                  onClick={() => {
                    setIsSuccess(false);
                    setError(null);
                  }}
                  className="font-medium hover:underline"
                  style={{ color: primaryColor }}
                >
                  Try again
                </button>
              </p>

              <Link to={backToLoginUrl}>
                <Button
                  type="button"
                  className="w-full py-3 text-white font-medium hover:opacity-90 transition-opacity"
                  style={buttonStyle}
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to login
                </Button>
              </Link>
            </div>
          ) : (
            /* Form State */
            <>
              {/* Error */}
              {error && (
                <div className="flex items-center gap-2 p-3 mb-6 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span className="text-sm">{error}</span>
                </div>
              )}

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-white mb-1">
                    Email address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      required
                      autoFocus
                      className="w-full pl-10 pr-4 py-3 rounded-lg bg-secondary border border-white/10 text-white placeholder-muted-foreground focus:outline-none focus:ring-2 focus:border-transparent transition-shadow"
                      style={{
                        // @ts-ignore - CSS custom property
                        '--tw-ring-color': primaryColor,
                      }}
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3 text-white font-medium hover:opacity-90 transition-opacity"
                  style={buttonStyle}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    'Send reset link'
                  )}
                </Button>
              </form>

              {/* Remember password? */}
              <div className="mt-6 text-center">
                <p className="text-sm text-muted-foreground">
                  Remember your password?{' '}
                  <Link
                    to={backToLoginUrl}
                    className="font-medium hover:underline"
                    style={{ color: primaryColor }}
                  >
                    Sign in
                  </Link>
                </p>
              </div>
            </>
          )}
        </div>

        {/* Security note - subtle */}
        <p className="mt-4 text-center text-xs text-muted-foreground/50">
          Secured by{' '}
          <a
            href="https://www.authvital.com"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-muted-foreground transition-colors"
          >
            AuthVital
          </a>
        </p>
      </div>
    </div>
  );
}
