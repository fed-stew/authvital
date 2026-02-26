/**
 * OrgPicker - Tenant Selection Page
 * 
 * Displayed when a user logs in and has access to multiple tenants.
 * User selects which tenant to continue to, and we redirect to
 * the OAuth authorize-tenant endpoint with the selected tenant.
 */

import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Loader2, Building2, ChevronRight, LogOut, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';

const API_URL = import.meta.env.VITE_API_URL || window.location.origin;

interface Tenant {
  id: string;
  name: string;
  slug: string;
}

interface Membership {
  id: string;
  role: string;
  tenant: Tenant;
}

export function OrgPicker() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectingOrg, setSelectingOrg] = useState<string | null>(null);
  const [initiateLoginUri, setInitiateLoginUri] = useState<string | null>(null);

  // Get redirect_uri (contains the OAuth authorize URL to continue after org selection)
  const redirectUri = searchParams.get('redirect_uri') || '';
  
  // Get client_id - either direct param or from redirect_uri URL
  const clientId = searchParams.get('client_id') || (() => {
    try {
      if (redirectUri) {
        const url = new URL(redirectUri, window.location.origin);
        return url.searchParams.get('client_id');
      }
    } catch { /* ignore */ }
    return null;
  })();



  // Fetch app config (initiateLoginUri) for the client application
  useEffect(() => {
    if (!clientId) return;
    
    const fetchAppConfig = async () => {
      try {
        const response = await fetch(`${API_URL}/api/branding/${clientId}`);
        if (response.ok) {
          const data = await response.json();
          if (data.initiateLoginUri) {
            setInitiateLoginUri(data.initiateLoginUri);
            console.log('[OrgPicker] Got initiateLoginUri:', data.initiateLoginUri);
          }
        }
      } catch (err) {
        console.warn('[OrgPicker] Failed to fetch app config:', err);
      }
    };
    
    fetchAppConfig();
  }, [clientId]);

  // Fetch user's memberships on mount
  useEffect(() => {
    const fetchMemberships = async () => {
      console.log('[OrgPicker] Fetching user memberships...');
      console.log('[OrgPicker] Redirect URI:', redirectUri || 'none');
      
      try {
        const response = await fetch(`${API_URL}/api/auth/me`, {
          credentials: 'include',
        });

        console.log('[OrgPicker] /api/auth/me response status:', response.status);

        if (!response.ok) {
          if (response.status === 401) {
            // Not authenticated, redirect to login
            console.log('[OrgPicker] User not authenticated - redirecting to login');
            navigate(`/auth/login${redirectUri ? `?redirect_uri=${encodeURIComponent(redirectUri)}` : ''}`);
            return;
          }
          throw new Error('Failed to fetch user info');
        }

        const data = await response.json();
        console.log('[OrgPicker] User data:', {
          authenticated: data.authenticated,
          membershipCount: data.memberships?.length || 0,
        });
        
        if (!data.authenticated) {
          console.log('[OrgPicker] User not authenticated in response - redirecting to login');
          navigate(`/auth/login${redirectUri ? `?redirect_uri=${encodeURIComponent(redirectUri)}` : ''}`);
          return;
        }

        console.log('[OrgPicker] User memberships:', data.memberships?.map((m: Membership) => m.tenant.slug));
        setMemberships(data.memberships || []);
      } catch (err) {
        console.error('[OrgPicker] Error fetching memberships:', err);
        setError(err instanceof Error ? err.message : 'Failed to load tenants');
      } finally {
        setLoading(false);
      }
    };

    fetchMemberships();
  }, [navigate, redirectUri]);

  // Handle org selection - redirect to tenant's auth endpoint
  const handleSelectOrg = async (tenant: Tenant) => {
    console.log('[OrgPicker] User selected tenant:', tenant.name, tenant.slug);
    
    setSelectingOrg(tenant.id);

    let redirectUrl: string;
    
    // Use initiateLoginUri for redirect
    if (initiateLoginUri) {
      redirectUrl = initiateLoginUri.replace('{tenant}', tenant.slug);
      console.log('[OrgPicker] Using initiateLoginUri:', initiateLoginUri);
    } else {
      // Fallback to localhost (development) - just go to root
      const port = window.location.port ? `:${window.location.port}` : '';
      redirectUrl = `${window.location.protocol}//${tenant.slug}.localhost${port}/`;
      console.log('[OrgPicker] No initiateLoginUri, using localhost fallback');
    }
    
    console.log('[OrgPicker] Redirecting to:', redirectUrl);
    window.location.href = redirectUrl;
  };

  // Handle logout
  const handleLogout = async () => {
    try {
      await fetch(`${API_URL}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // Ignore logout errors
    }
    navigate('/auth/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-card rounded-xl border border-white/10 p-8 text-center">
          <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-white mb-2">Something went wrong</h1>
          <p className="text-muted-foreground mb-6">{error}</p>
          <Button onClick={() => navigate('/auth/login')} className="w-full">
            Back to Login
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center mx-auto mb-4">
            <Building2 className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-white">Choose a Tenant</h1>
          <p className="text-muted-foreground mt-2">
            Select the workspace you want to access
          </p>
        </div>

        {/* Org List */}
        <div className="bg-card rounded-xl border border-white/10 overflow-hidden">
          {memberships.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-muted-foreground">
                You don't belong to any tenants yet.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-white/10">
              {memberships.map((membership) => (
                <button
                  key={membership.tenant.id}
                  onClick={() => handleSelectOrg(membership.tenant)}
                  disabled={selectingOrg !== null}
                  className="w-full px-6 py-4 flex items-center gap-4 hover:bg-white/5 transition-colors disabled:opacity-50 text-left"
                >
                  {/* Org Avatar */}
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center text-white font-bold text-lg shrink-0">
                    {membership.tenant.name.charAt(0).toUpperCase()}
                  </div>

                  {/* Org Info */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-white truncate">
                      {membership.tenant.name}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {membership.tenant.slug}.localhost • {membership.role}
                    </p>
                  </div>

                  {/* Loading/Arrow */}
                  {selectingOrg === membership.tenant.id ? (
                    <Loader2 className="w-5 h-5 text-primary animate-spin" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-muted-foreground" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Logout */}
        <div className="mt-6 text-center">
          <button
            onClick={handleLogout}
            className="text-sm text-muted-foreground hover:text-white transition-colors inline-flex items-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            Sign in with a different account
          </button>
        </div>

        {/* Security note */}
        <p className="mt-4 text-center text-xs text-muted-foreground/50">
          Secured by <a href="https://www.authvader.com" target="_blank" rel="noopener noreferrer" className="hover:text-muted-foreground transition-colors">AuthVader</a>
        </p>
      </div>
    </div>
  );
}
