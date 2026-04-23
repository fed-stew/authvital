/**
 * @authvital/browser/react
 *
 * React integration for AuthVital Browser SDK.
 *
 * Provides a Provider component and hooks for managing authentication
 * state in React applications.
 *
 * @example
 * ```tsx
 * import { AuthVitalProvider, useAuth } from '@authvital/browser/react';
 *
 * function App() {
 *   return (
 *     <AuthVitalProvider
 *       authVitalHost="https://auth.myapp.com"
 *       clientId="my-app"
 *       onAuthRequired={() => router.push('/login')}
 *     >
 *       <YourApp />
 *     </AuthVitalProvider>
 *   );
 * }
 *
 * function Profile() {
 *   const { user, isAuthenticated, login } = useAuth();
 *
 *   if (!isAuthenticated) {
 *     return <button onClick={() => login()}>Sign In</button>;
 *   }
 *
 *   return <div>Hello, {user?.email}</div>;
 * }
 * ```
 *
 * @packageDocumentation
 */

// =============================================================================
// PROVIDER & CORE HOOKS
// =============================================================================

export {
  AuthVitalProvider,
  useAuth,
  useAuthVitalClient,
  useUser,
  useAccessToken,
  useIsAuthenticated,
  useIsLoading,
  useApi,
  useAuthStateChange,
} from './provider';

// =============================================================================
// ADDITIONAL HOOKS
// =============================================================================

export {
  useAuthCallback,
  useProtectedRoute,
  useAuthApi,
  usePermissions,
  useTokenRefresh,
  useUserPreference,
} from './hooks';

// =============================================================================
// TYPES
// =============================================================================

export type {
  AuthVitalProviderProps,
  AuthContextValue,
  UseAuthReturn,
  UseUserReturn,
  UseApiReturn,
  RequireAuthProps,
  AuthCallbackProps,
  AuthStateChangeEvent,
  AuthStateChangeListener,
} from './types';

// Re-export client types that are commonly needed in React
export type {
  AuthUser,
  AuthState,
  AuthError,
  LoginResult,
  LogoutResult,
  RefreshResult,
  AuthorizationOptions,
  OAuthCallbackResult,
  EnhancedJwtPayload,
  TokenResponse,
} from '../client';
