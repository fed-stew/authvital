/**
 * @authvital/server - Middleware Module
 *
 * Framework-specific middleware implementations for server environments.
 *
 * Import directly from framework-specific modules:
 * - For NestJS: import { AuthVitalModule, AuthVitalGuard, AuthVitalJwtGuard } from './nestjs.js'
 * - For Express: import { authVitalMiddleware } from './express.js'
 */

// NestJS exports (primary framework integration)
export {
  // Types
  type AuthVitalContext,
  type AuthVitalUser,
  type AuthVitalModuleOptions,
  type AuthGuardOptions,
  type RequestWithAuthVital,
  // Injection tokens
  AUTHVITAL_OPTIONS,
  AUTHVITAL_SESSION_STORE,
  // Classes
  AuthVitalMiddleware,
  AuthVitalGuard,
  AuthVitalPermissionGuard,
  AuthVitalJwtGuard,
  AuthVitalModule,
  // Decorators
  CurrentUser,
  Public,
  RequirePermissions,
  // Session helpers
  setSession,
  clearSession,
  // Re-exports
  createSessionStore,
  createCookieOptions,
  createServerClient,
} from './nestjs.js';

// Express exports (namespaced to avoid conflicts)
export {
  authVitalMiddleware,
  requireAuth,
  requirePermission,
  type AuthVitalMiddlewareConfig,
  type RouteOptions,
} from './express.js';
