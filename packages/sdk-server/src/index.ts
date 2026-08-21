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
 *   baseURL: process.env.AV_HOST,
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
  type LicenseCheckResult,
  type LicensedUser,
  IntegrationClient,
  type ApplicationMembership,
  type ApplicationMembershipsResponse,
  type MembershipRole,
  type MembershipTenant,
  type MembershipUser,
  type TenantMembership,
  type TenantMembershipsResponse,
  type UserTenantMembership,
  type UserTenantsResponse,
  type ApplicationRole,
  type ApplicationRolesResult,
  type TenantRole,
  type Invitation,
  type LicenseHolder,
  type UserLicense,
  type LicenseUsageOverview,
  type SeatCheckResult,
  type PermissionCheckResult,
  type BulkPermissionCheckResult,
} from './client/index.js';

// =============================================================================
// ERRORS
// =============================================================================

export {
  InteractionRequiredError,
  parseInteractionRequired,
} from './errors.js';

// =============================================================================
// OAUTH FLOW MODULE
// =============================================================================

export {
  OAuthFlow,
  type OAuthFlowConfig,
  type StartFlowResult,
  type TokenResponse,
  type CallbackResult,
} from './oauth/index.js';

// =============================================================================
// PUBSUB MODULE (also available as the '@authvital/server/pubsub' subpath)
// =============================================================================

export {
  parsePubSubMessage,
  createPubSubDispatcher,
  createPubSubPushHandler,
  InMemoryDedupeStore,
  PubSubParseError,
  isSyncEventEnvelope,
  isSystemEventEnvelope,
  type PubSubMessageInput,
  type PullMessageLike,
  type PushRequestBody,
  type PubSubDispatcher,
  type PubSubDispatcherOptions,
  type PubSubEventHandler,
  type PubSubAnyHandler,
  type PubSubWildcard,
  type DispatchResult,
  type DedupeStore,
  type InMemoryDedupeStoreOptions,
  type PushHandlerResult,
  type PushHandlerOptions,
  type AuthVitalPubSubEvent,
  type PubSubEventType,
  type SyncEventEnvelope,
  type SystemEventEnvelope,
  type SystemEventType,
  type SystemEvent,
  type SystemEventDataOf,
} from './pubsub/index.js';