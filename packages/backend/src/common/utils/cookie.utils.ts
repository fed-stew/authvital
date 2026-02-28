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
