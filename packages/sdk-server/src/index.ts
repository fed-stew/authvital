/**
 * @authvital/server
 *
 * AuthVital Server SDK - Framework-agnostic server SDK.
 *
 * This package provides:
 * - Secure session cookie encryption (AES-256-GCM)
 * - Session store for managing authentication state
 * - Server-side API client with automatic token refresh
 * - Cryptographic utilities for secure token handling
 *
 * This SDK is framework-agnostic. For framework-specific integrations,
 * see separate adapter packages:
 * - @authvital/server-express (Express middleware)
 * - @authvital/server-nextjs (Next.js helpers)
 *
 * @example
 * ```typescript
 * // Create a session store
 * import { createSessionStore } from '@authvital/server';
 *
 * const sessionStore = createSessionStore({
 *   secret: process.env.SESSION_SECRET,
 *   authVitalHost: 'https://auth.example.com',
 *   clientId: process.env.CLIENT_ID,
 *   clientSecret: process.env.CLIENT_SECRET,
 * });
 *
 * // Validate session from request cookies
 * const result = await sessionStore.validate(cookies);
 * if (!result.valid) {
 *   return new Response('Unauthorized', { status: 401 });
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Server client for API calls
 * import { createServerClient } from '@authvital/server';
 *
 * const client = createServerClient({
 *   baseURL: process.env.AUTHVITAL_HOST,
 *   clientId: process.env.CLIENT_ID,
 *   clientSecret: process.env.CLIENT_SECRET,
 *   accessToken: session.accessToken,
 * });
 *
 * const user = await client.getCurrentUser();
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
  // Server-specific encryption utilities
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

  // Re-exported JWT verification utilities from @authvital/core
  JWKSClient,
  JWKSError,
  SigningKeyNotFoundError,
  verifyToken,
  decodeToken,
  JWTVerificationError,
  type JWK,
  type JsonWebKeySet,
  /** @deprecated Use JsonWebKeySet instead */
  type JWKS,
  type JWKSClientOptions,
  type VerifyOptions,
  type VerifyResult,
  // Note: JwtHeader and JwtPayload types are available from @authvital/core types module
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
  type M2MTokenResponse,
  type IntrospectionResponse,
} from './client/index.js';