/**
 * Shared URL validation utilities for security.
 *
 * These utilities provide comprehensive validation for:
 * - Redirect URI patterns (with wildcards and tenant placeholders)
 * - Safe URLs (branding URLs, web origins, webhooks)
 *
 * Security features:
 * - Rejects dangerous schemes (javascript:, data:, file:, etc.)
 * - Rejects null bytes, CRLF injection, tab/newline characters
 * - Rejects encoded protocol markers and backslash tricks
 * - Rejects protocol-relative URLs
 * - Rejects URL fragments
 */

import {
  validateRedirectUriPattern as baseValidateRedirectUriPattern,
  type RedirectUriValidationResult,
} from './redirect-uri.utils';

export type { RedirectUriValidationResult };

// =============================================================================
// SECURITY CONSTANTS
// =============================================================================

/**
 * Dangerous URL schemes that could lead to XSS, data injection,
 * or local file access attacks.
 */
export const DANGEROUS_SCHEMES = [
  'javascript:',
  'data:',
  'vbscript:',
  'file:',
  'about:',
  'blob:',
];

/**
 * Dangerous patterns that indicate URL manipulation attempts:
 * - Protocol-relative URLs (//evil.com)
 * - Encoded protocol markers (%3a%2f%2f = ://)
 * - Backslash characters (IE/Edge URL parsing tricks)
 * - Null bytes (%00, \x00)
 * - CRLF injection (%0d, %0a)
 * - Tab/newline characters
 */
export const DANGEROUS_PATTERNS = [
  /^\/\//, // Protocol-relative URLs
  /%3a%2f%2f/i, // Encoded protocol markers (://)
  /%2f%2f/i, // Encoded slashes
  /\\/, // Backslash tricks
  /%00/, // URL-encoded null byte
  /\x00/, // Null byte
  /[\t\r\n]/, // Tab/newline injection
  /%0d|%0a/i, // CRLF injection
];

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Checks if a URL contains any dangerous schemes.
 */
function containsDangerousScheme(url: string): { dangerous: boolean; scheme?: string } {
  const lowerUrl = url.toLowerCase().trim();

  for (const scheme of DANGEROUS_SCHEMES) {
    if (lowerUrl.startsWith(scheme)) {
      return { dangerous: true, scheme };
    }
  }

  return { dangerous: false };
}

/**
 * Checks if a URL contains any dangerous patterns.
 */
function containsDangerousPattern(url: string): { dangerous: boolean; pattern?: string } {
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(url)) {
      return { dangerous: true, pattern: pattern.toString() };
    }
  }

  return { dangerous: false };
}

/**
 * Checks if a URL contains a fragment (hash).
 */
function containsFragment(url: string): boolean {
  return url.includes('#');
}

/**
 * Checks if a URL contains overly permissive wildcards.
 * Only allows wildcards in specific positions (subdomain).
 */
function containsInvalidWildcard(url: string, allowWildcards: boolean): { invalid: boolean; reason?: string } {
  if (!url.includes('*')) {
    return { invalid: false };
  }

  if (!allowWildcards) {
    return { invalid: true, reason: 'Wildcards are not allowed' };
  }

  // Wildcard pattern: only allowed in subdomain position (e.g., https://*.example.com)
  const validWildcardPattern = /^https?:\/\/\*\.([a-zA-Z0-9-]+\.)*[a-zA-Z0-9-]+(:\d+)?(\/.*)?$/;

  if (!validWildcardPattern.test(url)) {
    return {
      invalid: true,
      reason: 'Wildcards are only allowed in subdomain position (e.g., https://*.example.com/callback)',
    };
  }

  // Ensure valid domain after *.
  const hostMatch = url.match(/^https?:\/\/\*\.([^/]+)/);
  if (hostMatch) {
    const domainPart = hostMatch[1];
    if (!domainPart.includes('.') && !domainPart.match(/^localhost(:\d+)?$/)) {
      return {
        invalid: true,
        reason: 'Must have a valid domain after *. (e.g., *.example.com or *.localhost:3000)',
      };
    }
  }

  return { invalid: false };
}

/**
 * Checks if a URL contains tenant placeholder in invalid position.
 */
function containsInvalidTenantPlaceholder(url: string, allowTenantPlaceholder: boolean): { invalid: boolean; reason?: string } {
  if (!url.includes('{tenant}')) {
    return { invalid: false };
  }

  if (!allowTenantPlaceholder) {
    return { invalid: true, reason: 'Tenant placeholder {tenant} is not allowed' };
  }

  // Tenant placeholder pattern: only allowed in subdomain position
  const validTenantPattern = /^https?:\/\/\{tenant\}\.([a-zA-Z0-9-]+\.)*[a-zA-Z0-9-]+(:\d+)?(\/.*)?$/;

  if (!validTenantPattern.test(url)) {
    return {
      invalid: true,
      reason: '{tenant} is only allowed in subdomain position (e.g., https://{tenant}.example.com/callback)',
    };
  }

  return { invalid: false };
}

// =============================================================================
// MAIN VALIDATION FUNCTIONS
// =============================================================================

/**
 * Validates a redirect URI pattern for security.
 *
 * Supports:
 * - Exact matches (e.g., https://example.com/callback)
 * - Wildcards in subdomain position (e.g., https://*.example.com/callback)
 * - Tenant placeholder in subdomain position (e.g., https://{tenant}.example.com/callback)
 *
 * Security checks:
 * - Rejects dangerous schemes (javascript:, data:, file:, etc.)
 * - Rejects null bytes, CRLF injection
 * - Rejects protocol-relative URLs
 * - Rejects URL fragments
 *
 * @param uri - The redirect URI pattern to validate
 * @returns Validation result with valid=true if valid, or valid=false with error message
 */
export function validateRedirectUriPattern(uri: string): RedirectUriValidationResult {
  if (!uri || typeof uri !== 'string') {
    return { valid: false, error: 'URI is required and must be a string' };
  }

  // Check for dangerous schemes
  const schemeCheck = containsDangerousScheme(uri);
  if (schemeCheck.dangerous) {
    return {
      valid: false,
      error: `Invalid URI "${uri}": Dangerous scheme "${schemeCheck.scheme}" is not allowed`,
    };
  }

  // Check for dangerous patterns
  const patternCheck = containsDangerousPattern(uri);
  if (patternCheck.dangerous) {
    return {
      valid: false,
      error: `Invalid URI "${uri}": Contains dangerous characters or patterns`,
    };
  }

  // Check for fragments
  if (containsFragment(uri)) {
    return {
      valid: false,
      error: `Invalid URI "${uri}": URL fragments (\#) are not allowed`,
    };
  }

  // Use base validation for wildcard and tenant placeholder logic
  return baseValidateRedirectUriPattern(uri);
}

/**
 * Validates a safe URL for branding, web origins, webhooks, etc.
 *
 * Requirements:
 * - Must be http:// or https://
 * - No dangerous schemes
 * - No dangerous patterns
 * - No fragments
 * - No wildcards (unless allowWildcards=true)
 * - No tenant placeholders (unless allowTenantPlaceholder=true)
 * - HTTPS required (if requireHttps=true)
 *
 * @param url - The URL to validate
 * @param options - Validation options
 * @returns Validation result with valid=true if valid, or valid=false with error message
 */
export function validateSafeUrl(
  url: string,
  options: {
    allowWildcards?: boolean;
    allowTenantPlaceholder?: boolean;
    requireHttps?: boolean;
  } = {},
): RedirectUriValidationResult {
  if (!url || typeof url !== 'string') {
    return { valid: false, error: 'URL is required and must be a string' };
  }

  const { allowWildcards = false, allowTenantPlaceholder = false, requireHttps = false } = options;

  // Check for dangerous schemes
  const schemeCheck = containsDangerousScheme(url);
  if (schemeCheck.dangerous) {
    return {
      valid: false,
      error: `Invalid URL "${url}": Dangerous scheme "${schemeCheck.scheme}" is not allowed`,
    };
  }

  // Check for dangerous patterns
  const patternCheck = containsDangerousPattern(url);
  if (patternCheck.dangerous) {
    return {
      valid: false,
      error: `Invalid URL "${url}": Contains dangerous characters or patterns`,
    };
  }

  // Check for fragments
  if (containsFragment(url)) {
    return {
      valid: false,
      error: `Invalid URL "${url}": URL fragments (\#) are not allowed`,
    };
  }

  // Must start with http:// or https://
  if (!url.match(/^https?:\/\//)) {
    return {
      valid: false,
      error: `Invalid URL "${url}": Must start with http:// or https://`,
    };
  }

  // Check HTTPS requirement
  if (requireHttps && !url.startsWith('https://')) {
    return {
      valid: false,
      error: `Invalid URL "${url}": HTTPS is required`,
    };
  }

  // Check wildcards
  const wildcardCheck = containsInvalidWildcard(url, allowWildcards);
  if (wildcardCheck.invalid) {
    return {
      valid: false,
      error: `Invalid URL "${url}": ${wildcardCheck.reason}`,
    };
  }

  // Check tenant placeholder
  const tenantCheck = containsInvalidTenantPlaceholder(url, allowTenantPlaceholder);
  if (tenantCheck.invalid) {
    return {
      valid: false,
      error: `Invalid URL "${url}": ${tenantCheck.reason}`,
    };
  }

  // Validate URL format
  try {
    // Substitute placeholders with valid test values for parsing
    const testUrl = url
      .replace('*', 'wildcard-test')
      .replace('{tenant}', 'test-tenant');
    new URL(testUrl);
  } catch {
    return {
      valid: false,
      error: `Invalid URL "${url}": Not a valid URL format`,
    };
  }

  return { valid: true };
}

/**
 * Validates an array of redirect URI patterns.
 *
 * @param uris - Array of redirect URI patterns to validate
 * @returns Validation result - if invalid, error contains details of first failure
 */
export function validateRedirectUriPatterns(uris: string[]): { valid: boolean; error?: string } {
  if (!Array.isArray(uris)) {
    return { valid: false, error: 'Expected an array of URIs' };
  }

  for (const uri of uris) {
    const result = validateRedirectUriPattern(uri);
    if (!result.valid) {
      return result;
    }
  }

  return { valid: true };
}

/**
 * Validates an array of safe URLs.
 *
 * @param urls - Array of URLs to validate
 * @param options - Validation options passed to validateSafeUrl
 * @returns Validation result - if invalid, error contains details of first failure
 */
export function validateSafeUrls(
  urls: string[],
  options: {
    allowWildcards?: boolean;
    allowTenantPlaceholder?: boolean;
    requireHttps?: boolean;
  } = {},
): { valid: boolean; error?: string } {
  if (!Array.isArray(urls)) {
    return { valid: false, error: 'Expected an array of URLs' };
  }

  for (const url of urls) {
    const result = validateSafeUrl(url, options);
    if (!result.valid) {
      return result;
    }
  }

  return { valid: true };
}
