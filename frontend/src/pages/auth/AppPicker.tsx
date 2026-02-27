/**
 * AppPicker - Application Selection Page
 * 
 * Displayed when a user accepts an invitation without a specific clientId,
 * or needs to choose which application to access.
 * User selects which application to continue to, and we redirect to
 * the application's login URL with the tenant slug.
 */

import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Loader2, LayoutGrid, ChevronRight, LogOut, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';

const API_URL = import.meta.env.VITE_API_URL || window.location.origin;

interface Application {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  clientId: string;
  initiateLoginUri: string | null;
  brandingLogoUrl: string | null;
  brandingIconUrl: string | null;
  brandingPrimaryColor: string | null;
}

export function AppPicker() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectingApp, setSelectingApp] = useState<string | null>(null);

  // Get tenant slug from query params (passed from invitation accept)
  const tenantSlug = searchParams.get('tenant') || '';
  const tenantName = searchParams.get('tenant_name') || tenantSlug;

  // Fetch available applications on mount
  useEffect(() => {
    const fetchApplications = async () => {
      console.log('[AppPicker] Fetching available applications...');
      
      try {
        const response = await fetch(`${API_URL}/api/auth/apps`, {
          credentials: 'include',
        });

        console.log('[AppPicker] /api/auth/apps response status:', response.status);

        if (!response.ok) {
          if (response.status === 401) {
            // Not authenticated, redirect to login
            console.log('[AppPicker] User not authenticated - redirecting to login');
            navigate('/auth/login');
            return;
          }
          throw new Error('Failed to fetch applications');
        }

        const data = await response.json();
        console.log('[AppPicker] Response:', {
          authenticated: data.authenticated,
          applicationCount: data.applications?.length || 0,
        });
        
        if (!data.authenticated) {
          console.log('[AppPicker] User not authenticated in response - redirecting to login');
          navigate('/auth/login');
          return;
        }

        console.log('[AppPicker] Applications:', data.applications?.map((a: Application) => a.name));
        setApplications(data.applications || []);
      } catch (err) {
        console.error('[AppPicker] Error fetching applications:', err);
        setError(err instanceof Error ? err.message : 'Failed to load applications');
      } finally {
        setLoading(false);
      }
    };

    fetchApplications();
  }, [navigate]);

  // Handle app selection - redirect to org-picker with this app's client_id
  const handleSelectApp = (app: Application) => {
    console.log('[AppPicker] User selected app:', app.name, app.clientId);
    
    setSelectingApp(app.id);

    // If we already have a tenant slug (from invitation flow), go directly to app
    if (tenantSlug && app.initiateLoginUri) {
      const redirectUrl = app.initiateLoginUri.replace('{tenant}', tenantSlug);
      console.log('[AppPicker] Have tenant slug, going directly to app:', redirectUrl);
      window.location.href = redirectUrl;
      return;
    }

    // Otherwise, go to org-picker to select a tenant for this app
    const params = new URLSearchParams();
    params.set('client_id', app.clientId);
    
    const orgPickerUrl = `/auth/org-picker?${params.toString()}`;
    console.log('[AppPicker] Redirecting to org-picker:', orgPickerUrl);
    navigate(orgPickerUrl);
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
            <LayoutGrid className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-white">Choose an Application</h1>
          <p className="text-muted-foreground mt-2">
            {tenantName ? (
              <>You've joined <span className="text-white font-medium">{tenantName}</span>. Select an app to continue.</>            ) : (
              'Select the application you want to access'
            )}
          </p>
        </div>

        {/* App List */}
        <div className="bg-card rounded-xl border border-white/10 overflow-hidden">
          {applications.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-muted-foreground">
                No applications available.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-white/10">
              {applications.map((app) => (
                <button
                  key={app.id}
                  onClick={() => handleSelectApp(app)}
                  disabled={selectingApp !== null}
                  className="w-full px-6 py-4 flex items-center gap-4 hover:bg-white/5 transition-colors disabled:opacity-50 text-left"
                >
                  {/* App Avatar */}
                  {app.brandingIconUrl || app.brandingLogoUrl ? (
                    <img
                      src={app.brandingIconUrl || app.brandingLogoUrl || ''}
                      alt={app.name}
                      className="w-12 h-12 rounded-xl object-contain bg-white/5"
                    />
                  ) : (
                    <div 
                      className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg shrink-0"
                      style={{ 
                        backgroundColor: app.brandingPrimaryColor || 'rgb(147, 51, 234)' 
                      }}
                    >
                      {app.name.charAt(0).toUpperCase()}
                    </div>
                  )}

                  {/* App Info */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-white truncate">
                      {app.name}
                    </h3>
                    {app.description && (
                      <p className="text-sm text-muted-foreground truncate">
                        {app.description}
                      </p>
                    )}
                  </div>

                  {/* Loading/Arrow */}
                  {selectingApp === app.id ? (
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
          Secured by <a href="https://www.authvital.com" target="_blank" rel="noopener noreferrer" className="hover:text-muted-foreground transition-colors">AuthVital</a>
        </p>
      </div>
    </div>
  );
}
