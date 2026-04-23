/**
 * @authvital/browser/react - Provider
 *
 * React provider component for AuthVital authentication.
 *
 * @packageDocumentation
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
} from 'react';
import { AuthVitalClient } from '../client';
import type {
  AuthVitalProviderProps,
  AuthContextValue,
  AuthStateChangeListener,
  AuthStateChangeEvent,
} from './types';
import type { AuthUser, AuthState } from '../client';

// =============================================================================
// CONTEXTS
// =============================================================================

const AuthContext = createContext<AuthContextValue | null>(null);
const ClientContext = createContext<AuthVitalClient | null>(null);

// =============================================================================
// PROVIDER COMPONENT
// =============================================================================

/**
 * AuthVital Provider Component
 *
 * Wraps your application with authentication context.
 *
 * @example
 * ```tsx
 * import { AuthVitalProvider } from '@authvital/browser/react';
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
 * ```
 */
export function AuthVitalProvider({
  children,
  initialState,
  onLogin,
  onLogout,
  onAuthRequired,
  debug,
  scope,
  redirectUri,
  ...config
}: AuthVitalProviderProps): JSX.Element {
  // Create client instance (stable across renders)
  const clientRef = useRef<AuthVitalClient | null>(null);
  
  if (!clientRef.current) {
    clientRef.current = new AuthVitalClient({
      ...config,
      debug,
      scope,
      redirectUri,
      onAuthRequired,
    });
  }

  const client = clientRef.current;

  // State
  const [authState, setAuthState] = useState<AuthState>(() => ({
    isAuthenticated: initialState?.isAuthenticated ?? false,
    isLoading: true, // Start loading to check auth status
    isRefreshing: false,
    user: initialState?.user ?? null,
    accessToken: initialState?.accessToken ?? null,
    error: initialState?.error ?? null,
  }));

  // State change listeners
  const listenersRef = useRef<Set<AuthStateChangeListener>>(new Set());

  // Helper to update state and notify listeners
  const updateState = useCallback(<
    T extends (prev: AuthState) => Partial<AuthState> | Partial<AuthState>
  >(
    updater: T,
    trigger: AuthStateChangeEvent['trigger']
  ) => {
    setAuthState((prev: AuthState) => {
      const updates = typeof updater === 'function' ? (updater as (prev: AuthState) => Partial<AuthState>)(prev) : updater;
      const next = { ...prev, ...updates };
      
      // Notify listeners
      listenersRef.current.forEach(listener => {
        try {
          listener({ previous: prev, current: next, trigger });
        } catch {
          // Ignore listener errors
        }
      });
      
      return next;
    });
  }, []);

  // Check auth status on mount
  useEffect(() => {
    let cancelled = false;

    async function checkAuth() {
      updateState(() => ({ isLoading: true }), 'init');

      try {
        const isAuth = await client.checkAuth();
        
        if (cancelled) return;

        if (isAuth) {
          const user = client.getUser();
          const token = client.getAccessToken();
          
          updateState(() => ({
            isAuthenticated: true,
            isLoading: false,
            user,
            accessToken: token,
            error: null,
          }), 'check');
        } else {
          updateState(() => ({
            isAuthenticated: false,
            isLoading: false,
            user: null,
            accessToken: null,
            error: null,
          }), 'check');
        }
      } catch (error) {
        if (cancelled) return;
        
        updateState(() => ({
          isAuthenticated: false,
          isLoading: false,
          user: null,
          accessToken: null,
          error: {
            code: 'AUTH_CHECK_ERROR',
            message: error instanceof Error ? error.message : 'Auth check failed',
            originalError: error instanceof Error ? error : undefined,
          },
        }), 'check');
      }
    }

    checkAuth();

    return () => {
      cancelled = true;
    };
  }, [client, updateState]);

  // Subscribe to auth events from the client
  useEffect(() => {
    const unsubscribe = client.onEvent((event) => {
      switch (event.type) {
        case 'auth:login': {
          const user = client.getUser();
          const token = client.getAccessToken();
          
          updateState(() => ({
            isAuthenticated: true,
            isLoading: false,
            user,
            accessToken: token,
            error: null,
          }), 'login');
          
          onLogin?.(user!);
          break;
        }
        
        case 'auth:logout': {
          updateState(() => ({
            isAuthenticated: false,
            isLoading: false,
            user: null,
            accessToken: null,
            error: null,
          }), 'logout');
          
          onLogout?.();
          break;
        }
        
        case 'auth:refresh': {
          const token = client.getAccessToken();
          const user = client.getUser();
          
          updateState(() => ({
            isAuthenticated: true,
            isRefreshing: false,
            user,
            accessToken: token,
          }), 'refresh');
          break;
        }
        
        case 'auth:refresh-failed': {
          updateState(() => ({
            isAuthenticated: false,
            isRefreshing: false,
            user: null,
            accessToken: null,
            error: {
              code: 'REFRESH_FAILED',
              message: 'Session expired. Please sign in again.',
            },
          }), 'refresh');
          break;
        }
      }
    });

    return unsubscribe;
  }, [client, updateState, onLogin, onLogout]);

  // Auth actions
  const login = useCallback((options?: { email?: string; screen?: 'login' | 'signup' }) => {
    client.login(options || {});
  }, [client]);

  const signup = useCallback((options?: { email?: string }) => {
    client.signup({ ...options, screen: 'signup' });
  }, [client]);

  const logout = useCallback(async () => {
    const result = await client.logout();
    return result;
  }, [client]);

  const refreshToken = useCallback(async () => {
    updateState(prev => ({ ...prev, isRefreshing: true }), 'refresh');
    
    const result = await client.refreshToken();
    return result;
  }, [client, updateState]);

  const checkAuth = useCallback(async () => {
    const isAuth = await client.checkAuth();
    return isAuth;
  }, [client]);

  const handleCallback = useCallback(async (url?: string) => {
    const result = await client.handleCallback(url);
    
    if (result.success && result.user) {
      updateState(() => ({
        isAuthenticated: true,
        isLoading: false,
        user: result.user || null,
        accessToken: result.accessToken || null,
        error: null,
      }), 'login');
    }
    
    return result;
  }, [client, updateState]);

  const getApiClient = useCallback(() => {
    return client.getAxiosInstance();
  }, [client]);

  // Context value
  const contextValue = useMemo<AuthContextValue>(() => ({
    // State
    isAuthenticated: authState.isAuthenticated,
    isLoading: authState.isLoading,
    isRefreshing: authState.isRefreshing,
    user: authState.user,
    accessToken: authState.accessToken,
    error: authState.error,

    // Actions
    login,
    signIn: login,
    signup,
    signUp: signup,
    logout,
    signOut: logout,
    refreshToken,
    checkAuth,
    handleCallback,
    getApiClient,
  }), [
    authState,
    login,
    signup,
    logout,
    refreshToken,
    checkAuth,
    handleCallback,
    getApiClient,
  ]);

  return (
    <ClientContext.Provider value={client}>
      <AuthContext.Provider value={contextValue}>
        {children}
      </AuthContext.Provider>
    </ClientContext.Provider>
  );
}

// =============================================================================
// HOOKS
// =============================================================================

/**
 * Hook to access authentication context
 *
 * @returns Auth context value
 * @throws Error if used outside of AuthVitalProvider
 *
 * @example
 * ```tsx
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
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  
  if (!context) {
    throw new Error('useAuth must be used within an AuthVitalProvider');
  }
  
  return context;
}

/**
 * Hook to access the AuthVitalClient instance
 *
 * @returns AuthVitalClient instance
 * @throws Error if used outside of AuthVitalProvider
 *
 * @example
 * ```tsx
 * function ApiExample() {
 *   const client = useAuthVitalClient();
 *
 *   const handleClick = async () => {
 *     const response = await client.getAxiosInstance().get('/api/data');
 *     console.log(response.data);
 *   };
 *
 *   return <button onClick={handleClick}>Fetch Data</button>;
 * }
 * ```
 */
export function useAuthVitalClient(): AuthVitalClient {
  const context = useContext(ClientContext);
  
  if (!context) {
    throw new Error('useAuthVitalClient must be used within an AuthVitalProvider');
  }
  
  return context;
}

/**
 * Hook to access the current user
 *
 * @returns Current user or null
 *
 * @example
 * ```tsx
 * function Greeting() {
 *   const user = useUser();
 *   if (!user) return null;
 *   return <span>Hello, {user.givenName || user.email}</span>;
 * }
 * ```
 */
export function useUser(): AuthUser | null {
  const { user } = useAuth();
  return user;
}

/**
 * Hook to access the access token
 *
 * @returns Access token or null
 *
 * @example
 * ```tsx
 * function ManualApiCall() {
 *   const token = useAccessToken();
 *
 *   const fetchData = async () => {
 *     const response = await fetch('/api/data', {
 *       headers: { Authorization: `Bearer ${token}` },
 *     });
 *     return response.json();
 *   };
 *
 *   // ...
 * }
 * ```
 */
export function useAccessToken(): string | null {
  const { accessToken } = useAuth();
  return accessToken;
}

/**
 * Hook to check if user is authenticated
 *
 * @returns True if authenticated
 *
 * @example
 * ```tsx
 * function Navbar() {
 *   const isAuthenticated = useIsAuthenticated();
 *
 *   return (
 *     <nav>
 *       {isAuthenticated ? <UserMenu /> : <LoginButton />}
 *     </nav>
 *   );
 * }
 * ```
 */
export function useIsAuthenticated(): boolean {
  const { isAuthenticated } = useAuth();
  return isAuthenticated;
}

/**
 * Hook to check if auth state is loading
 *
 * @returns True while loading
 */
export function useIsLoading(): boolean {
  const { isLoading } = useAuth();
  return isLoading;
}

/**
 * Hook to get the authenticated API client
 *
 * @returns Axios instance with auth interceptors
 *
 * @example
 * ```tsx
 * function DataFetcher() {
 *   const api = useApi();
 *
 *   useEffect(() => {
 *     api.get('/api/data').then(response => {
 *       setData(response.data);
 *     });
 *   }, [api]);
 *
 *   // ...
 * }
 * ```
 */
export function useApi(): import('axios').AxiosInstance {
  const { getApiClient } = useAuth();
  return useMemo(() => getApiClient(), [getApiClient]);
}

// =============================================================================
// UTILITIES
// =============================================================================

/**
 * Hook to subscribe to auth state changes
 *
 * @param listener - Function to call on state changes
 *
 * @example
 * ```tsx
 * function useAuthAnalytics() {
 *   useAuthStateChange((event) => {
 *     analytics.track('auth_state_change', {
 *       from: event.previous.isAuthenticated,
 *       to: event.current.isAuthenticated,
 *       trigger: event.trigger,
 *     });
 *   });
 * }
 * ```
 */
export function useAuthStateChange(listener: AuthStateChangeListener): void {
  const _listenersRef = useRef<Set<AuthStateChangeListener>>();
  
  // This would need to be implemented with a proper event system
  // For now, it's a placeholder that shows the intended API
  useEffect(() => {
    // Implementation would attach to provider's listener system
    // listenersRef.current?.add(listener);
    // return () => listenersRef.current?.delete(listener);
  }, [listener]);
}
