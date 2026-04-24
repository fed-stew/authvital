/**
 * @authvital/server - Client Module
 *
 * Server-side API client for making authenticated requests to AuthVital.
 */

export {
  ServerClient,
  createServerClient,
  type ServerClientConfig,
  type RequestOptions,
  type ApiResponse,
  type ApiError,
  type TokenRefreshHandler,
  type IntrospectionResponse,
} from './server-client.js';

export {
  type M2MTokenResponse,
} from './types.js';
