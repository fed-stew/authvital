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
} from './server-client.js';
