/**
 * VerifyEmail - Email verification handler
 * 
 * Handles the verification link clicked from email.
 * Verifies the token and redirects to complete signup.
 */

import React, { useState, useEffect, useRef } from 'react';
import { useAuthVitalConfig } from '../provider';
import { getStyles } from './styles';
import type { AppearanceProps } from '../types';

type VerifyStatus = 'loading' | 'success' | 'error' | 'expired' | 'already_completed';

export interface VerifyEmailProps {
  /** Verification token from URL */
  token: string;
  /** Callback on successful verification */
  onSuccess?: (data: VerifiedData) => void;
  /** Callback on error */
  onError?: (error: Error, status: VerifyStatus) => void;
  /** Callback to continue to complete signup */
  onContinueSignup?: (data: VerifiedData) => void;
  /** Callback to go to login */
  onLogin?: () => void;
  /** Callback to start over (signup again) */
  onStartOver?: () => void;
  /** Appearance customization */
  appearance?: AppearanceProps;
}

/**
 * Data returned after successful email verification.
 * 
 * IMPORTANT: When redirecting to complete-signup, only pass the `token` in the URL.
 * All other data (email, name) should be loaded from the token on the backend to
 * prevent PII from being exposed in URLs.
 */
export interface VerifiedData {
  /** The verification token - use this (and ONLY this) in redirect URLs */
  token: string;
  /** Email (for display only - do NOT include in URLs) */
  email?: string;
  /** Given name (for display only - do NOT include in URLs) */
  givenName?: string;
  /** Family name (for display only - do NOT include in URLs) */
  familyName?: string;
  /** Tenant name (for display only - do NOT include in URLs) */
  tenantName?: string;
}

export function VerifyEmail({
  token,
  onSuccess,
  onError,
  onContinueSignup,
  onLogin,
  onStartOver,
  appearance,
}: VerifyEmailProps) {
  const config = useAuthVitalConfig();
  const styles = getStyles(appearance);
  
  const [status, setStatus] = useState<VerifyStatus>('loading');
  const [message, setMessage] = useState('');
  const [verifiedData, setVerifiedData] = useState<VerifiedData | null>(null);
  
  // Prevent double-execution in StrictMode
  const hasVerified = useRef(false);

  useEffect(() => {
    if (hasVerified.current) return;
    hasVerified.current = true;

    const verifyToken = async () => {
      if (!token) {
        setStatus('error');
        setMessage('Invalid verification link. No token provided.');
        onError?.(new Error('No token provided'), 'error');
        return;
      }

      try {
        const response = await fetch(`${config.authVitalHost}/api/signup/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ token }),
        });

        const result = await response.json();

        if (result.success) {
          const data: VerifiedData = {
            token,
            email: result.email,
            givenName: result.givenName,
            familyName: result.familyName,
            tenantName: result.tenantName,
          };
          setStatus('success');
          setMessage(result.message || 'Email verified successfully!');
          setVerifiedData(data);
          onSuccess?.(data);
        } else {
          let newStatus: VerifyStatus = 'error';
          switch (result.error) {
            case 'EXPIRED':
              newStatus = 'expired';
              break;
            case 'ALREADY_COMPLETED':
              newStatus = 'already_completed';
              break;
          }
          setStatus(newStatus);
          setMessage(result.message || 'Verification failed.');
          onError?.(new Error(result.message || 'Verification failed'), newStatus);
        }
      } catch (err) {
        setStatus('error');
        const error = err instanceof Error ? err : new Error('Verification failed');
        setMessage(error.message);
        onError?.(error, 'error');
      }
    };

    verifyToken();
  }, [token, config.authVitalHost, onSuccess, onError]);

  const handleContinueSignup = () => {
    if (verifiedData) {
      onContinueSignup?.(verifiedData);
    }
  };

  const iconStyle = {
    width: '64px',
    height: '64px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 1rem',
    fontSize: '2rem',
  };

  return (
    <div style={styles.card}>
      {status === 'loading' && (
        <div style={{ textAlign: 'center' }}>
          <div style={{ ...iconStyle, background: 'rgba(124, 58, 237, 0.2)' }}>⏳</div>
          <h1 style={styles.title}>Verifying your email...</h1>
          <p style={styles.subtitle}>Please wait while we verify your email address.</p>
        </div>
      )}

      {status === 'success' && (
        <div style={{ textAlign: 'center' }}>
          <div style={{ ...iconStyle, background: 'rgba(22, 163, 74, 0.2)' }}>✓</div>
          <h1 style={styles.title}>Email Verified!</h1>
          <p style={styles.subtitle}>{message}</p>
          {verifiedData?.email && (
            <p style={{ color: '#7c3aed', marginBottom: '1.5rem' }}>{verifiedData.email}</p>
          )}
          <button
            onClick={handleContinueSignup}
            style={{ ...styles.primaryButton, width: '100%' }}
          >
            Continue to Complete Signup
          </button>
        </div>
      )}

      {status === 'expired' && (
        <div style={{ textAlign: 'center' }}>
          <div style={{ ...iconStyle, background: 'rgba(234, 179, 8, 0.2)' }}>⚠️</div>
          <h1 style={styles.title}>Link Expired</h1>
          <p style={{ ...styles.subtitle, marginBottom: '1.5rem' }}>{message}</p>
          <button
            onClick={onStartOver}
            style={{ ...styles.primaryButton, width: '100%' }}
          >
            Sign Up Again
          </button>
        </div>
      )}

      {status === 'already_completed' && (
        <div style={{ textAlign: 'center' }}>
          <div style={{ ...iconStyle, background: 'rgba(59, 130, 246, 0.2)' }}>✓</div>
          <h1 style={styles.title}>Already Verified</h1>
          <p style={{ ...styles.subtitle, marginBottom: '1.5rem' }}>{message}</p>
          <button
            onClick={onLogin}
            style={{ ...styles.primaryButton, width: '100%' }}
          >
            Sign In
          </button>
        </div>
      )}

      {status === 'error' && (
        <div style={{ textAlign: 'center' }}>
          <div style={{ ...iconStyle, background: 'rgba(220, 38, 38, 0.2)' }}>✗</div>
          <h1 style={styles.title}>Verification Failed</h1>
          <p style={{ ...styles.subtitle, marginBottom: '1.5rem' }}>{message}</p>
          <button
            onClick={onStartOver}
            style={{ ...styles.primaryButton, width: '100%' }}
          >
            Try Again
          </button>
        </div>
      )}
    </div>
  );
}
