/**
 * @authvital/browser/react - React Types
 *
 * Type definitions for React integration.
 *
 * @packageDocumentation
 */

import type { ReactNode } from 'react';
import type {
  AuthVitalBrowserConfig,
  AuthUser,
  AuthState,
  LogoutResult,
  RefreshResult,
  AuthorizationOptions,
} from '../client';

// =============================================================================
// PROVIDER PROPS
// =============================================================================

/**
 * Props for AuthVitalProvider
 */
export interface AuthVitalProviderProps extends AuthVitalBrowserConfig {
  /** React children */
  children: ReactNode;
  /** Initial authentication state (for SSR/hydration) */
  initialState?: Partial<AuthState>;
  /** Callback after successful authentication */
  onLogin?: (user: AuthUser) => void;
  /** Callback after logout */
  onLogout?: () => void;
  /** Callback when authentication is required */
  onAuthRequired?: () => void;
}

// =============================================================================
// AUTH CONTEXT VALUE
// =============================================================================

/**
 * Context value provided by AuthVitalProvider
 */
export interface AuthContextValue {
  // State (mirrors AuthState)
  /** Whether user is currently authenticated */
  isAuthenticated: boolean;
  /** Whether auth state is being determined */
  isLoading: boolean;
  /** Whether a token refresh is in progress */
  isRefreshing: boolean;
  /** Current user information */
  user: AuthUser | null;
  /** Current access token (for API calls) */
  accessToken: string | null;
  /** Any authentication error */
  error: AuthState['error'];

  // Actions
  /** Redirect to login page */
  login: (options?: AuthorizationOptions) => void;
  /** Alias for login */
  signIn: (options?: AuthorizationOptions) => void;
  /** Redirect to signup page */
  signup: (options?: AuthorizationOptions) => void;
  /** Alias for signup */
  signUp: (options?: AuthorizationOptions) => void;
  /** Logout the current user */
  logout: () => Promise<LogoutResult>;
  /** Alias for logout */
  signOut: () => Promise<LogoutResult>;
  /** Refresh the access token */
  refreshToken: () => Promise<RefreshResult>;
  /** Check authentication status */
  checkAuth: () => Promise<boolean>;
  /** Handle OAuth callback */
  handleCallback: (url?: string) => Promise<{
    success: boolean;
    user?: AuthUser;
    errorCode?: string;
    errorDescription?: string;
  }>;
  /** Get the Axios instance for API calls */
  getApiClient: () => import('axios').AxiosInstance;
}

// =============================================================================
// HOOK RETURN TYPES
// =============================================================================

/**
 * Return type of useAuth hook
 */
export type UseAuthReturn = AuthContextValue;

/**
 * Return type of useUser hook
 */
export type UseUserReturn = AuthUser | null;

/**
 * Return type of useApi hook
 */
export interface UseApiReturn {
  /** Axios instance with auth interceptors */
  api: import('axios').AxiosInstance;
  /** Authenticated fetch function */
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  /** Whether API client is ready (authenticated) */
  isReady: boolean;
}

// =============================================================================
// COMPONENT PROPS
// =============================================================================

/**
 * Props for RequireAuth component
 */
export interface RequireAuthProps {
  /** Children to render when authenticated */
  children: ReactNode;
  /** Component to render while loading auth state */
  loadingComponent?: ReactNode;
  /** Component/element to render when not authenticated */
  fallback?: ReactNode;
  /** URL to redirect to when not authenticated */
  redirectTo?: string;
}

/**
 * Props for AuthCallback component
 */
export interface AuthCallbackProps {
  /** Called on successful authentication */
  onSuccess?: (user: AuthUser) => void;
  /** Called on authentication error */
  onError?: (error: { code: string; description?: string }) => void;
  /** URL to redirect to after successful login */
  redirectTo?: string;
  /** Loading component while processing callback */
  loadingComponent?: ReactNode;
}

// =============================================================================
// EVENT TYPES
// =============================================================================

/**
 * Auth state change event
 */
export interface AuthStateChangeEvent {
  /** Previous state */
  previous: AuthState;
  /** Current state */
  current: AuthState;
  /** What triggered the change */
  trigger: 'login' | 'logout' | 'refresh' | 'check' | 'init';
}

/**
 * Listener for auth state changes
 */
export type AuthStateChangeListener = (event: AuthStateChangeEvent) => void;
