/**
 * @authvital/server - Session Cookie Utilities
 *
 * Secure cookie encryption/decryption for session management.
 * Encrypts access_token + refresh_token into a single session cookie.
 */

import { randomBytes } from 'crypto';
import type { TokenResponse } from '@authvital/shared';
import {
  encryptToString,
  decryptFromString,
  type EncryptedString,
} from '../crypto/index.js';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Session tokens extracted from the encrypted cookie.
 */
export interface SessionTokens {
  /** The JWT access token */
  accessToken: string;
  /** The refresh token (if available) */
  refreshToken: string | null;
  /** Token expiration timestamp */
  expiresAt: number;
  /** Session ID for tracking */
  sessionId: string;
}

/**
 * Raw token data stored in the encrypted cookie.
 */
interface CookiePayload {
  /** Access token */
  at: string;
  /** Refresh token */
  rt?: string;
  /** Expiration timestamp */
  exp: number;
  /** Session ID */
  sid: string;
  /** Issued at timestamp */
  iat: number;
}

/**
 * Cookie configuration options.
 */
export interface CookieOptions {
  /** Cookie name */
  name: string;
  /** Cookie domain */
  domain?: string;
  /** Cookie path */
  path: string;
  /** HttpOnly flag */
  httpOnly: boolean;
  /** Secure flag (HTTPS only) */
  secure: boolean;
  /** SameSite attribute */
  sameSite: 'strict' | 'lax' | 'none';
  /** Max age in seconds */
  maxAge: number;
}

// =============================================================================
// DEFAULT CONFIGURATION
// =============================================================================

/**
 * Default cookie settings following security best practices:
 * - httpOnly: Prevents XSS attacks via document.cookie
 * - secure: HTTPS only in production
 * - sameSite: 'lax' allows redirects while preventing CSRF
 * - maxAge: 30 days
 */
export const DEFAULT_COOKIE_OPTIONS: CookieOptions = {
  name: 'authvital_session',
  path: '/',
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 30 * 24 * 60 * 60, // 30 days
};

/**
 * Create cookie options for a specific environment.
 *
 * @param isProduction - Whether running in production
 * @param overrides - Custom options to override defaults
 * @returns Complete cookie options
 */
export function createCookieOptions(
  isProduction: boolean = process.env.NODE_ENV === 'production',
  overrides: Partial<CookieOptions> = {}
): CookieOptions {
  return {
    ...DEFAULT_COOKIE_OPTIONS,
    secure: isProduction,
    ...overrides,
  };
}

// =============================================================================
// ENCRYPTION / DECRYPTION
// =============================================================================

/**
 * Create an encrypted session cookie value from tokens.
 *
 * @param tokens - OAuth token response from AuthVital
 * @param secret - Encryption secret (must be at least 32 characters)
 * @returns Encrypted cookie value
 * @throws Error if encryption fails
 */
export function createSessionCookie(
  tokens: TokenResponse,
  secret: string
): EncryptedString {
  if (!secret || secret.length < 32) {
    throw new Error('Session secret must be at least 32 characters');
  }

  const payload: CookiePayload = {
    at: tokens.access_token,
    rt: tokens.refresh_token,
    exp: Math.floor(Date.now() / 1000) + tokens.expires_in,
    sid: generateSessionId(),
    iat: Math.floor(Date.now() / 1000),
  };

  return encryptToString(JSON.stringify(payload), secret);
}

/**
 * Parse and decrypt a session cookie value.
 *
 * @param cookieValue - The encrypted cookie value
 * @param secret - Encryption secret
 * @returns Decrypted session tokens
 * @throws Error if decryption fails or cookie is invalid
 */
export function parseSessionCookie(
  cookieValue: string,
  secret: string
): SessionTokens {
  if (!secret || secret.length < 32) {
    throw new Error('Session secret must be at least 32 characters');
  }

  if (!cookieValue) {
    throw new Error('Cookie value is required');
  }

  try {
    const decrypted = decryptFromString(cookieValue, secret);
    const payload: CookiePayload = JSON.parse(decrypted);

    // Validate required fields
    if (!payload.at || !payload.exp || !payload.sid) {
      throw new Error('Invalid session cookie payload');
    }

    return {
      accessToken: payload.at,
      refreshToken: payload.rt ?? null,
      expiresAt: payload.exp,
      sessionId: payload.sid,
    };
  } catch (error) {
    throw new Error(
      `Failed to parse session cookie: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Check if a session cookie is expired.
 *
 * @param tokens - Session tokens
 * @param bufferSeconds - Buffer time before expiration (default: 60 seconds)
 * @returns true if expired or about to expire
 */
export function isSessionExpired(
  tokens: SessionTokens,
  bufferSeconds = 60
): boolean {
  const now = Math.floor(Date.now() / 1000);
  return tokens.expiresAt <= now + bufferSeconds;
}

/**
 * Create a new session cookie with updated tokens (for token rotation).
 *
 * @param existingCookie - The existing encrypted cookie value
 * @param newTokens - New tokens from refresh
 * @param secret - Encryption secret
 * @returns New encrypted cookie value
 */
export function rotateSessionCookie(
  existingCookie: string,
  newTokens: TokenResponse,
  secret: string
): EncryptedString {
  // Parse existing to preserve session ID
  const existing = parseSessionCookie(existingCookie, secret);

  const payload: CookiePayload = {
    at: newTokens.access_token,
    rt: newTokens.refresh_token,
    exp: Math.floor(Date.now() / 1000) + newTokens.expires_in,
    sid: existing.sessionId, // Preserve session ID for continuity
    iat: Math.floor(Date.now() / 1000),
  };

  return encryptToString(JSON.stringify(payload), secret);
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Generate a cryptographically secure session ID.
 *
 * @returns A unique session ID
 */
function generateSessionId(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Serialize cookie options to a Set-Cookie header value.
 *
 * @param value - Cookie value
 * @param options - Cookie options
 * @returns Set-Cookie header value
 */
export function serializeCookie(
  value: string,
  options: CookieOptions
): string {
  const parts: string[] = [`${options.name}=${encodeURIComponent(value)}`];

  if (options.domain) {
    parts.push(`Domain=${options.domain}`);
  }

  parts.push(`Path=${options.path}`);

  if (options.httpOnly) {
    parts.push('HttpOnly');
  }

  if (options.secure) {
    parts.push('Secure');
  }

  parts.push(`SameSite=${options.sameSite}`);
  parts.push(`Max-Age=${options.maxAge}`);

  return parts.join('; ');
}

/**
 * Parse cookies from a request header string.
 *
 * @param cookieHeader - The Cookie header string
 * @returns Parsed cookies as a record
 */
export function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) {
    return {};
  }

  const cookies: Record<string, string> = {};
  const pairs = cookieHeader.split(';');

  for (const pair of pairs) {
    const [name, ...valueParts] = pair.trim().split('=');
    if (name && valueParts.length > 0) {
      cookies[name] = decodeURIComponent(valueParts.join('='));
    }
  }

  return cookies;
}

/**
 * Extract a specific cookie value from a request header.
 *
 * @param cookieHeader - The Cookie header string
 * @param name - Cookie name to find
 * @returns Cookie value or undefined
 */
export function getCookieValue(
  cookieHeader: string | undefined,
  name: string
): string | undefined {
  const cookies = parseCookies(cookieHeader);
  return cookies[name];
}

// =============================================================================
// CLEAR COOKIE
// =============================================================================

/**
 * Create a cookie header value to clear a session cookie.
 *
 * @param options - Cookie options
 * @returns Set-Cookie header value to clear the cookie
 */
export function createClearCookie(options: CookieOptions): string {
  const parts: string[] = [`${options.name}=`];

  if (options.domain) {
    parts.push(`Domain=${options.domain}`);
  }

  parts.push(`Path=${options.path}`);

  if (options.httpOnly) {
    parts.push('HttpOnly');
  }

  if (options.secure) {
    parts.push('Secure');
  }

  parts.push(`SameSite=${options.sameSite}`);
  parts.push('Max-Age=0');
  parts.push('Expires=Thu, 01 Jan 1970 00:00:00 GMT');

  return parts.join('; ');
}
