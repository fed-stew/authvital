/**
 * Embeddable Signup Page
 * Step 1: Enter email to receive verification link
 */

import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertCircle, Loader2, Mail } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { signupApi } from '@/lib/api';

interface EmbedConfig {
  clientId?: string;
  redirectUri?: string;
  showTerms?: boolean;
  termsUrl?: string;
  privacyUrl?: string;
  theme?: 'light' | 'dark';
}

type SignupStep = 'email' | 'sent' | 'error';

export function EmbedSignup() {
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [givenName, setFirstName] = useState('');
  const [familyName, setLastName] = useState('');
  const [tenantName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<SignupStep>('email');
  const [config, setConfig] = useState<EmbedConfig | null>(null);

  useEffect(() => {
    const configFromUrl: EmbedConfig = {
      clientId: searchParams.get('clientId') || undefined,
      redirectUri: searchParams.get('redirectUri') || undefined,
      showTerms: searchParams.get('showTerms') !== 'false',
      termsUrl: searchParams.get('termsUrl') || '/terms',
      privacyUrl: searchParams.get('privacyUrl') || '/privacy',
      theme: (searchParams.get('theme') as 'light' | 'dark') || 'dark',
    };
    setConfig(configFromUrl);

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'IDP_CONFIG') {
        setConfig(event.data.config);
      }
    };

    window.addEventListener('message', handleMessage);
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
      const result = await signupApi.initiateSignup({
        email,
        givenName: givenName || undefined,
        familyName: familyName || undefined,
        tenantName: tenantName || undefined,
        clientId: config?.clientId || '',
        redirectUri: config?.redirectUri || undefined,
      });

      if (result.success) {
        setStep('sent');
        
        if (window.parent !== window) {
          window.parent.postMessage({
            type: 'IDP_SIGNUP_INITIATED',
            payload: { email },
          }, '*');
        }
      } else {
        setError(result.message || 'Failed to send verification email');
      }
    } catch (err: any) {
      const message = err.response?.data?.message || 'Failed to send verification email';
      setError(message);
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

  const handleLogin = () => {
    if (window.parent !== window) {
      window.parent.postMessage({ type: 'IDP_NAVIGATE', payload: { to: 'login' } }, '*');
    } else {
      window.location.href = '/auth/embed/login';
    }
  };

  const isDark = config?.theme !== 'light';

  // Email sent confirmation
  if (step === 'sent') {
    return (
      <div className={`min-h-screen flex items-center justify-center p-4 ${isDark ? 'bg-[#0f172a]' : 'bg-gray-50'}`}>
        <div className={`w-full max-w-md p-8 rounded-xl text-center ${isDark ? 'bg-card border border-white/10' : 'bg-white border border-gray-200 shadow-lg'}`}>
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-purple-500/20 flex items-center justify-center">
            <Mail className="w-8 h-8 text-purple-500" />
          </div>
          <h1 className={`text-2xl font-bold mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
            Check your email
          </h1>
          <p className={`mb-2 ${isDark ? 'text-muted-foreground' : 'text-gray-600'}`}>
            We sent a verification link to
          </p>
          <p className="text-purple-400 font-medium mb-6">{email}</p>
          <p className={`text-sm mb-6 ${isDark ? 'text-muted-foreground' : 'text-gray-500'}`}>
            Click the link in the email to verify your address and complete your signup.
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
              onClick={() => setStep('email')}
              className={`text-sm ${isDark ? 'text-muted-foreground hover:text-white' : 'text-gray-500 hover:text-gray-700'}`}
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

  return (
    <div className={`min-h-screen flex items-center justify-center p-4 ${isDark ? 'bg-[#0f172a]' : 'bg-gray-50'}`}>
      <div className={`w-full max-w-md p-8 rounded-xl ${isDark ? 'bg-card border border-white/10' : 'bg-white border border-gray-200 shadow-lg'}`}>
        <h1 className={`text-2xl font-bold text-center mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
          Create an account
        </h1>
        <p className={`text-center mb-6 ${isDark ? 'text-muted-foreground' : 'text-gray-600'}`}>
          Start your free trial today
        </p>

        {error && (
          <div className="flex items-center gap-2 p-3 mb-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive">
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-white' : 'text-gray-700'}`}>
                First name
              </label>
              <input
                type="text"
                value={givenName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="John"
                className={`w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-purple-500 ${
                  isDark ? 'bg-secondary border-white/10 text-white' : 'bg-white border-gray-300 text-gray-900'
                }`}
              />
            </div>
            <div>
              <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-white' : 'text-gray-700'}`}>
                Last name
              </label>
              <input
                type="text"
                value={familyName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Doe"
                className={`w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-purple-500 ${
                  isDark ? 'bg-secondary border-white/10 text-white' : 'bg-white border-gray-300 text-gray-900'
                }`}
              />
            </div>
          </div>

          <div>
            <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-white' : 'text-gray-700'}`}>
              Work email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              required
              className={`w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-purple-500 ${
                isDark ? 'bg-secondary border-white/10 text-white' : 'bg-white border-gray-300 text-gray-900'
              }`}
            />
          </div>

          <Button
            type="submit"
            disabled={isLoading}
            className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500"
          >
            {isLoading ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Sending verification...</>
            ) : (
              'Continue with email'
            )}
          </Button>
        </form>

        <p className={`text-center mt-6 text-sm ${isDark ? 'text-muted-foreground' : 'text-gray-600'}`}>
          Already have an account?{' '}
          <button
            onClick={handleLogin}
            className="text-purple-400 hover:text-purple-300 font-medium"
          >
            Sign in
          </button>
        </p>
      </div>
    </div>
  );
}
