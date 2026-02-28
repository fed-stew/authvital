/**
 * Shared utilities for redirect URI pattern validation.
 *
 * These utilities validate URI patterns that may include:
 * - Wildcard (*) in subdomain position (e.g., https://*.example.com/callback)
 * - Tenant placeholder ({tenant}) in subdomain position (e.g., https://{tenant}.example.com/callback)
 */

/**
 * Result of a redirect URI pattern validation.
 */
export interface RedirectUriValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates a redirect URI pattern for correct syntax.
 *
 * This function performs synchronous validation of URI patterns used for OAuth redirects.
 * It checks:
 * - URI must start with http:// or https://
 * - Wildcards (*) are only allowed in subdomain position
 * - {tenant} placeholder is only allowed in subdomain position
 * - URI must be a valid URL format (after substituting placeholders)
 *
 * @param uri - The redirect URI pattern to validate
 * @returns RedirectUriValidationResult with valid=true if valid, or valid=false with error message
 *
 * @example
 * // Valid patterns
 * validateRedirectUriPattern('https://example.com/callback')           // { valid: true }
 * validateRedirectUriPattern('https://*.example.com/callback')         // { valid: true }
 * validateRedirectUriPattern('https://{tenant}.example.com/callback')  // { valid: true }
 *
 * @example
 * // Invalid patterns
 * validateRedirectUriPattern('ftp://example.com')     // { valid: false, error: '...must start with http:// or https://' }
 * validateRedirectUriPattern('https://example.*.com') // { valid: false, error: '...wildcards only allowed in subdomain...' }
 */
export function validateRedirectUriPattern(uri: string): RedirectUriValidationResult {
  // Must start with http:// or https://
  if (!uri.match(/^https?:\/\//)) {
    return {
      valid: false,
      error: `Invalid URI "${uri}": Must start with http:// or https://`,
    };
  }

  // Validate wildcard placement (only allowed in subdomain position)
  if (uri.includes('*')) {
    const wildcardResult = validateWildcardPlacement(uri);
    if (!wildcardResult.valid) {
      return wildcardResult;
    }
  }

  // Validate {tenant} placeholder placement (only allowed in subdomain position)
  if (uri.includes('{tenant}')) {
    const tenantResult = validateTenantPlaceholderPlacement(uri);
    if (!tenantResult.valid) {
      return tenantResult;
    }
  }

  // Validate URL format by substituting placeholders and parsing
  const urlFormatResult = validateUrlFormat(uri);
  if (!urlFormatResult.valid) {
    return urlFormatResult;
  }

  return { valid: true };
}

/**
 * Validates wildcard (*) placement in a URI.
 * Wildcards are only allowed in the subdomain position (e.g., https://*.example.com).
 */
function validateWildcardPlacement(uri: string): RedirectUriValidationResult {
  // Pattern: protocol://[*].domain.tld[:port][/path]
  const wildcardPattern = /^https?:\/\/\*\.([a-zA-Z0-9-]+\.)*[a-zA-Z0-9-]+(:\d+)?(\/.*)?$/;

  if (!wildcardPattern.test(uri)) {
    return {
      valid: false,
      error: `Invalid wildcard in "${uri}": Wildcards are only allowed in subdomain position (e.g., http://*.example.com/callback)`,
    };
  }

  // Additional check: ensure there's a valid domain after *.
  const hostMatch = uri.match(/^https?:\/\/\*\.([^/]+)/);
  if (hostMatch) {
    const domainPart = hostMatch[1];
    // Domain must either contain a dot (e.g., example.com) or be localhost with optional port
    if (!domainPart.includes('.') && !domainPart.match(/^localhost(:\d+)?$/)) {
      return {
        valid: false,
        error: `Invalid wildcard in "${uri}": Must have a valid domain after *. (e.g., *.example.com or *.localhost:3000)`,
      };
    }
  }

  return { valid: true };
}

/**
 * Validates {tenant} placeholder placement in a URI.
 * The {tenant} placeholder is only allowed in the subdomain position.
 */
function validateTenantPlaceholderPlacement(uri: string): RedirectUriValidationResult {
  // Pattern: protocol://{tenant}.domain.tld[:port][/path]
  const tenantPattern = /^https?:\/\/\{tenant\}\.([a-zA-Z0-9-]+\.)*[a-zA-Z0-9-]+(:\d+)?(\/.*)?$/;

  if (!tenantPattern.test(uri)) {
    return {
      valid: false,
      error: `Invalid tenant placeholder in "${uri}": {tenant} is only allowed in subdomain position (e.g., https://{tenant}.example.com/callback)`,
    };
  }

  return { valid: true };
}

/**
 * Validates that the URI is a valid URL format by substituting placeholders
 * and attempting to parse it.
 */
function validateUrlFormat(uri: string): RedirectUriValidationResult {
  try {
    // Substitute placeholders with valid test values
    const testUri = uri
      .replace('*', 'wildcard-test')
      .replace('{tenant}', 'test-tenant');
    new URL(testUri);
    return { valid: true };
  } catch {
    return {
      valid: false,
      error: `Invalid URI "${uri}": Not a valid URL format`,
    };
  }
}
