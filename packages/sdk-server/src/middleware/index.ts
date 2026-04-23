/**
 * @authvital/server - Middleware Module
 *
 * Framework-specific middleware implementations for server environments.
 */

// Express middleware and helpers
export {
  authVitalMiddleware,
  requireAuth,
  requirePermission,
  setSession,
  clearSession,
  type AuthVitalContext,
  type AuthVitalMiddlewareConfig,
  type RouteOptions,
} from './express.js';

// Next.js middleware and helpers
export {
  createAuthMiddleware,
  getServerAuth,
  requireServerAuth,
  getServerSideAuth,
  getRouteAuth,
  setRouteSession,
  clearRouteSession,
  type NextAuthContext,
  type EdgeMiddlewareConfig,
  type ServerComponentOptions,
} from './nextjs.js';

// Re-exports from other modules for convenience
export { createSessionStore, createCookieOptions } from '../session/index.js';
export { createServerClient } from '../client/index.js';
