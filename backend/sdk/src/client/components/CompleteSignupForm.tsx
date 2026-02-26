/**
 * CompleteSignupForm - Final step of signup
 * 
 * After email verification: set password and configure tenant.
 * 
 * - Corporate email → Create org with name/slug
 * - Personal email → Auto-create personal workspace
 */

import React, { useState, useEffect } from 'react';
import { useAuthVaderConfig } from '../provider';
import { getStyles } from './styles';
import type { AppearanceProps } from '../types';

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

export interface CompleteSignupFormProps {
  /** Verification token */
  token: string;
  /** Email from verification */
  email: string;
  /** Pre-filled given name */
  givenName?: string;
  /** Pre-filled family name */
  familyName?: string;
  /** Pre-filled tenant name */
  tenantName?: string;
  /** Redirect URI after completion */
  redirectUri?: string;
  /** Callback on successful signup */
  onSuccess?: (result: CompleteSignupResult) => void;
  /** Callback on error */
  onError?: (error: Error) => void;
  /** Appearance customization */
  appearance?: AppearanceProps;
}

export interface CompleteSignupResult {
  user: {
    id: string;
    email: string;
    givenName?: string;
    familyName?: string;
  };
  tenant?: {
    id: string;
    name: string;
    slug: string;
  };
  initiateLoginUri?: string;
}

export function CompleteSignupForm({
  token,
  email,
  givenName: initialGivenName = '',
  familyName: initialFamilyName = '',
  tenantName: initialOrgName = '',
  redirectUri,
  onSuccess,
  onError,
  appearance,
}: CompleteSignupFormProps) {
  const config = useAuthVaderConfig();
  const styles = getStyles(appearance);
  
  // Form state
  const [givenName, setGivenName] = useState(initialGivenName);
  const [familyName, setFamilyName] = useState(initialFamilyName);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [tenantName, setTenantName] = useState(initialOrgName || suggestOrgName(email));
  const [slug, setSlug] = useState(suggestSlug(email));
  
  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const [checkingSlug, setCheckingSlug] = useState(false);
  
  // Computed
  const isGeneric = isGenericDomain(email);
  const domain = extractDomain(email);

  // Check slug availability (debounced)
  useEffect(() => {
    if (!slug || isGeneric) {
      setSlugAvailable(null);
      return;
    }

    const timer = setTimeout(async () => {
      setCheckingSlug(true);
      try {
        const response = await fetch(`${config.authVaderHost}/api/tenants/check-slug/${slug}`, {
          credentials: 'include',
        });
        if (response.ok) {
          const result = await response.json();
          setSlugAvailable(result.available);
        } else {
          setSlugAvailable(true); // Assume available on error
        }
      } catch {
        setSlugAvailable(true); // Assume available on error
      } finally {
        setCheckingSlug(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [slug, isGeneric, config.authVaderHost]);

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
    
    if (!isGeneric && !tenantName.trim()) {
      setError('Organization name is required');
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${config.authVaderHost}/api/signup/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email,
          password,
          token,
          givenName: givenName || undefined,
          familyName: familyName || undefined,
          ...(isGeneric ? {} : {
            tenantName: tenantName.trim(),
            slug: slug.trim(),
          }),
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || 'Failed to complete signup');
      }

      setSuccess(true);
      onSuccess?.(result);
      
      // Auto-redirect after success
      setTimeout(() => {
        if (result.tenant?.slug && result.initiateLoginUri) {
          const redirectUrl = result.initiateLoginUri.replace('{tenant}', result.tenant.slug);
          window.location.href = redirectUrl;
        } else if (redirectUri) {
          window.location.href = redirectUri;
        }
      }, 2000);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to complete signup');
      setError(error.message);
      onError?.(error);
    } finally {
      setIsLoading(false);
    }
  };

  // Success state
  if (success) {
    return (
      <div style={styles.card}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: 'rgba(22, 163, 74, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1rem',
            fontSize: '2rem',
          }}>
            ✓
          </div>
          <h1 style={styles.title}>Account Created!</h1>
          <p style={styles.subtitle}>Your account has been created successfully. Redirecting...</p>
          <div style={{ marginTop: '1rem' }}>⏳</div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <h1 style={styles.title}>Complete Your Account</h1>
        <p style={{ color: '#7c3aed' }}>{email}</p>
      </div>

      {/* Account type indicator */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.75rem',
        marginBottom: '1.5rem',
        borderRadius: '0.5rem',
        background: isGeneric ? 'rgba(59, 130, 246, 0.1)' : 'rgba(124, 58, 237, 0.1)',
        border: `1px solid ${isGeneric ? 'rgba(59, 130, 246, 0.2)' : 'rgba(124, 58, 237, 0.2)'}`,
        color: isGeneric ? '#3b82f6' : '#7c3aed',
        fontSize: '0.875rem',
      }}>
        <span>{isGeneric ? '👤' : '🏢'}</span>
        <span>
          {isGeneric ? 'Personal account' : `Business account for ${domain}`}
        </span>
      </div>

      {error && <div style={styles.error}>{error}</div>}

      <form onSubmit={handleSubmit} style={styles.form}>
        {/* Name fields */}
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

        {/* Organization fields - only for corporate emails */}
        {!isGeneric && (
          <>
            <div style={styles.inputGroup}>
              <label style={styles.label}>Tenant name</label>
              <input
                type="text"
                value={tenantName}
                onChange={(e) => {
                  setTenantName(e.target.value);
                  setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''));
                }}
                placeholder="Acme Inc."
                required
                style={styles.input}
              />
            </div>
            
            <div style={styles.inputGroup}>
              <label style={styles.label}>URL slug</label>
              <div style={{ display: 'flex', alignItems: 'stretch' }}>
                <span style={{
                  padding: '0.5rem 0.75rem',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRight: 'none',
                  borderRadius: '0.5rem 0 0 0.5rem',
                  color: '#9ca3af',
                  fontSize: '0.875rem',
                  display: 'flex',
                  alignItems: 'center',
                }}>
                  app.example.com/
                </span>
                <input
                  type="text"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  placeholder="acme"
                  required
                  style={{
                    ...styles.input,
                    borderRadius: '0 0.5rem 0.5rem 0',
                    flex: 1,
                  }}
                />
              </div>
              {checkingSlug && (
                <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.25rem' }}>Checking availability...</p>
              )}
              {!checkingSlug && slugAvailable === true && (
                <p style={{ fontSize: '0.75rem', color: '#16a34a', marginTop: '0.25rem' }}>✓ Available</p>
              )}
              {!checkingSlug && slugAvailable === false && (
                <p style={{ fontSize: '0.75rem', color: '#dc2626', marginTop: '0.25rem' }}>✗ Already taken</p>
              )}
            </div>
          </>
        )}

        {/* Password fields */}
        <div style={styles.inputGroup}>
          <label style={styles.label}>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            minLength={8}
            style={styles.input}
          />
          <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.25rem' }}>At least 8 characters</p>
        </div>

        <div style={styles.inputGroup}>
          <label style={styles.label}>Confirm password</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="••••••••"
            required
            style={styles.input}
          />
        </div>

        <button
          type="submit"
          disabled={isLoading || (!isGeneric && slugAvailable === false)}
          style={{
            ...styles.primaryButton,
            width: '100%',
            ...(isLoading || (!isGeneric && slugAvailable === false) ? styles.buttonDisabled : {}),
          }}
        >
          {isLoading
            ? 'Creating account...'
            : isGeneric
            ? 'Create Personal Account'
            : 'Create Organization'}
        </button>
      </form>
    </div>
  );
}
