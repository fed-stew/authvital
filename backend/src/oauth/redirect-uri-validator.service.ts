import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Result of redirect URI validation.
 */
export interface RedirectUriValidationResult {
  valid: boolean;
  reason?: string;
  /** The matched pattern if validation succeeded */
  matchedPattern?: string;
  /** Extracted tenant slug if {tenant} placeholder was matched */
  extractedTenant?: string;
}

/**
 * Options for redirect URI validation.
 */
export interface RedirectUriValidationOptions {
  /** Whether to allow localhost URIs (default: true in dev, false in prod) */
  allowLocalhost?: boolean;
  /** Whether to validate that {tenant} exists in database (default: true) */
  validateTenantExists?: boolean;
  /** Whether to allow IP addresses (default: false) */
  allowIpAddresses?: boolean;
  /** Whether to allow HTTP (non-HTTPS) URIs (default: false in prod) */
  allowHttp?: boolean;
}

/**
 * Dangerous URL schemes that should never be allowed as redirect URIs.
 * These can lead to XSS, code injection, or other security vulnerabilities.
 */
const DANGEROUS_SCHEMES = [
  'javascript:',
  'data:',
  'vbscript:',
  'file:',
  'about:',
  'blob:',
];

/**
 * Patterns that indicate potentially malicious redirect URIs.
 */
const DANGEROUS_PATTERNS = [
  // Protocol-relative URLs (can be exploited)
  /^\/\//,
  // Encoded protocol markers
  /%3a%2f%2f/i,
  /%2f%2f/i,
  // Backslash tricks (IE/Edge treat \ as /)
  /\\/,
  // Null bytes
  /%00/,
  /\x00/,
  // Tab/newline injection
  /[\t\r\n]/,
  // CRLF injection
  /%0d|%0a/i,
  // Unicode normalization attacks
  /%c0%ae|%e0%80%ae/i,
];

/**
 * NestJS service for validating OAuth redirect URIs with comprehensive security checks.
 *
 * This service handles:
 * - Exact URI matching
 * - Wildcard subdomain matching (e.g., https://*.example.com/callback)
 * - Tenant placeholder matching (e.g., https://{tenant}.example.com/callback)
 * - Detection of dangerous URL schemes and patterns
 * - Localhost and IP address restrictions
 * - HTTP vs HTTPS enforcement
 *
 * @example
 * ```typescript
 * const result = await validator.validateRedirectUri(
 *   'https://app.example.com/callback',
 *   ['https://*.example.com/callback', 'https://localhost:3000/callback']
 * );
 * if (!result.valid) {
 *   throw new BadRequestException(result.reason);
 * }
 * ```
 */
@Injectable()
export class RedirectUriValidatorService {
  private readonly logger = new Logger(RedirectUriValidatorService.name);
  private readonly isProduction: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const nodeEnv = this.configService.get<string>('NODE_ENV', 'development');
    this.isProduction = nodeEnv === 'production';
  }

  // ===========================================================================
  // PUBLIC API
  // ===========================================================================

  /**
   * Validates a redirect URI against a list of registered URI patterns.
   *
   * Performs comprehensive security checks and pattern matching including:
   * - Dangerous scheme detection (javascript:, data:, etc.)
   * - Dangerous pattern detection (CRLF injection, null bytes, etc.)
   * - Wildcard subdomain matching
   * - Tenant placeholder matching with optional DB validation
   *
   * @param redirectUri - The redirect URI to validate
   * @param registeredPatterns - List of registered URI patterns to match against
   * @param options - Optional validation options
   * @returns Validation result with reason if invalid
   */
  async validateRedirectUri(
    redirectUri: string,
    registeredPatterns: string[],
    options: RedirectUriValidationOptions = {},
  ): Promise<RedirectUriValidationResult> {
    // Resolve options with defaults
    const resolvedOptions = this.resolveOptions(options);

    // Step 1: Security checks on the redirect URI itself
    const securityResult = this.performSecurityChecks(redirectUri, resolvedOptions);
    if (!securityResult.valid) {
      return securityResult;
    }

    // Step 2: Try to match against registered patterns
    return this.matchAgainstPatterns(redirectUri, registeredPatterns, resolvedOptions);
  }

  /**
   * Validates a redirect URI pattern for registration.
   *
   * This validates that a pattern is safe to register, checking for:
   * - Valid URL format
   * - Proper wildcard/tenant placeholder placement
   * - No dangerous patterns that could be exploited
   *
   * @param pattern - The URI pattern to validate for registration
   * @returns Validation result with reason if invalid
   */
  validatePatternForRegistration(pattern: string): RedirectUriValidationResult {
    // Must start with http:// or https://
    if (!pattern.match(/^https?:\/\//)) {
      return {
        valid: false,
        reason: `Pattern must start with http:// or https://`,
      };
    }

    // Check for dangerous patterns in the registered pattern itself
    const dangerousCheck = this.checkDangerousPatterns(pattern);
    if (!dangerousCheck.valid) {
      return dangerousCheck;
    }

    // Validate wildcard placement
    if (pattern.includes('*')) {
      const wildcardCheck = this.validateWildcardPlacement(pattern);
      if (!wildcardCheck.valid) {
        return wildcardCheck;
      }
    }

    // Validate tenant placeholder placement
    if (pattern.includes('{tenant}')) {
      const tenantCheck = this.validateTenantPlaceholderPlacement(pattern);
      if (!tenantCheck.valid) {
        return tenantCheck;
      }
    }

    // Validate URL format by substituting placeholders
    const formatCheck = this.validateUrlFormat(pattern);
    if (!formatCheck.valid) {
      return formatCheck;
    }

    // Check for overly permissive patterns
    const permissiveCheck = this.checkOverlyPermissivePattern(pattern);
    if (!permissiveCheck.valid) {
      return permissiveCheck;
    }

    return { valid: true };
  }

  // ===========================================================================
  // SECURITY CHECKS
  // ===========================================================================

  /**
   * Performs comprehensive security checks on a redirect URI.
   */
  private performSecurityChecks(
    uri: string,
    options: Required<RedirectUriValidationOptions>,
  ): RedirectUriValidationResult {
    // Check for empty or whitespace-only URIs
    if (!uri || !uri.trim()) {
      return {
        valid: false,
        reason: 'Redirect URI cannot be empty',
      };
    }

    // Check for dangerous schemes
    const schemeCheck = this.checkDangerousSchemes(uri);
    if (!schemeCheck.valid) {
      return schemeCheck;
    }

    // Check for dangerous patterns
    const patternCheck = this.checkDangerousPatterns(uri);
    if (!patternCheck.valid) {
      return patternCheck;
    }

    // Must start with http:// or https://
    if (!uri.match(/^https?:\/\//)) {
      return {
        valid: false,
        reason: 'Redirect URI must use http:// or https:// scheme',
      };
    }

    // Parse the URL for further checks
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(uri);
    } catch {
      return {
        valid: false,
        reason: 'Redirect URI is not a valid URL',
      };
    }

    // Check for fragments (not allowed in OAuth redirect URIs per RFC 6749)
    if (parsedUrl.hash) {
      return {
        valid: false,
        reason: 'Redirect URI must not contain a fragment (#)',
      };
    }

    // Check HTTP vs HTTPS
    if (!options.allowHttp && parsedUrl.protocol === 'http:') {
      // Special exception for localhost in development
      if (!this.isLocalhostUrl(parsedUrl)) {
        return {
          valid: false,
          reason: 'Redirect URI must use HTTPS (HTTP is only allowed for localhost)',
        };
      }
    }

    // Check localhost restrictions
    if (!options.allowLocalhost && this.isLocalhostUrl(parsedUrl)) {
      return {
        valid: false,
        reason: 'Localhost redirect URIs are not allowed in production',
      };
    }

    // Check IP address restrictions
    if (!options.allowIpAddresses && this.isIpAddress(parsedUrl.hostname)) {
      return {
        valid: false,
        reason: 'IP addresses are not allowed in redirect URIs. Use a domain name instead.',
      };
    }

    return { valid: true };
  }

  /**
   * Checks for dangerous URL schemes that could lead to XSS or code injection.
   */
  private checkDangerousSchemes(uri: string): RedirectUriValidationResult {
    const lowerUri = uri.toLowerCase().trim();

    for (const scheme of DANGEROUS_SCHEMES) {
      if (lowerUri.startsWith(scheme)) {
        return {
          valid: false,
          reason: `Dangerous URL scheme detected: ${scheme}. This could be used for code injection.`,
        };
      }
    }

    return { valid: true };
  }

  /**
   * Checks for dangerous patterns that could be used for attacks.
   */
  private checkDangerousPatterns(uri: string): RedirectUriValidationResult {
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(uri)) {
        return {
          valid: false,
          reason: `Potentially malicious pattern detected in redirect URI`,
        };
      }
    }

    return { valid: true };
  }

  // ===========================================================================
  // PATTERN MATCHING
  // ===========================================================================

  /**
   * Matches a redirect URI against registered patterns.
   */
  private async matchAgainstPatterns(
    redirectUri: string,
    registeredPatterns: string[],
    options: Required<RedirectUriValidationOptions>,
  ): Promise<RedirectUriValidationResult> {
    for (const pattern of registeredPatterns) {
      // Try exact match first (most common case)
      if (pattern === redirectUri) {
        this.logger.debug(`Exact match found for: ${redirectUri}`);
        return { valid: true, matchedPattern: pattern };
      }

      // Try tenant placeholder match
      if (pattern.includes('{tenant}')) {
        const result = await this.matchTenantPattern(redirectUri, pattern, options);
        if (result.valid) {
          return result;
        }
        // If tenant validation failed with a specific reason, return it
        if (result.reason?.includes('not found')) {
          return result;
        }
        continue;
      }

      // Try wildcard match
      if (pattern.includes('*')) {
        const result = this.matchWildcardPattern(redirectUri, pattern);
        if (result.valid) {
          return result;
        }
        continue;
      }
    }

    return {
      valid: false,
      reason: `Redirect URI does not match any registered pattern`,
    };
  }

  /**
   * Matches a redirect URI against a wildcard pattern.
   *
   * Wildcard (*) matches any valid subdomain segment (alphanumeric and hyphens).
   * Example: https://*.example.com/callback matches https://app.example.com/callback
   */
  private matchWildcardPattern(
    redirectUri: string,
    pattern: string,
  ): RedirectUriValidationResult {
    // Build regex by escaping special chars and replacing * with subdomain pattern
    // Only match valid subdomain characters: letters, numbers, hyphens
    const regexPattern = this.escapeRegExp(pattern).replace(/\\\*/g, '[a-zA-Z0-9-]+');

    try {
      const regex = new RegExp(`^${regexPattern}$`);
      if (regex.test(redirectUri)) {
        this.logger.debug(`Wildcard match: ${redirectUri} matched ${pattern}`);
        return { valid: true, matchedPattern: pattern };
      }
    } catch (error) {
      this.logger.warn(`Invalid wildcard pattern regex: ${pattern}`, error);
    }

    return { valid: false };
  }

  /**
   * Matches a redirect URI against a tenant placeholder pattern.
   *
   * {tenant} matches a valid tenant slug and optionally validates
   * that the tenant exists in the database.
   *
   * Example: https://{tenant}.example.com/callback matches
   * https://acme-corp.example.com/callback if 'acme-corp' tenant exists
   */
  private async matchTenantPattern(
    redirectUri: string,
    pattern: string,
    options: Required<RedirectUriValidationOptions>,
  ): Promise<RedirectUriValidationResult> {
    // Build regex with capture group for tenant slug
    const regexPattern = this.escapeRegExp(pattern).replace(
      /\\\{tenant\\\}/g,
      '([a-zA-Z0-9-]+)',
    );

    try {
      const regex = new RegExp(`^${regexPattern}$`);
      const match = redirectUri.match(regex);

      if (match && match[1]) {
        const tenantSlug = match[1];
        this.logger.debug(`Tenant pattern match: extracted slug "${tenantSlug}"`);

        // Optionally validate tenant exists in database
        if (options.validateTenantExists) {
          const tenant = await this.prisma.tenant.findUnique({
            where: { slug: tenantSlug },
            select: { id: true },
          });

          if (!tenant) {
            this.logger.warn(`Tenant "${tenantSlug}" not found in database`);
            return {
              valid: false,
              reason: `Tenant "${tenantSlug}" not found. The redirect URI pattern requires the tenant to exist.`,
            };
          }
        }

        return {
          valid: true,
          matchedPattern: pattern,
          extractedTenant: tenantSlug,
        };
      }
    } catch (error) {
      this.logger.warn(`Invalid tenant pattern regex: ${pattern}`, error);
    }

    return { valid: false };
  }

  // ===========================================================================
  // PATTERN REGISTRATION VALIDATION
  // ===========================================================================

  /**
   * Validates that wildcards are only in subdomain position.
   */
  private validateWildcardPlacement(pattern: string): RedirectUriValidationResult {
    // Pattern: protocol://[*].domain.tld[:port][/path]
    const wildcardPattern = /^https?:\/\/\*\.([a-zA-Z0-9-]+\.)*[a-zA-Z0-9-]+(:\d+)?(\/.*)?$/;

    if (!wildcardPattern.test(pattern)) {
      return {
        valid: false,
        reason: 'Wildcards (*) are only allowed at the start of subdomains (e.g., https://*.example.com/callback)',
      };
    }

    // Ensure there's a valid domain after *.
    const hostMatch = pattern.match(/^https?:\/\/\*\.([^/]+)/);
    if (hostMatch) {
      const domainPart = hostMatch[1];
      // Domain must contain a dot (e.g., example.com) or be localhost with optional port
      if (!domainPart.includes('.') && !domainPart.match(/^localhost(:\d+)?$/)) {
        return {
          valid: false,
          reason: 'Wildcard must be followed by a valid domain (e.g., *.example.com or *.localhost:3000)',
        };
      }
    }

    return { valid: true };
  }

  /**
   * Validates that {tenant} placeholder is only in subdomain position.
   */
  private validateTenantPlaceholderPlacement(pattern: string): RedirectUriValidationResult {
    // Pattern: protocol://{tenant}.domain.tld[:port][/path]
    const tenantPattern = /^https?:\/\/\{tenant\}\.([a-zA-Z0-9-]+\.)*[a-zA-Z0-9-]+(:\d+)?(\/.*)?$/;

    if (!tenantPattern.test(pattern)) {
      return {
        valid: false,
        reason: '{tenant} placeholder is only allowed at the start of subdomains (e.g., https://{tenant}.example.com/callback)',
      };
    }

    return { valid: true };
  }

  /**
   * Validates URL format by substituting placeholders.
   */
  private validateUrlFormat(pattern: string): RedirectUriValidationResult {
    try {
      const testUri = pattern
        .replace('*', 'wildcard-test')
        .replace('{tenant}', 'test-tenant');
      new URL(testUri);
      return { valid: true };
    } catch {
      return {
        valid: false,
        reason: 'Pattern is not a valid URL format',
      };
    }
  }

  /**
   * Checks for overly permissive patterns that could be security risks.
   */
  private checkOverlyPermissivePattern(pattern: string): RedirectUriValidationResult {
    // Reject patterns that are just wildcards without proper domain
    if (pattern.match(/^https?:\/\/\*$/)) {
      return {
        valid: false,
        reason: 'Pattern is too permissive. Wildcard must be scoped to a specific domain.',
      };
    }

    // Reject patterns with multiple wildcards
    if ((pattern.match(/\*/g) || []).length > 1) {
      return {
        valid: false,
        reason: 'Multiple wildcards are not allowed. Use a single wildcard for subdomain matching.',
      };
    }

    // Reject patterns with both wildcard and tenant placeholder
    if (pattern.includes('*') && pattern.includes('{tenant}')) {
      return {
        valid: false,
        reason: 'Cannot use both wildcard (*) and tenant placeholder ({tenant}) in the same pattern.',
      };
    }

    return { valid: true };
  }

  // ===========================================================================
  // HELPER METHODS
  // ===========================================================================

  /**
   * Resolves validation options with environment-aware defaults.
   */
  private resolveOptions(
    options: RedirectUriValidationOptions,
  ): Required<RedirectUriValidationOptions> {
    return {
      allowLocalhost: options.allowLocalhost ?? !this.isProduction,
      validateTenantExists: options.validateTenantExists ?? true,
      allowIpAddresses: options.allowIpAddresses ?? false,
      allowHttp: options.allowHttp ?? !this.isProduction,
    };
  }

  /**
   * Checks if a URL points to localhost.
   */
  private isLocalhostUrl(url: URL): boolean {
    const hostname = url.hostname.toLowerCase();
    return (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '[::1]' ||
      hostname === '::1' ||
      hostname.endsWith('.localhost')
    );
  }

  /**
   * Checks if a hostname is an IP address (IPv4 or IPv6).
   */
  private isIpAddress(hostname: string): boolean {
    // IPv4 pattern
    const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/;
    // IPv6 pattern (simplified - checks for colons and hex digits)
    const ipv6Pattern = /^(\[?[0-9a-fA-F:]+\]?)$/;

    // Don't treat localhost as an IP even though 127.0.0.1 technically is
    if (hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1') {
      return false; // Let the localhost check handle this
    }

    return ipv4Pattern.test(hostname) || ipv6Pattern.test(hostname);
  }

  /**
   * Escapes special regex characters in a string.
   */
  private escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
