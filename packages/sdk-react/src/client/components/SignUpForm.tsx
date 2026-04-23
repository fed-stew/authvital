/**
 * SignUpForm - Email signup with verification flow
 * 
 * Step 1 of signup: Enter email to receive verification link
 */

import React, { useState } from 'react';
import { useAuthVitalConfig } from '../provider';
import { getStyles } from './styles';
import type { AppearanceProps } from '../types';

export interface SignUpFormProps {
  /** Callback when verification email is sent */
  onSuccess?: (data: { email: string; message: string }) => void;
  /** Callback on error */
  onError?: (error: Error) => void;
  /** Show "Sign in" link */
  showSignInLink?: boolean;
  /** Callback when user clicks sign in link */
  onSignInClick?: () => void;
  /** Redirect URI after signup completion */
  redirectUri?: string;
  /** Appearance customization */
  appearance?: AppearanceProps;
}

export function SignUpForm({
  onSuccess,
  onError,
  showSignInLink = true,
  onSignInClick,
  redirectUri,
  appearance,
}: SignUpFormProps) {
  const config = useAuthVitalConfig();
  const styles = getStyles(appearance);
  
  const [email, setEmail] = useState('');
  const [givenName, setGivenName] = useState('');
  const [familyName, setFamilyName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${config.authVitalHost}/api/signup/initiate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email,
          givenName: givenName || undefined,
          familyName: familyName || undefined,
          redirectUri,
          clientId: config.clientId,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || 'Failed to send verification email');
      }

      if (result.success) {
        setEmailSent(true);
        onSuccess?.({ email, message: result.message || 'Verification email sent' });
      } else {
        throw new Error(result.message || 'Failed to send verification email');
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to send verification email');
      setError(error.message);
      onError?.(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${config.authVitalHost}/api/signup/resend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, redirectUri }),
      });
      
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.message || 'Failed to resend email');
      }
      
      setError(null);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to resend email');
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Email sent confirmation
  if (emailSent) {
    return (
      <div style={styles.card}>
        <div style={styles.header}>
          <div style={{ ...styles.avatar, width: '64px', height: '64px', margin: '0 auto 1rem', fontSize: '1.5rem' }}>
            ✉️
          </div>
          <h1 style={styles.title}>Check your email</h1>
          <p style={styles.subtitle}>We sent a verification link to</p>
          <p style={{ color: '#7c3aed', fontWeight: 500, marginTop: '0.5rem' }}>{email}</p>
        </div>

        <p style={{ ...styles.subtitle, marginBottom: '1.5rem' }}>
          Click the link in the email to verify your address and complete your signup.
        </p>

        <button
          onClick={handleResend}
          disabled={isLoading}
          style={{
            ...styles.secondaryButton,
            width: '100%',
            ...(isLoading ? styles.buttonDisabled : {}),
          }}
        >
          {isLoading ? 'Sending...' : 'Resend verification email'}
        </button>

        <button
          onClick={() => setEmailSent(false)}
          style={{ ...styles.link, display: 'block', marginTop: '1rem', textAlign: 'center', width: '100%', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          Use a different email
        </button>

        {error && <div style={styles.error}>{error}</div>}
      </div>
    );
  }

  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <h1 style={styles.title}>Create an account</h1>
        <p style={styles.subtitle}>Start your free trial today</p>
      </div>

      {error && <div style={styles.error}>{error}</div>}

      <form onSubmit={handleSubmit} style={styles.form}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div style={styles.inputGroup}>
            <label style={styles.label}>First name</label>
            <input
              type="text"
              value={givenName}
              onChange={(e) => setGivenName(e.target.value)}
              placeholder="John"
              style={styles.input}
            />
          </div>
          <div style={styles.inputGroup}>
            <label style={styles.label}>Last name</label>
            <input
              type="text"
              value={familyName}
              onChange={(e) => setFamilyName(e.target.value)}
              placeholder="Doe"
              style={styles.input}
            />
          </div>
        </div>

        <div style={styles.inputGroup}>
          <label style={styles.label}>Work email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            required
            style={styles.input}
          />
        </div>

        <button
          type="submit"
          disabled={isLoading}
          style={{
            ...styles.primaryButton,
            width: '100%',
            ...(isLoading ? styles.buttonDisabled : {}),
          }}
        >
          {isLoading ? 'Sending verification...' : 'Continue with email'}
        </button>
      </form>

      {showSignInLink && (
        <div style={styles.footer}>
          Already have an account?{' '}
          <button
            type="button"
            onClick={onSignInClick}
            style={{ ...styles.link, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            Sign in
          </button>
        </div>
      )}
    </div>
  );
}
