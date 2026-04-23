/**
 * @authvital/browser - Client Module
 *
 * Browser/SPA authentication with split-token architecture.
 * All authentication state is stored in memory only.
 *
 * @example
 * ```ts
 * import { AuthVitalClient } from '@authvital/browser';
 *
 * const auth = new AuthVitalClient({
 *   authVitalHost: 'https://auth.myapp.com',
 *   clientId: 'my-app',
 *   onAuthRequired: () => window.location.href = '/login',
 * });
 *
 * // Check if authenticated
 * if (await auth.checkAuth()) {
 *   const user = auth.getUser();
 *   console.log('Hello', user?.email);
 * }
 * ```
 *
 * @packageDocumentation
 */

// =============================================================================
// MAIN CLIENT
// =============================================================================

export { AuthVitalClient } from './auth-client';

// =============================================================================
// CORE MODULES (for advanced usage)
// =============================================================================

export {
  // Token store
  setAccessToken,
  getAccessToken,
  clearTokens,
  initializeTokenStore,
  isTokenExpired,
  getTimeUntilExpiration,
  getTokenMetadata,
  isRefreshInProgress,
  getPendingRequestCount,
  getStateSnapshot,
  setDebugMode,
} from './token-store';

export {
  // Refresh logic
  initializeRefresh,
  performRefresh,
  ensureValidToken,
  scheduleProactiveRefresh,
  isRefreshError,
} from './refresh';

export {
  // Interceptors
  createAxiosInstance,
  createAuthFetch,
  attachAuthVitalInterceptors,
} from './interceptor';

// =============================================================================
// TYPES
// =============================================================================

export type {
  // Configuration
  AuthVitalBrowserConfig,
  InterceptorOptions,
  
  // User & Session
  AuthUser,
  AuthState,
  AuthError,
  
  // Results
  LoginResult,
  LogoutResult,
  RefreshResult,
  
  // Token Store
  TokenMetadata,
  PendingRequestCallback,
  
  // HTTP
  RequestMetadata,
  
  // OAuth
  AuthorizationOptions,
  OAuthCallbackResult,
  
  // Events
  AuthEventType,
  AuthEvent,
  AuthEventListener,
  
  // Utilities
  DeepPartial,
  Nullable,
  
  // Re-exports from shared
  EnhancedJwtPayload,
  TokenResponse,
} from './types';
