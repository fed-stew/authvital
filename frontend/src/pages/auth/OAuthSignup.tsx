/**
 * OAuth Signup Page - Branded Signup Experience
 * 
 * Shown during OAuth /authorize flow when user clicks "Sign Up".
 * Displays branding from the requesting application.
 * Shows dynamic fields based on directory configuration.
 * After signup, redirects back to /oauth/authorize to complete the flow.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Loader2, AlertCircle, ExternalLink, Mail } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { SsoButtons } from '@/components/SsoButtons';
import { signupApi } from '@/lib/api';

// Use current origin for API calls (frontend served from same origin as backend)
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

interface InstanceConfig {
  id: string;
  name: string;
  allowSignUp: boolean;
  requiredUserFields: string[];
  allowGenericDomains: boolean;
}

type SignupStep = 'form' | 'sent' | 'error';

// =============================================================================
// COMPONENT
// =============================================================================

export function OAuthSignup() {
  const [searchParams] = useSearchParams();
  
  // Form state
  const [email, setEmail] = useState('');
  const [givenName, setFirstName] = useState('');
  const [familyName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  
  // UI state
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<SignupStep>('form');
  const [branding, setBranding] = useState<AppBranding | null>(null);
  const [instanceConfig, setInstanceConfig] = useState<InstanceConfig | null>(null);
  const [isBrandingLoading, setIsBrandingLoading] = useState(true);
  const [ssoEnforced, setSsoEnforced] = useState(false);

  // Memoized callback for SSO enforced provider
  const handleEnforcedProvider = useCallback((_provider: string) => {
    setSsoEnforced(true);
  }, []);

  // Get redirect_uri (the /oauth/authorize URL to redirect to after signup)
  const redirectUri = searchParams.get('redirect_uri') || '';
  
  // Get client_id - check direct param first, then try to extract from redirect_uri URL
  const clientId = useMemo(() => {
    // 1. Direct client_id parameter (preferred for trampoline flow)
    const directClientId = searchParams.get('client_id');
    if (directClientId) {
      return directClientId;
    }
    
    // 2. Extract from redirect_uri URL (OAuth flow)
    try {
      if (redirectUri) {
        const url = new URL(redirectUri, window.location.origin);
        const extractedId = url.searchParams.get('client_id');
        if (extractedId) {
          return extractedId;
        }
      }
    } catch {
      // Invalid URL, ignore
    }
    
    return null;
  }, [searchParams, redirectUri]);

  // Fetch branding and instance config
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        // Fetch instance config (always needed for required fields)
        const configRes = await fetch(`${API_URL}/api/signup/config`);
        if (configRes.ok) {
          const config = await configRes.json();
          setInstanceConfig(config);
          
          // If no clientId, use instance branding
          if (!clientId && config.branding) {
            setBranding({
              clientId: '',
              name: config.branding.name || 'AuthVader',
              logoUrl: config.branding.logoUrl,
              primaryColor: config.branding.primaryColor,
            });
          }
        }
        
        // If clientId provided, fetch app-specific branding
        if (clientId) {
          const brandingRes = await fetch(`${API_URL}/api/branding/${clientId}`);
          if (brandingRes.ok) {
            const data = await brandingRes.json();
            setBranding(data);
          }
        }
      } catch {
        console.debug('Could not fetch config/branding');
      } finally {
        setIsBrandingLoading(false);
      }
    };

    fetchConfig();
  }, [clientId]);

  // Check email when it changes (debounced)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const result = await signupApi.initiateSignup({
        email,
        givenName: givenName || undefined,
        familyName: familyName || undefined,
        redirectUri: redirectUri || undefined,
        clientId: clientId || undefined,
      });

      if (result.success) {
        setStep('sent');
      } else {
        setError(result.message || 'Failed to send verification email');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signup failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    setIsLoading(true);
    try {
      await signupApi.resendVerification(email);
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to resend email');
    } finally {
      setIsLoading(false);
    }
  };

  // ==========================================================================
  // DYNAMIC STYLES (same as OAuthLogin)
  // ==========================================================================

  const primaryColor = branding?.primaryColor || '#8b5cf6';
  const backgroundColor = branding?.backgroundColor || '#0f172a';
  const accentColor = branding?.accentColor || primaryColor;

  const buttonStyle = {
    background: `linear-gradient(to right, ${primaryColor}, ${accentColor})`,
  };

  const bgStyle: React.CSSProperties = backgroundColor.includes('gradient')
    ? { background: backgroundColor }
    : { backgroundColor };

  // ==========================================================================
  // HELPER: Check if field is required
  // ==========================================================================
  
  const isFieldRequired = (field: string) => {
    return instanceConfig?.requiredUserFields?.includes(field) || false;
  };

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
  // EMAIL SENT STATE
  // ==========================================================================

  if (step === 'sent') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={bgStyle}>
        <div className="w-full max-w-md p-8 rounded-xl bg-card border border-white/10 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-purple-500/20 flex items-center justify-center">
            <Mail className="w-8 h-8 text-purple-500" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Check your email</h1>
          <p className="text-muted-foreground mb-2">We sent a verification link to</p>
          <p className="font-medium mb-6" style={{ color: primaryColor }}>{email}</p>
          <p className="text-sm text-muted-foreground mb-6">
            Click the link in the email to verify your address and complete signup.
            After verification, you'll be redirected back to {branding?.name || 'the app'}.
          </p>
          
          <div className="space-y-3">
            <Button
              onClick={handleResend}
              disabled={isLoading}
              variant="outline"
              className="w-full"
            >
              {isLoading ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Sending...</>
              ) : (
                'Resend verification email'
              )}
            </Button>
            
            <button
              onClick={() => setStep('form')}
              className="text-sm text-muted-foreground hover:text-white"
            >
              Use a different email
            </button>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 mt-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive">
              <AlertCircle className="w-4 h-4" />
              <span className="text-sm">{error}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ==========================================================================
  // SIGNUP FORM
  // ==========================================================================

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={bgStyle}>
      <div className="w-full max-w-md">
        {/* Card */}
        <div className="p-8 rounded-xl bg-card border border-white/10 shadow-2xl">
          {/* Header with Branding */}
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
                className="w-16 h-16 mx-auto mb-6 rounded-xl flex items-center justify-center text-white text-2xl font-bold"
                style={{ backgroundColor: primaryColor }}
              >
                {(branding?.name || 'A')[0].toUpperCase()}
              </div>
            )}
            
            <h1 className="text-2xl font-bold text-white">
              Create your {branding?.name || ''} account
            </h1>
            <p className="text-muted-foreground mt-2">
              Get started for free
            </p>
          </div>

          {/* SSO Buttons */}
          <SsoButtons
            clientId={clientId || undefined}
            redirectUri={redirectUri || undefined}
            mode="signup"
            onEnforcedProvider={handleEnforcedProvider}
          />

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 p-3 mb-6 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {/* Only show signup form if SSO is not enforced */}
          {!ssoEnforced && (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name fields */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-white mb-1">
                  First name {isFieldRequired('givenName') && <span className="text-red-400">*</span>}
                </label>
                <input
                  type="text"
                  value={givenName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="John"
                  required={isFieldRequired('givenName')}
                  className="w-full px-4 py-3 rounded-lg bg-secondary border border-white/10 text-white placeholder-muted-foreground focus:outline-none focus:ring-2 focus:border-transparent"
                  style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-white mb-1">
                  Last name {isFieldRequired('familyName') && <span className="text-red-400">*</span>}
                </label>
                <input
                  type="text"
                  value={familyName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Doe"
                  required={isFieldRequired('familyName')}
                  className="w-full px-4 py-3 rounded-lg bg-secondary border border-white/10 text-white placeholder-muted-foreground focus:outline-none focus:ring-2 focus:border-transparent"
                  style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-white mb-1">
                Work email <span className="text-red-400">*</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
                autoFocus
                className="w-full px-4 py-3 rounded-lg bg-secondary border border-white/10 text-white placeholder-muted-foreground focus:outline-none focus:ring-2 focus:border-transparent"
                style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
              />
            </div>

            {/* Phone - if required by directory */}
            {isFieldRequired('phone') && (
              <div>
                <label className="block text-sm font-medium text-white mb-1">
                  Phone number <span className="text-red-400">*</span>
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1 (555) 123-4567"
                  required
                  className="w-full px-4 py-3 rounded-lg bg-secondary border border-white/10 text-white placeholder-muted-foreground focus:outline-none focus:ring-2 focus:border-transparent"
                  style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
                />
              </div>
            )}

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 text-white font-medium hover:opacity-90 transition-opacity"
              style={buttonStyle}
            >
              {isLoading ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating account...</>
              ) : (
                'Continue'
              )}
            </Button>
          </form>
          )}

          {/* SSO enforced message */}
          {ssoEnforced && (
            <p className="text-sm text-center text-muted-foreground">
              This organization requires SSO. Please use one of the options above to continue.
            </p>
          )}

          {/* Sign in link */}
          <div className="mt-6 text-center">
            <p className="text-sm text-muted-foreground">
              Already have an account?{' '}
              <Link 
                to={`/auth/login${redirectUri ? `?redirect_uri=${encodeURIComponent(redirectUri)}` : ''}`}
                className="font-medium hover:underline"
                style={{ color: primaryColor }}
              >
                Sign in
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

        {/* Security note */}
        <p className="mt-4 text-center text-xs text-muted-foreground/50">
          Secured by <a href="https://www.authvader.com" target="_blank" rel="noopener noreferrer" className="hover:text-muted-foreground transition-colors">AuthVader</a>
        </p>
      </div>
    </div>
  );
}
