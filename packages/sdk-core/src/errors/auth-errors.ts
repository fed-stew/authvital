/**
 * @authvital/core - Authentication Error Classes
 *
 * Error classes for handling various authentication and authorization errors.
 * All errors extend the native Error class and are environment-agnostic.
 *
 * @packageDocumentation
 */

// =============================================================================
// BASE AUTH ERROR
// =============================================================================

/**
 * Base error class for all AuthVital errors.
 *
 * Provides common properties like error code and HTTP status.
 */
export class AuthVitalError extends Error {
  /** Error code for programmatic handling */
  code: string;
  /** HTTP status code (if applicable) */
  statusCode?: number;
  /** Additional error details */
  details?: Record<string, unknown>;

  constructor(
    message: string,
    code: string,
    statusCode?: number,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AuthVitalError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;

    // Fix prototype chain for instanceof checks
    Object.setPrototypeOf(this, AuthVitalError.prototype);
  }

  /**
   * Convert error to a plain object for serialization.
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      details: this.details,
    };
  }
}

// =============================================================================
// AUTHENTICATION ERRORS
// =============================================================================

/**
 * Error thrown when authentication fails.
 *
 * This includes invalid credentials, expired tokens, etc.
 */
export class AuthenticationError extends AuthVitalError {
  constructor(
    message = 'Authentication failed',
    code = 'auth_failed',
    details?: Record<string, unknown>
  ) {
    super(message, code, 401, details);
    this.name = 'AuthenticationError';
    Object.setPrototypeOf(this, AuthenticationError.prototype);
  }
}

/**
 * Error thrown when credentials are invalid.
 */
export class InvalidCredentialsError extends AuthenticationError {
  constructor(message = 'Invalid credentials') {
    super(message, 'invalid_credentials');
    this.name = 'InvalidCredentialsError';
    Object.setPrototypeOf(this, InvalidCredentialsError.prototype);
  }
}

/**
 * Error thrown when a token is expired.
 */
export class TokenExpiredError extends AuthenticationError {
  constructor(message = 'Token has expired') {
    super(message, 'token_expired');
    this.name = 'TokenExpiredError';
    Object.setPrototypeOf(this, TokenExpiredError.prototype);
  }
}

/**
 * Error thrown when a token is invalid.
 */
export class InvalidTokenError extends AuthenticationError {
  constructor(message = 'Invalid token') {
    super(message, 'invalid_token');
    this.name = 'InvalidTokenError';
    Object.setPrototypeOf(this, InvalidTokenError.prototype);
  }
}

/**
 * Error thrown when MFA is required but not provided.
 */
export class MFARequiredError extends AuthenticationError {
  /** MFA challenge token for completing the flow */
  challengeToken?: string;
  /** Whether MFA setup is required */
  setupRequired?: boolean;

  constructor(
    message = 'MFA required',
    challengeToken?: string,
    setupRequired?: boolean
  ) {
    super(message, 'mfa_required');
    this.name = 'MFARequiredError';
    this.challengeToken = challengeToken;
    this.setupRequired = setupRequired;
    Object.setPrototypeOf(this, MFARequiredError.prototype);
  }
}

/**
 * Error thrown when MFA verification fails.
 */
export class MFAVerificationError extends AuthenticationError {
  constructor(message = 'MFA verification failed') {
    super(message, 'mfa_verification_failed');
    this.name = 'MFAVerificationError';
    Object.setPrototypeOf(this, MFAVerificationError.prototype);
  }
}

// =============================================================================
// AUTHORIZATION ERRORS
// =============================================================================

/**
 * Error thrown when authorization fails (insufficient permissions).
 */
export class AuthorizationError extends AuthVitalError {
  constructor(
    message = 'Access denied',
    code = 'access_denied',
    details?: Record<string, unknown>
  ) {
    super(message, code, 403, details);
    this.name = 'AuthorizationError';
    Object.setPrototypeOf(this, AuthorizationError.prototype);
  }
}

/**
 * Error thrown when a required permission is missing.
 */
export class PermissionDeniedError extends AuthorizationError {
  /** The required permission that was denied */
  permission: string;

  constructor(permission: string) {
    super(`Permission denied: ${permission}`, 'permission_denied');
    this.name = 'PermissionDeniedError';
    this.permission = permission;
    Object.setPrototypeOf(this, PermissionDeniedError.prototype);
  }
}

/**
 * Error thrown when a tenant is required but not provided.
 */
export class TenantRequiredError extends AuthorizationError {
  constructor(message = 'Tenant context required') {
    super(message, 'tenant_required');
    this.name = 'TenantRequiredError';
    Object.setPrototypeOf(this, TenantRequiredError.prototype);
  }
}

/**
 * Error thrown when user is not a member of the specified tenant.
 */
export class TenantMembershipError extends AuthorizationError {
  /** The tenant ID that the user is not a member of */
  tenantId?: string;

  constructor(tenantId?: string) {
    const message = tenantId
      ? `User is not a member of tenant: ${tenantId}`
      : 'User is not a member of this tenant';
    super(message, 'tenant_membership_required');
    this.name = 'TenantMembershipError';
    this.tenantId = tenantId;
    Object.setPrototypeOf(this, TenantMembershipError.prototype);
  }
}

// =============================================================================
// OAUTH ERRORS
// =============================================================================

/**
 * Error thrown during OAuth flow.
 */
export class OAuthError extends AuthVitalError {
  /** OAuth error code from the server */
  oauthError?: string;
  /** OAuth error description from the server */
  oauthErrorDescription?: string;

  constructor(
    message = 'OAuth error',
    oauthError?: string,
    oauthErrorDescription?: string
  ) {
    super(message, 'oauth_error', 400);
    this.name = 'OAuthError';
    this.oauthError = oauthError;
    this.oauthErrorDescription = oauthErrorDescription;
    Object.setPrototypeOf(this, OAuthError.prototype);
  }
}

/**
 * Error thrown when the OAuth state parameter doesn't match.
 *
 * This indicates a potential CSRF attack.
 */
export class StateMismatchError extends OAuthError {
  constructor(message = 'State mismatch - possible CSRF attack') {
    super(message, 'state_mismatch');
    this.name = 'StateMismatchError';
    Object.setPrototypeOf(this, StateMismatchError.prototype);
  }
}

/**
 * Error thrown when PKCE verification fails.
 */
export class PKCEError extends OAuthError {
  constructor(message = 'PKCE verification failed') {
    super(message, 'pkce_failed');
    this.name = 'PKCEError';
    Object.setPrototypeOf(this, PKCEError.prototype);
  }
}

// =============================================================================
// VALIDATION ERRORS
// =============================================================================

/**
 * Error thrown when input validation fails.
 */
export class ValidationError extends AuthVitalError {
  /** Field-level validation errors */
  fieldErrors?: Record<string, string[]>;

  constructor(
    message = 'Validation failed',
    fieldErrors?: Record<string, string[]>
  ) {
    super(message, 'validation_error', 400, { fieldErrors });
    this.name = 'ValidationError';
    this.fieldErrors = fieldErrors;
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

// =============================================================================
// API ERRORS
// =============================================================================

/**
 * Error thrown when an API request fails.
 */
export class APIError extends AuthVitalError {
  /** The HTTP response status code */
  responseStatus: number;
  /** The URL that was requested */
  url?: string;
  /** The request method */
  method?: string;

  constructor(
    message: string,
    responseStatus: number,
    url?: string,
    method?: string
  ) {
    super(message, 'api_error', responseStatus);
    this.name = 'APIError';
    this.responseStatus = responseStatus;
    this.url = url;
    this.method = method;
    Object.setPrototypeOf(this, APIError.prototype);
  }
}

/**
 * Error thrown when a rate limit is exceeded.
 */
export class RateLimitError extends APIError {
  /** Time in seconds until the rate limit resets */
  retryAfter?: number;

  constructor(message = 'Rate limit exceeded', retryAfter?: number) {
    super(message, 429);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
    Object.setPrototypeOf(this, RateLimitError.prototype);
  }
}

/**
 * Error thrown when a network request fails.
 */
export class NetworkError extends AuthVitalError {
  /** The original error that caused the failure */
  cause?: Error;

  constructor(message = 'Network request failed', cause?: Error) {
    super(message, 'network_error');
    this.name = 'NetworkError';
    this.cause = cause;
    Object.setPrototypeOf(this, NetworkError.prototype);
  }
}

// =============================================================================
// INVITATION ERRORS
// =============================================================================

/**
 * Error thrown when an invitation is invalid or expired.
 */
export class InvitationError extends AuthVitalError {
  /** The invitation token that failed */
  token?: string;

  constructor(message = 'Invalid or expired invitation', token?: string) {
    super(message, 'invitation_error', 400);
    this.name = 'InvitationError';
    this.token = token;
    Object.setPrototypeOf(this, InvitationError.prototype);
  }
}

/**
 * Error thrown when an invitation has expired.
 */
export class InvitationExpiredError extends InvitationError {
  constructor(token?: string) {
    super('Invitation has expired', token);
    this.name = 'InvitationExpiredError';
    Object.setPrototypeOf(this, InvitationExpiredError.prototype);
  }
}

/**
 * Error thrown when an invitation has already been accepted.
 */
export class InvitationAlreadyAcceptedError extends InvitationError {
  constructor(token?: string) {
    super('Invitation has already been accepted', token);
    this.name = 'InvitationAlreadyAcceptedError';
    Object.setPrototypeOf(this, InvitationAlreadyAcceptedError.prototype);
  }
}

// =============================================================================
// CONFIGURATION ERRORS
// =============================================================================

/**
 * Error thrown when SDK configuration is invalid.
 */
export class ConfigurationError extends AuthVitalError {
  constructor(message = 'Invalid configuration') {
    super(message, 'configuration_error', 500);
    this.name = 'ConfigurationError';
    Object.setPrototypeOf(this, ConfigurationError.prototype);
  }
}

/**
 * Error thrown when a required configuration option is missing.
 */
export class MissingConfigurationError extends ConfigurationError {
  /** The name of the missing configuration option */
  optionName: string;

  constructor(optionName: string) {
    super(`Missing required configuration: ${optionName}`);
    this.name = 'MissingConfigurationError';
    this.optionName = optionName;
    Object.setPrototypeOf(this, MissingConfigurationError.prototype);
  }
}

// =============================================================================
// JWT VALIDATION ERRORS
// =============================================================================

/**
 * Error thrown when JWT validation fails.
 */
export class JWTValidationError extends AuthVitalError {
  constructor(message = 'JWT validation failed') {
    super(message, 'jwt_validation_error', 401);
    this.name = 'JWTValidationError';
    Object.setPrototypeOf(this, JWTValidationError.prototype);
  }
}

/**
 * Error thrown when a JWT signature is invalid.
 */
export class JWSSignatureError extends JWTValidationError {
  constructor(message = 'Invalid JWT signature') {
    super(message);
    this.name = 'JWSSignatureError';
    Object.setPrototypeOf(this, JWSSignatureError.prototype);
  }
}

/**
 * Error thrown when a JWT issuer is invalid.
 */
export class JWTIssuerError extends JWTValidationError {
  /** The expected issuer */
  expectedIssuer?: string;
  /** The actual issuer in the token */
  actualIssuer?: string;

  constructor(expectedIssuer?: string, actualIssuer?: string) {
    const message = actualIssuer
      ? `Invalid issuer: expected ${expectedIssuer}, got ${actualIssuer}`
      : 'Invalid issuer';
    super(message);
    this.name = 'JWTIssuerError';
    this.expectedIssuer = expectedIssuer;
    this.actualIssuer = actualIssuer;
    Object.setPrototypeOf(this, JWTIssuerError.prototype);
  }
}

/**
 * Error thrown when a JWT audience is invalid.
 */
export class JWTAudienceError extends JWTValidationError {
  /** The expected audience */
  expectedAudience?: string;
  /** The actual audience in the token */
  actualAudience?: string | string[];

  constructor(expectedAudience?: string, actualAudience?: string | string[]) {
    const message = actualAudience
      ? `Invalid audience: expected ${expectedAudience}, got ${JSON.stringify(actualAudience)}`
      : 'Invalid audience';
    super(message);
    this.name = 'JWTAudienceError';
    this.expectedAudience = expectedAudience;
    this.actualAudience = actualAudience;
    Object.setPrototypeOf(this, JWTAudienceError.prototype);
  }
}

// =============================================================================
// ERROR TYPE GUARDS
// =============================================================================

/**
 * Check if an error is an AuthVitalError.
 */
export function isAuthVitalError(error: unknown): error is AuthVitalError {
  return error instanceof AuthVitalError;
}

/**
 * Check if an error is an AuthenticationError.
 */
export function isAuthenticationError(error: unknown): error is AuthenticationError {
  return error instanceof AuthenticationError;
}

/**
 * Check if an error is an AuthorizationError.
 */
export function isAuthorizationError(error: unknown): error is AuthorizationError {
  return error instanceof AuthorizationError;
}

/**
 * Check if an error is an OAuthError.
 */
export function isOAuthError(error: unknown): error is OAuthError {
  return error instanceof OAuthError;
}

/**
 * Check if an error is a ValidationError.
 */
export function isValidationError(error: unknown): error is ValidationError {
  return error instanceof ValidationError;
}

/**
 * Check if an error is an APIError.
 */
export function isAPIError(error: unknown): error is APIError {
  return error instanceof APIError;
}
