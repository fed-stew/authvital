/**
 * OAuth Login Page - Branded Login Experience
 * 
 * Shown during OAuth /authorize flow when user has no session.
 * Displays branding from the requesting application for a seamless experience.
 * After login, redirects back to /oauth/authorize to complete the flow.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Loader2, AlertCircle, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { SsoButtons } from '@/components/SsoButtons';

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

export function OAuthLogin() {
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [branding, setBranding] = useState<AppBranding | null>(null);
  const [isBrandingLoading, setIsBrandingLoading] = useState(true);
  const [ssoEnforced, setSsoEnforced] = useState(false);

  // Memoized callback for SSO enforced provider
  const handleEnforcedProvider = useCallback((_provider: string) => {
    setSsoEnforced(true);
  }, []);

  // Get URL params
  // redirect_uri contains the /oauth/authorize URL to redirect back to after login
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

  console.log('[OAuth Login] Initialized with:', {
    clientId: clientId || 'none',
    redirectUri: redirectUri || 'none',
  });

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
          // No clientId - fetch instance branding for generic login
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
        // Branding fetch failed, will use default styling
        console.debug('Could not fetch branding, using defaults');
      } finally {
        setIsBrandingLoading(false);
      }
    };

    fetchBranding();
  }, [clientId]);

  // Reference to hidden form for POST submission
  const formRef = useRef<HTMLFormElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    if (!email || !password) {
      setError('Email and password are required');
      return;
    }
    
    setIsLoading(true);
    
    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          clientId: clientId || undefined,
          redirectUri: redirectUri || undefined,
        }),
        credentials: 'include',
        redirect: 'manual',
      });

      // Try to parse response as JSON
      let data: any = {};
      try {
        data = await response.json();
      } catch {
        // Response might be empty for redirects
      }

      // Check if MFA is required
      if (data.mfaRequired || data.mfaSetupRequired) {
        // Navigate to MFA challenge page with state
        const state = {
          challengeToken: data.mfaChallengeToken,
          redirectUri: data.redirectUri || redirectUri,
          clientId: data.clientId || clientId,
          requiresSetup: data.mfaSetupRequired,
        };
        
        // Store state in sessionStorage since we use window.location for navigation
        sessionStorage.setItem('mfa_challenge', JSON.stringify(state));
        
        // Redirect to appropriate MFA page
        const mfaUrl = data.mfaSetupRequired ? '/auth/mfa/setup' : '/auth/mfa';
        window.location.href = mfaUrl;
        return;
      }

      // 401/4xx = error, show message
      if (response.status >= 400) {
        setError(data.message || 'Invalid email or password');
        setIsLoading(false);
        return;
      }

      // Success (302 redirect or 2xx) - submit the form to let browser follow redirect
      formRef.current?.submit();
    } catch (err) {
      console.error('Login error:', err);
      setError('An error occurred. Please try again.');
      setIsLoading(false);
    }
  };

  // ==========================================================================
  // DYNAMIC STYLES
  // ==========================================================================

  const primaryColor = branding?.primaryColor || '#8b5cf6'; // Default purple
  const backgroundColor = branding?.backgroundColor || '#0f172a'; // Default dark
  const accentColor = branding?.accentColor || primaryColor;

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
              // Default icon with app initial
              <div 
                className="w-16 h-16 mx-auto mb-6 rounded-xl flex items-center justify-center text-white text-2xl font-bold"
                style={{ backgroundColor: primaryColor }}
              >
                {(branding?.name || 'A')[0].toUpperCase()}
              </div>
            )}
            
            <h1 className="text-2xl font-bold text-white">
              Sign in to {branding?.name || 'continue'}
            </h1>
            <p className="text-muted-foreground mt-2">
              Enter your credentials to continue
            </p>
          </div>

          {/* SSO Buttons */}
          <SsoButtons
            clientId={clientId || undefined}
            redirectUri={redirectUri || undefined}
            mode="login"
            onEnforcedProvider={handleEnforcedProvider}
          />

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 p-3 mb-6 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {/* Only show password form if SSO is not enforced */}
          {!ssoEnforced && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-white mb-1">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoFocus
                className="w-full px-4 py-3 rounded-lg bg-secondary border border-white/10 text-white placeholder-muted-foreground focus:outline-none focus:ring-2 focus:border-transparent transition-shadow"
                style={{ 
                  // @ts-ignore - CSS custom property
                  '--tw-ring-color': primaryColor,
                }}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-white mb-1">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full px-4 py-3 rounded-lg bg-secondary border border-white/10 text-white placeholder-muted-foreground focus:outline-none focus:ring-2 focus:border-transparent transition-shadow"
                style={{ 
                  // @ts-ignore - CSS custom property
                  '--tw-ring-color': primaryColor,
                }}
              />
              <div className="mt-2 text-right">
                <Link 
                  to={`/auth/forgot-password${redirectUri ? `?redirect_uri=${encodeURIComponent(redirectUri)}` : (clientId ? `?client_id=${clientId}` : '')}`}
                  className="text-sm hover:underline"
                  style={{ color: primaryColor }}
                >
                  Forgot password?
                </Link>
              </div>
            </div>

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 text-white font-medium hover:opacity-90 transition-opacity"
              style={buttonStyle}
            >
              {isLoading ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Signing in...</>
              ) : (
                'Sign in'
              )}
            </Button>
          </form>
          )}

          {/* SSO enforced message */}
          {ssoEnforced && (
            <p className="text-sm text-center text-muted-foreground">
              This organization requires SSO login. Please use one of the options above.
            </p>
          )}

          {/* Hidden form for actual POST submission (browser follows 302) */}
          <form
            ref={formRef}
            method="POST"
            action={`${API_URL}/api/auth/login`}
            style={{ display: 'none' }}
          >
            <input type="hidden" name="email" value={email} />
            <input type="hidden" name="password" value={password} />
            {clientId && <input type="hidden" name="clientId" value={clientId} />}
            {redirectUri && <input type="hidden" name="redirectUri" value={redirectUri} />}
          </form>

          {/* Sign up link */}
          <div className="mt-6 text-center">
            <p className="text-sm text-muted-foreground">
              Don't have an account?{' '}
              <Link 
                to={`/auth/signup${redirectUri ? `?redirect_uri=${encodeURIComponent(redirectUri)}` : (clientId ? `?client_id=${clientId}` : '')}`}
                className="font-medium hover:underline"
                style={{ color: primaryColor }}
              >
                Sign up
              </Link>
            </p>
          </div>
        </div>

        {/* Footer Links */}
        <div className="mt-6 flex items-center justify-center gap-4 text-xs text-muted-foreground">
          {branding?.privacyUrl && (
            <a 
              href={branding.privacyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white flex items-center gap-1"
            >
              Privacy <ExternalLink className="w-3 h-3" />
            </a>
          )}
          {branding?.termsUrl && (
            <a 
              href={branding.termsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white flex items-center gap-1"
            >
              Terms <ExternalLink className="w-3 h-3" />
            </a>
          )}
          {branding?.supportUrl && (
            <a 
              href={branding.supportUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white flex items-center gap-1"
            >
              Help <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>

        {/* Security note - subtle */}
        <p className="mt-4 text-center text-xs text-muted-foreground/50">
          Secured by <a href="https://www.authvader.com" target="_blank" rel="noopener noreferrer" className="hover:text-muted-foreground transition-colors">AuthVader</a>
        </p>
      </div>
    </div>
  );
}
