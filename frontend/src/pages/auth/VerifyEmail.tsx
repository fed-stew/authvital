/**
 * Email Verification Page
 * Handles the verification link clicked from email
 */

import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { AlertCircle, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { signupApi } from '@/lib/api';

type VerifyStatus = 'loading' | 'success' | 'error' | 'expired' | 'already_completed';

export function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<VerifyStatus>('loading');
  const [message, setMessage] = useState('');
  const [verifiedData, setVerifiedData] = useState<{
    email?: string;
    givenName?: string;
    familyName?: string;
    tenantName?: string;
  } | null>(null);
  
  // Prevent double-execution in StrictMode
  const hasVerified = useRef(false);

  const token = searchParams.get('token');

  useEffect(() => {
    // Prevent running twice
    if (hasVerified.current) return;
    hasVerified.current = true;

    const verifyToken = async () => {
      if (!token) {
        setStatus('error');
        setMessage('Invalid verification link. No token provided.');
        return;
      }

      try {
        console.log('Verifying token:', token);
        const result = await signupApi.verifyToken(token);
        console.log('Verification result:', result);
        
        if (result.success) {
          setStatus('success');
          setMessage(result.message || 'Email verified successfully!');
          setVerifiedData({
            email: result.email,
            givenName: result.givenName,
            familyName: result.familyName,
            tenantName: result.tenantName,
          });
        } else {
          switch (result.error) {
            case 'EXPIRED':
              setStatus('expired');
              break;
            case 'ALREADY_COMPLETED':
              setStatus('already_completed');
              break;
            default:
              setStatus('error');
          }
          setMessage(result.message || 'Verification failed.');
        }
      } catch (err: any) {
        console.error('Verification error:', err);
        setStatus('error');
        setMessage(err.response?.data?.message || 'Verification failed. Please try again.');
      }
    };

    verifyToken();
  }, []); // Empty deps - run once on mount

  const handleContinueSignup = () => {
    // Only pass the token - all other data (email, name) will be loaded from the token on the backend
    // This prevents PII from being exposed in the URL
    const params = new URLSearchParams();
    if (token) params.set('token', token);
    
    navigate(`/auth/complete-signup?${params.toString()}`);
  };

  const handleLogin = () => {
    navigate('/auth/embed/login');
  };

  const handleStartOver = () => {
    navigate('/auth/embed/signup');
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#0f172a]">
      <div className="w-full max-w-md p-8 rounded-xl bg-card border border-white/10">
        {status === 'loading' && (
          <div className="text-center">
            <Loader2 className="w-12 h-12 mx-auto mb-4 animate-spin text-purple-500" />
            <h1 className="text-xl font-bold text-white mb-2">Verifying your email...</h1>
            <p className="text-muted-foreground">Please wait while we verify your email address.</p>
          </div>
        )}

        {status === 'success' && (
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-500/20 flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-green-500" />
            </div>
            <h1 className="text-xl font-bold text-white mb-2">Email Verified!</h1>
            <p className="text-muted-foreground mb-2">{message}</p>
            {verifiedData?.email && (
              <p className="text-sm text-purple-400 mb-6">{verifiedData.email}</p>
            )}
            <Button
              onClick={handleContinueSignup}
              className="w-full bg-gradient-to-r from-purple-600 to-pink-600"
            >
              Continue to Complete Signup
            </Button>
          </div>
        )}

        {status === 'expired' && (
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-yellow-500/20 flex items-center justify-center">
              <AlertCircle className="w-8 h-8 text-yellow-500" />
            </div>
            <h1 className="text-xl font-bold text-white mb-2">Link Expired</h1>
            <p className="text-muted-foreground mb-6">{message}</p>
            <Button
              onClick={handleStartOver}
              className="w-full bg-gradient-to-r from-purple-600 to-pink-600"
            >
              Sign Up Again
            </Button>
          </div>
        )}

        {status === 'already_completed' && (
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-500/20 flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-blue-500" />
            </div>
            <h1 className="text-xl font-bold text-white mb-2">Already Verified</h1>
            <p className="text-muted-foreground mb-6">{message}</p>
            <Button
              onClick={handleLogin}
              className="w-full bg-gradient-to-r from-purple-600 to-pink-600"
            >
              Sign In
            </Button>
          </div>
        )}

        {status === 'error' && (
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
              <XCircle className="w-8 h-8 text-red-500" />
            </div>
            <h1 className="text-xl font-bold text-white mb-2">Verification Failed</h1>
            <p className="text-muted-foreground mb-6">{message}</p>
            <Button
              onClick={handleStartOver}
              className="w-full bg-gradient-to-r from-purple-600 to-pink-600"
            >
              Try Again
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
