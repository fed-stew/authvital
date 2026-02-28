/**
 * Complete Signup Page
 * After email verification - set password and configure tenant
 * 
 * Flow:
 * - Corporate email (acme.com) → Create org with name/slug
 * - Personal email (gmail.com) → Auto-create personal workspace
 */

import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { AlertCircle, Loader2, Check, Building, User, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { signupApi } from '@/lib/api';

const GENERIC_DOMAINS = [
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'live.com',
  'icloud.com', 'me.com', 'mac.com', 'aol.com', 'protonmail.com',
  'zoho.com', 'yandex.com', 'mail.com', 'gmx.com', 'fastmail.com',
];

function isGenericDomain(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase();
  return GENERIC_DOMAINS.includes(domain);
}

function extractDomain(email: string): string {
  return email.split('@')[1]?.toLowerCase() || '';
}

function suggestOrgName(email: string): string {
  const domain = extractDomain(email);
  const name = domain.split('.')[0];
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function suggestSlug(email: string): string {
  const domain = extractDomain(email);
  return domain.split('.')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function CompleteSignup() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  
  // URL params - only the token is required
  const token = searchParams.get('token') || '';

  // UI state
  const [availablePlans, setAvailablePlans] = useState<any[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [licensingMode, setLicensingMode] = useState<string | null>(null); // Track app's licensing mode
  
  // Pending signup data (loaded from token)
  const [pendingEmail, setPendingEmail] = useState<string>('');
  
  // Form state
  const [givenName, setFirstName] = useState('');
  const [familyName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  // Tenant setup (for corporate emails)
  const [tenantName, setTenantName] = useState('');
  const [slug, setSlug] = useState('');
  
  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const [slugUnavailableReason, setSlugUnavailableReason] = useState<string | null>(null);
  const [checkingSlug, setCheckingSlug] = useState(false);
  
  // Loading pending signup data
  const [isLoadingPending, setIsLoadingPending] = useState(true); // Start true - we're loading
  const [singleTenantMode, setSingleTenantMode] = useState(false);
  const [isLoadingConfig, setIsLoadingConfig] = useState(true); // Start as true
  const [tokenInvalid, setTokenInvalid] = useState(false); // Fatal error - token is bad

  // Computed
  const isGeneric = isGenericDomain(pendingEmail);
  const domain = extractDomain(pendingEmail);

  const loadAvailablePlans = async (appId: string) => {
    setLoadingPlans(true);
    setError(null);
    try {
      const result = await signupApi.getLicenseTypesForSignup(appId);
      if (result.licenseTypes && result.licenseTypes.length > 0) {
        setAvailablePlans(result.licenseTypes);
      } else {
        setError('No plans available for this application');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load available plans');
      console.error('Failed to load plans:', err);
    } finally {
      setLoadingPlans(false);
    }
  };

  // Fetch instance config to check single-tenant mode
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await fetch('/api/signup/config');
        if (res.ok) {
          const config = await res.json();
          setSingleTenantMode(config.singleTenantMode || false);
        }
      } catch {
        console.debug('Could not fetch instance config');
      } finally {
        setIsLoadingConfig(false);
      }
    };
    fetchConfig();
  }, []);

  // Load pending signup data from token
  useEffect(() => {
    const loadPendingSignup = async () => {
      if (!token) {
        setTokenInvalid(true);
        setError('No verification token provided.');
        setIsLoadingPending(false);
        return;
      }
      
      setIsLoadingPending(true);
      setError(null);
      
      try {
        const result = await signupApi.getPendingSignupByToken(token);
        
        setPendingEmail(result.email);
        
        // Pre-fill form with pending data
        setFirstName(result.givenName || '');
        setLastName(result.familyName || '');
        setTenantName(suggestOrgName(result.email));
        setSlug(suggestSlug(result.email));
        
        // Pre-select license type if one was already selected
        if (result.selectedLicenseTypeId) {
          setSelectedPlanId(result.selectedLicenseTypeId);
        }
        
        // Handle application info if present
        if (result.application) {
          setLicensingMode(result.application.licensingMode);
          
          // Load plans if licensing is enabled
          if (result.application.licensingMode && result.application.licensingMode !== 'FREE') {
            await loadAvailablePlans(result.application.id);
          }
        }
      } catch (err: any) {
        // Token is invalid/expired/used - show error screen, not the form
        setTokenInvalid(true);
        setError(err.response?.data?.message || 'This link is invalid or has expired.');
        console.error('Failed to load pending signup:', err);
      } finally {
        setIsLoadingPending(false);
      }
    };
    
    loadPendingSignup();
  }, [token]);

  // Check slug availability (debounced)
  useEffect(() => {
    if (!slug || isGeneric || singleTenantMode) {
      setSlugAvailable(null);
      return;
    }

    const timer = setTimeout(async () => {
      setCheckingSlug(true);
      try {
        const response = await fetch(`/api/signup/check-slug?slug=${encodeURIComponent(slug)}`);
        if (response.ok) {
          const data = await response.json();
          setSlugAvailable(data.available);
          setSlugUnavailableReason(data.available ? null : (data.reason || 'Already taken'));
        } else {
          setSlugAvailable(false);
          setSlugUnavailableReason('Could not verify availability');
        }
      } catch (err) {
        console.error('Failed to check slug availability:', err);
        setSlugAvailable(null); // Don't block submission on network error
      } finally {
        setCheckingSlug(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [slug, isGeneric, singleTenantMode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    // Tenant name only required for corporate emails when NOT in single-tenant mode
    if (!isGeneric && !singleTenantMode && !tenantName.trim()) {
      setError('Tenant name is required');
      return;
    }

    // Validate plan selection (only required if licensing is enabled)
    // If licensingMode is FREE or undefined, no plan selection needed (Free plan is auto-selected)
    if (licensingMode && licensingMode !== 'FREE' && !selectedPlanId) {
      setError('Please select a plan');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Complete signup (backend will use pending signup data)
      const result = await signupApi.completeSignup({
        email: pendingEmail,
        password,
        token,
        givenName: givenName || undefined,
        familyName: familyName || undefined,
        // Include tenant details for corporate emails (but NOT in single-tenant mode)
        ...(!isGeneric && !singleTenantMode ? {
          tenantName: tenantName.trim(),
          slug: slug.trim(),
        } : {}),
      });
      
      console.log('Signup complete:', result);
      setSuccess(true);
      
      // Session cookie is set directly by /signup/complete response
      // No separate exchange step needed!
      
      // Redirect after success - go to the app's auth endpoint
      setTimeout(() => {
        if (result.tenant?.slug) {
          let redirectUrl: string;
          
          // Use initiateLoginUri if provided (from the application that initiated signup)
          // Template is the FULL URL with path, e.g., "https://{tenant}.myapp.com/api/auth/login"
          if (result.initiateLoginUri) {
            // Replace {tenant} placeholder with actual tenant slug
            redirectUrl = result.initiateLoginUri.replace('{tenant}', result.tenant.slug);
            console.log('[CompleteSignup] Using initiateLoginUri:', result.initiateLoginUri);
          } else {
            // Fallback to localhost (development) - just go to root
            const port = window.location.port ? `:${window.location.port}` : '';
            redirectUrl = `${window.location.protocol}//${result.tenant.slug}.localhost${port}/`;
            console.log('[CompleteSignup] No initiateLoginUri, using localhost fallback');
          }
          
          console.log('[CompleteSignup] Tenant created:', result.tenant.slug);
          console.log('[CompleteSignup] Redirecting to:', redirectUrl);
          window.location.href = redirectUrl;
        } else {
          // No org - go to IDP login
          console.log('[CompleteSignup] No tenant, going to login');
          navigate('/auth/login');
        }
      }, 2000);
    } catch (err: any) {
      console.error('Signup error:', err);
      setError(err.response?.data?.message || 'Failed to complete signup');
    } finally {
      setIsLoading(false);
    }
  };

  // Show loading while fetching config or pending signup
  if (isLoadingConfig || isLoadingPending) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-[#0f172a]">
        <div className="w-full max-w-md p-8 rounded-xl bg-card border border-white/10 text-center">
          <Loader2 className="w-8 h-8 mx-auto animate-spin text-purple-500" />
          <p className="text-muted-foreground mt-4">Loading...</p>
        </div>
      </div>
    );
  }

  // Token is invalid/expired/already used - show error screen, not the form
  if (tokenInvalid) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-[#0f172a]">
        <div className="w-full max-w-md p-8 rounded-xl bg-card border border-white/10 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
            <XCircle className="w-8 h-8 text-red-500" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Invalid Link</h1>
          <p className="text-muted-foreground mb-6">
            {error || 'This link is invalid or has expired.'}
          </p>
          <div className="space-y-3">
            <Button
              onClick={() => navigate('/auth/login')}
              className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500"
            >
              Go to Login
            </Button>
            <Button
              onClick={() => navigate('/auth/signup')}
              variant="outline"
              className="w-full"
            >
              Sign Up Again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-[#0f172a]">
        <div className="w-full max-w-md p-8 rounded-xl bg-card border border-white/10 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-500/20 flex items-center justify-center">
            <Check className="w-8 h-8 text-green-500" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Account Created!</h1>
          <p className="text-muted-foreground mb-4">
            Your account has been created successfully. Redirecting...
          </p>
          <Loader2 className="w-6 h-6 mx-auto animate-spin text-purple-500" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#0f172a]">
      <div className="w-full max-w-md p-8 rounded-xl bg-card border border-white/10">
        <h1 className="text-2xl font-bold text-center text-white mb-2">
          Complete Your Account
        </h1>
        <p className="text-center text-muted-foreground mb-6">
          {pendingEmail && (
            <span className="text-purple-400">{pendingEmail}</span>
          )}
        </p>

        {/* Account type indicator - skip in single-tenant mode */}
        {!singleTenantMode && (
          <div className={`flex items-center gap-2 p-3 mb-6 rounded-lg border ${
            isGeneric 
              ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' 
              : 'bg-purple-500/10 border-purple-500/20 text-purple-400'
          }`}>
            {isGeneric ? (
              <>
                <User className="w-5 h-5" />
                <span className="text-sm">Personal account</span>
              </>
            ) : (
              <>
                <Building className="w-5 h-5" />
                <span className="text-sm">Business account for <strong>{domain}</strong></span>
              </>
            )}
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 p-3 mb-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive">
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name fields */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-white mb-1">
                First name
              </label>
              <input
                type="text"
                value={givenName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="John"
                className="w-full px-3 py-2 rounded-lg bg-secondary border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-white mb-1">
                Last name
              </label>
              <input
                type="text"
                value={familyName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Doe"
                className="w-full px-3 py-2 rounded-lg bg-secondary border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
          </div>

          {/* Tenant fields - only for corporate emails when NOT in single-tenant mode */}
          {!isGeneric && !singleTenantMode && (
            <>
              <div>
                <label className="block text-sm font-medium text-white mb-1">
                  Tenant name
                </label>
                <input
                  type="text"
                  value={tenantName}
                  onChange={(e) => {
                    setTenantName(e.target.value);
                    // Auto-update slug
                    setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''));
                  }}
                  placeholder="Acme Inc."
                  required
                  className="w-full px-3 py-2 rounded-lg bg-secondary border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-white mb-1">
                  URL slug
                </label>
                <div className="flex items-center">
                  <span className="px-3 py-2 bg-secondary/50 border border-r-0 border-white/10 rounded-l-lg text-muted-foreground text-sm">
                    app.example.com/
                  </span>
                  <input
                    type="text"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                    placeholder="acme"
                    required
                    className="flex-1 px-3 py-2 rounded-r-lg bg-secondary border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                {checkingSlug && (
                  <p className="text-xs text-muted-foreground mt-1">Checking availability...</p>
                )}
                {!checkingSlug && slugAvailable === true && (
                  <p className="text-xs text-green-400 mt-1">✓ Available</p>
                )}
                {!checkingSlug && slugAvailable === false && (
                  <p className="text-xs text-red-400 mt-1">✗ {slugUnavailableReason || 'Already taken'}</p>
                )}
              </div>
            </>
          )}

          {/* Plan selection - only shown if licensing is enabled */}
          {availablePlans.length > 0 && (
            <>
              <label className="block text-sm font-medium text-white mb-2">
                Choose your plan
              </label>
              <div className="space-y-2 mb-4">
                {loadingPlans ? (
                  <div className="flex items-center justify-center p-4 rounded-lg bg-secondary border border-white/10">
                    <Loader2 className="w-5 h-5 animate-spin text-purple-500 mr-2" />
                    <span className="text-sm text-muted-foreground">Loading plans...</span>
                  </div>
                ) : (
                  availablePlans.map((plan) => (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() => setSelectedPlanId(plan.id)}
                      className={`w-full p-4 rounded-lg border-2 text-left transition-all ${
                        selectedPlanId === plan.id
                          ? 'border-purple-500 bg-purple-500/10'
                          : 'border-white/10 bg-secondary hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold text-white">{plan.name}</span>
                            {plan.displayPrice && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400">
                                {plan.displayPrice}
                              </span>
                            )}
                          </div>
                          {plan.description && (
                            <p className="text-xs text-muted-foreground mb-2">{plan.description}</p>
                          )}
                          {plan.features && Object.keys(plan.features).length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {Object.entries(plan.features)
                                .filter(([_, enabled]) => enabled)
                                .slice(0, 3)
                                .map(([feature, _]) => (
                                  <span
                                    key={feature}
                                    className="text-xs px-2 py-0.5 rounded bg-blue-500/20 text-blue-400"
                                  >
                                    {feature}
                                  </span>
                                ))}
                            </div>
                          )}
                        </div>
                        {selectedPlanId === plan.id && (
                          <div className="w-6 h-6 rounded-full bg-purple-500 flex items-center justify-center">
                            <Check className="w-4 h-4 text-white" />
                          </div>
                        )}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </>
          )}

          {/* Password fields */}
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
              minLength={8}
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <p className="text-xs text-muted-foreground mt-1">At least 8 characters</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-white mb-1">
              Confirm password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <Button
            type="submit"
            disabled={isLoading || (!isGeneric && slugAvailable === false)}
            className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500"
          >
            {isLoading ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating account...</>
            ) : (
              isGeneric ? 'Create Personal Account' : 'Create Tenant'
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}