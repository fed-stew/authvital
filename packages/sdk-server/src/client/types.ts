/**
 * @authvital/server - Client Types
 *
 * Type definitions for the server-side API client.
 *
 * @packageDocumentation
 */

// =============================================================================
// M2M TOKEN TYPES
// =============================================================================

/**
 * Response from the OAuth 2.0 Client Credentials token endpoint.
 *
 * Used for Machine-to-Machine (M2M) authentication where a client
 * exchanges its credentials for an access token.
 *
 * @see https://tools.ietf.org/html/rfc6749#section-4.4
 */
export interface M2MTokenResponse {
  /** The access token for API authentication */
  access_token: string;
  /** Token type (typically "Bearer") */
  token_type: string;
  /** Token lifetime in seconds */
  expires_in: number;
  /** Granted scope (space-delimited string of scopes) */
  scope: string;
}

// =============================================================================
// INTROSPECTION TYPES
// =============================================================================

/**
 * OAuth 2.0 Token Introspection Response (RFC 7662)
 *
 * Re-exported from server-client for convenience.
 *
 * @see https://tools.ietf.org/html/rfc7662
 */
export type { IntrospectionResponse } from './server-client.js';

// =============================================================================
// RE-EXPORTS FROM SERVER-CLIENT
// =============================================================================

export type {
  ServerClientConfig,
  RequestOptions,
  ApiResponse,
  ApiError,
  TokenRefreshHandler,
} from './server-client.js';
