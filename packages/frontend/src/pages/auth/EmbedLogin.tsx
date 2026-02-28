/**
 * Embeddable Login Page
 * Can be used standalone or in an iframe with postMessage communication
 */

import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { authApi } from '@/lib/api';

interface EmbedConfig {
  clientId?: string;
  redirectUri?: string;
  showSignUp?: boolean;
  showForgotPassword?: boolean;
  theme?: 'light' | 'dark';
}

export function EmbedLogin() {
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<EmbedConfig | null>(null);

  // Parse config from URL params or postMessage
  useEffect(() => {
    const configFromUrl: EmbedConfig = {
      clientId: searchParams.get('clientId') || undefined,
      redirectUri: searchParams.get('redirectUri') || undefined,
      showSignUp: searchParams.get('showSignUp') !== 'false',
      showForgotPassword: searchParams.get('showForgotPassword') !== 'false',
      theme: (searchParams.get('theme') as 'light' | 'dark') || 'dark',
    };
    setConfig(configFromUrl);

    // Listen for postMessage config updates
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'IDP_CONFIG') {
        setConfig(event.data.config);
      }
    };

    window.addEventListener('message', handleMessage);
    
    // Notify parent that we're ready
    if (window.parent !== window) {
      window.parent.postMessage({ type: 'IDP_READY' }, '*');
    }

    return () => window.removeEventListener('message', handleMessage);
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const result = await authApi.login(email, password);
      
      // Send success message to parent (for iframe mode)
      if (window.parent !== window) {
        window.parent.postMessage({
          type: 'IDP_LOGIN_SUCCESS',
          payload: {
            user: result.user,
            accessToken: result.accessToken,
            refreshToken: result.refreshToken,
          },
        }, '*');
      }

      // If OAuth flow, redirect
      if (config?.clientId && config?.redirectUri) {
        // Get authorization code and redirect
        // For now, just redirect to callback with token
        window.location.href = `${config.redirectUri}?success=true`;
      }
    } catch (err: any) {
      const message = err.response?.data?.message || 'Login failed';
      setError(message);
      
      // Send error to parent
      if (window.parent !== window) {
        window.parent.postMessage({
          type: 'IDP_LOGIN_ERROR',
          payload: { error: message },
        }, '*');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = () => {
    if (window.parent !== window) {
      window.parent.postMessage({ type: 'IDP_NAVIGATE', payload: { to: 'forgot-password' } }, '*');
    } else {
      window.location.href = '/auth/embed/forgot-password';
    }
  };

  const handleSignUp = () => {
    if (window.parent !== window) {
      window.parent.postMessage({ type: 'IDP_NAVIGATE', payload: { to: 'signup' } }, '*');
    } else {
      window.location.href = '/auth/embed/signup';
    }
  };

  const isDark = config?.theme !== 'light';

  return (
    <div className={`min-h-screen flex items-center justify-center p-4 ${isDark ? 'bg-[#0f172a]' : 'bg-gray-50'}`}>
      <div className={`w-full max-w-md p-8 rounded-xl ${isDark ? 'bg-card border border-white/10' : 'bg-white border border-gray-200 shadow-lg'}`}>
        <h1 className={`text-2xl font-bold text-center mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
          Welcome back
        </h1>
        <p className={`text-center mb-6 ${isDark ? 'text-muted-foreground' : 'text-gray-600'}`}>
          Sign in to your account
        </p>

        {error && (
          <div className="flex items-center gap-2 p-3 mb-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive">
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-white' : 'text-gray-700'}`}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              className={`w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-purple-500 ${
                isDark
                  ? 'bg-secondary border-white/10 text-white'
                  : 'bg-white border-gray-300 text-gray-900'
              }`}
            />
          </div>

          <div>
            <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-white' : 'text-gray-700'}`}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className={`w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-purple-500 ${
                isDark
                  ? 'bg-secondary border-white/10 text-white'
                  : 'bg-white border-gray-300 text-gray-900'
              }`}
            />
          </div>

          {config?.showForgotPassword && (
            <div className="text-right">
              <button
                type="button"
                onClick={handleForgotPassword}
                className="text-sm text-purple-400 hover:text-purple-300"
              >
                Forgot password?
              </button>
            </div>
          )}

          <Button
            type="submit"
            disabled={isLoading}
            className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500"
          >
            {isLoading ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Signing in...</>
            ) : (
              'Sign in'
            )}
          </Button>
        </form>

        {config?.showSignUp && (
          <p className={`text-center mt-6 text-sm ${isDark ? 'text-muted-foreground' : 'text-gray-600'}`}>
            Don't have an account?{' '}
            <button
              onClick={handleSignUp}
              className="text-purple-400 hover:text-purple-300 font-medium"
            >
              Sign up
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
