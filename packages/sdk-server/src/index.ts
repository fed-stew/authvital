/**
 * @authvital/server
 *
 * AuthVital Server SDK - BFF/SSR Adapter for Next.js, Express, and other server environments.
 *
 * This package provides:
 * - Secure session cookie encryption (AES-256-GCM)
 * - Express middleware for authentication
 * - Next.js helpers (App Router, Pages Router, Edge Runtime)
 * - Server-side API client with automatic token refresh
 * - Token rotation support
 *
 * @example
 * ```typescript
 * // Express middleware
 * import { authVitalMiddleware } from '@authvital/server';
 *
 * app.use(authVitalMiddleware({
 *   secret: process.env.SESSION_SECRET,
 *   authVitalHost: 'https://auth.example.com',
 *   clientId: process.env.CLIENT_ID,
 *   clientSecret: process.env.CLIENT_SECRET,
 * }));
 *
 * app.get('/api/profile', (req, res) => {
 *   if (!req.authVital) {
 *     return res.status(401).json({ error: 'Unauthorized' });
 *   }
 *   // Use req.authVital.client to make API calls
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Next.js App Router
 * import { getServerAuth } from '@authvital/server';
 * import { cookies } from 'next/headers';
 *
 * export default async function Page() {
 *   const auth = await getServerAuth(cookies(), {
 *     secret: process.env.SESSION_SECRET!,
 *     authVitalHost: process.env.AUTHVITAL_HOST!,
 *     clientId: process.env.CLIENT_ID!,
 *     clientSecret: process.env.CLIENT_SECRET!,
 *   });
 *
 *   if (!auth.isAuthenticated) {
 *     redirect('/login');
 *   }
 *
 *   const user = await auth.client.getCurrentUser();
 *   return <div>Hello {user?.email}</div>;
 * }
 * ```
 *
 * @packageDocumentation
 */

// =============================================================================
// SESSION MODULE
// =============================================================================

export {
  // Cookie utilities
  createSessionCookie,
  parseSessionCookie,
  rotateSessionCookie,
  createCookieOptions,
  serializeCookie,
  createClearCookie,
  parseCookies,
  getCookieValue,
  isSessionExpired,
  DEFAULT_COOKIE_OPTIONS,

  // Session store
  SessionStore,
  createSessionStore,

  // Types
  type SessionTokens,
  type CookieOptions,
  type SessionStoreConfig,
  type SessionMetadata,
  type SessionData,
  type CreateSessionResult,
  type ValidateSessionResult,
  type RefreshResult,
} from './session/index.js';

// =============================================================================
// CRYPTO MODULE
// =============================================================================

export {
  encrypt,
  encryptToString,
  decrypt,
  decryptFromString,
  isValidSecret,
  generateSecret,
  hash,
  timingSafeEqual,
  type EncryptedData,
  type EncryptedString,
} from './crypto/index.js';

// =============================================================================
// CLIENT MODULE
// =============================================================================

export {
  ServerClient,
  createServerClient,
  type ServerClientConfig,
  type RequestOptions,
  type ApiResponse,
  type ApiError,
  type TokenRefreshHandler,
} from './client/index.js';

// =============================================================================
// MIDDLEWARE MODULE (Express)
// =============================================================================

export {
  authVitalMiddleware,
  requireAuth,
  requirePermission,
  setSession,
  clearSession,
  type AuthVitalContext,
  type AuthVitalMiddlewareConfig,
  type RouteOptions,
} from './middleware/express.js';

// =============================================================================
// MIDDLEWARE MODULE (Next.js) - Named exports to avoid conflicts
// =============================================================================

export {
  // Edge middleware
  createAuthMiddleware,

  // Server components
  getServerAuth,
  requireServerAuth,

  // Pages router
  getServerSideAuth,

  // API routes
  getRouteAuth,
  setRouteSession,
  clearRouteSession,

  // Next.js types
  type NextAuthContext,
  type EdgeMiddlewareConfig,
  type ServerComponentOptions,
} from './middleware/nextjs.js';
