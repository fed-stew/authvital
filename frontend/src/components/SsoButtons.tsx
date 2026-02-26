/**
 * SSO Buttons Component
 * 
 * Displays "Sign in with Google" / "Sign in with Microsoft" buttons
 * when SSO providers are configured for the tenant or application.
 * Fetches available providers from the backend and handles SSO initiation.
 */

import * as React from 'react';
import { Loader2 } from 'lucide-react';

// =============================================================================
// TYPES
// =============================================================================

interface SsoProvider {
  provider: string;
  name: string;
  enforced?: boolean;
}

interface SsoButtonsProps {
  tenantId?: string;
  tenantSlug?: string;
  clientId?: string;
  redirectUri?: string;
  mode?: 'login' | 'signup';
  onEnforcedProvider?: (provider: string) => void;
}

// =============================================================================
// PROVIDER ICONS
// =============================================================================

const GoogleIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
);

const MicrosoftIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 21 21" fill="none">
    <rect x="1" y="1" width="9" height="9" fill="#F25022"/>
    <rect x="11" y="1" width="9" height="9" fill="#7FBA00"/>
    <rect x="1" y="11" width="9" height="9" fill="#00A4EF"/>
    <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
  </svg>
);

// =============================================================================
// COMPONENT
// =============================================================================

export function SsoButtons({
  tenantId,
  tenantSlug,
  clientId,
  redirectUri,
  mode = 'login',
  onEnforcedProvider,
}: SsoButtonsProps) {
  const [providers, setProviders] = React.useState<SsoProvider[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [loadingProvider, setLoadingProvider] = React.useState<string | null>(null);

  // API URL from environment or current origin
  const apiUrl = import.meta.env.VITE_API_URL || window.location.origin;

  // Fetch available SSO providers
  React.useEffect(() => {
    const fetchProviders = async () => {
      try {
        setIsLoading(true);

        const params = new URLSearchParams();
        if (tenantId) params.set('tenant_id', tenantId);
        if (tenantSlug) params.set('tenant_slug', tenantSlug);

        const response = await fetch(`${apiUrl}/api/auth/sso/providers?${params.toString()}`);
        
        if (!response.ok) {
          throw new Error('Failed to fetch SSO providers');
        }

        const data = await response.json();
        setProviders(data.providers || []);

        // Check if any provider is enforced
        const enforcedProvider = data.providers?.find((p: SsoProvider) => p.enforced);
        if (enforcedProvider && onEnforcedProvider) {
          onEnforcedProvider(enforcedProvider.provider);
        }
      } catch (err) {
        console.debug('SSO providers not available:', err);
        setProviders([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchProviders();
  }, [tenantId, tenantSlug, apiUrl, onEnforcedProvider]);

  // Handle SSO button click
  const handleSsoClick = (provider: string) => {
    setLoadingProvider(provider);

    // Build authorize URL
    const params = new URLSearchParams();
    if (tenantId) params.set('tenant_id', tenantId);
    if (tenantSlug) params.set('tenant_slug', tenantSlug);
    if (clientId) params.set('client_id', clientId);
    if (redirectUri) params.set('redirect_uri', redirectUri);

    const authorizeUrl = `${apiUrl}/api/auth/sso/${provider}/authorize?${params.toString()}`;
    
    // Redirect to SSO provider
    window.location.href = authorizeUrl;
  };

  // Get provider display info
  const getProviderInfo = (provider: string) => {
    switch (provider.toLowerCase()) {
      case 'google':
        return {
          name: 'Google',
          icon: <GoogleIcon />,
          bgColor: 'bg-white hover:bg-gray-50',
          textColor: 'text-gray-700',
          borderColor: 'border-gray-300',
        };
      case 'microsoft':
        return {
          name: 'Microsoft',
          icon: <MicrosoftIcon />,
          bgColor: 'bg-white hover:bg-gray-50',
          textColor: 'text-gray-700',
          borderColor: 'border-gray-300',
        };
      default:
        return {
          name: provider,
          icon: null,
          bgColor: 'bg-gray-100 hover:bg-gray-200',
          textColor: 'text-gray-700',
          borderColor: 'border-gray-300',
        };
    }
  };

  // Don't render if no providers available
  if (!isLoading && providers.length === 0) {
    return null;
  }

  // Loading state - don't show loading spinner, just hide buttons
  if (isLoading) {
    return null;
  }

  const actionText = mode === 'signup' ? 'Sign up' : 'Sign in';

  return (
    <div className="space-y-3">
      {providers.map((provider) => {
        const info = getProviderInfo(provider.provider);
        const isButtonLoading = loadingProvider === provider.provider;

        return (
          <button
            key={provider.provider}
            onClick={() => handleSsoClick(provider.provider)}
            disabled={isButtonLoading}
            className={`
              w-full flex items-center justify-center gap-3 px-4 py-2.5
              border rounded-lg font-medium transition-colors
              ${info.bgColor} ${info.textColor} ${info.borderColor}
              disabled:opacity-50 disabled:cursor-not-allowed
            `}
          >
            {isButtonLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              info.icon
            )}
            <span>{actionText} with {info.name}</span>
          </button>
        );
      })}

      {providers.length > 0 && (
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-card text-muted-foreground">or</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default SsoButtons;
