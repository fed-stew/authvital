/**
 * Cookie utilities for AuthVital
 *
 * Centralized cookie configuration to ensure consistent security settings.
 */

export interface CookieOptions {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'lax' | 'strict' | 'none';
  path: string;
  maxAge?: number;
  domain?: string;
}

/**
 * Determines if cookies should use the `secure` flag.
 *
 * Logic:
 * - If COOKIE_SECURE is explicitly set to 'false', returns false (for local HTTP dev)
 * - Otherwise, returns true in production, false in development
 *
 * @example
 * // .env for local dev over HTTP:
 * // COOKIE_SECURE=false
 * // NODE_ENV=production
 */
export function isSecureCookie(): boolean {
  // Explicit override takes precedence
  if (process.env.COOKIE_SECURE === 'false') {
    return false;
  }
  if (process.env.COOKIE_SECURE === 'true') {
    return true;
  }
  // Default: secure in production
  return process.env.NODE_ENV === 'production';
}

/**
 * Determines the SameSite cookie attribute based on environment variable.
 *
 * Uses COOKIE_SAMESITE env var if set (must be 'strict', 'lax', or 'none').
 * Defaults to 'strict' for maximum security.
 *
 * @example
 * // .env for development:
 * // COOKIE_SAMESITE=lax
 */
export function getCookieSameSite(): 'strict' | 'lax' | 'none' {
  const sameSite = process.env.COOKIE_SAMESITE;
  if (sameSite === 'strict' || sameSite === 'lax' || sameSite === 'none') {
    return sameSite;
  }
  // Default to 'strict' for maximum security
  return 'strict';
}

/**
 * Base cookie options for all AuthVital cookies.
 *
 * By NOT setting a domain, the browser creates a "HostOnly" cookie
 * that is only sent to the exact hostname, not subdomains.
 */
export function getBaseCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: isSecureCookie(),
    sameSite: 'lax',
    path: '/',
  };
}

/**
 * Cookie options for session cookies (7-day expiry)
 */
export function getSessionCookieOptions(): CookieOptions {
  return {
    ...getBaseCookieOptions(),
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  };
}

/**
 * Cookie options for short-lived auth flow cookies (10-minute expiry)
 */
export function getAuthFlowCookieOptions(): CookieOptions {
  return {
    ...getBaseCookieOptions(),
    maxAge: 10 * 60 * 1000, // 10 minutes
  };
}

/**
 * Cookie options for refresh token cookies in split-token architecture.
 *
 * Configuration:
 * - httpOnly: true (always) - prevents JavaScript access
 * - secure: determined by isSecureCookie() helper
 * - sameSite: 'strict' by default (configurable via COOKIE_SAMESITE env var)
 * - path: '/' - available on entire site
 * - maxAge: 30 days (configurable via REFRESH_TOKEN_MAX_AGE_DAYS env var)
 *
 * @example
 * // .env for production (default settings):
 * // Uses strict SameSite, secure=true, 30-day expiry
 *
 * // .env for local development:
 * // COOKIE_SAMESITE=lax
 * // REFRESH_TOKEN_MAX_AGE_DAYS=7
 */
export function getRefreshTokenCookieOptions(): CookieOptions {
  const maxAgeDays = parseInt(process.env.REFRESH_TOKEN_MAX_AGE_DAYS || '30', 10);
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;

  return {
    httpOnly: true,
    secure: isSecureCookie(),
    sameSite: getCookieSameSite(),
    path: '/',
    maxAge: maxAgeMs,
  };
}

/**
 * @deprecated Access tokens should no longer be set as cookies in the split-token
 * architecture. Access tokens should be returned in the response body and stored
 * in memory by the client. This function is kept for backward compatibility only
 * and will be removed in a future version.
 *
 * Use `getRefreshTokenCookieOptions()` for the refresh token cookie instead.
 */
export function getAccessTokenCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: isSecureCookie(),
    sameSite: 'lax',
    path: '/',
    maxAge: 15 * 60 * 1000, // 15 minutes
  };
}
