/**
 * @authvital/browser/react - Additional Hooks
 *
 * Specialized hooks for common authentication patterns.
 *
 * @packageDocumentation
 */

import { useCallback, useEffect, useState, useRef } from 'react';
import { useAuth, useUser, useApi } from './provider';
import type { AuthUser } from '../client';

// =============================================================================
// CALLBACK HANDLING
// =============================================================================

/**
 * Hook to handle OAuth callback
 *
 * Automatically processes the OAuth callback on mount.
 *
 * @param options - Callback handling options
 * @returns Processing state and result
 *
 * @example
 * ```tsx
 * function AuthCallbackPage() {
 *   const { isProcessing, error, user } = useAuthCallback({
 *     onSuccess: (user) => router.push('/dashboard'),
 *     onError: (err) => console.error('Auth failed', err),
 *   });
 *
 *   if (isProcessing) return <Loading />;
 *   if (error) return <Error message={error.description} />;
 *   return null; // Redirect happens in onSuccess
 * }
 * ```
 */
export function useAuthCallback(options: {
  onSuccess?: (user: AuthUser) => void;
  onError?: (error: { code: string; description?: string }) => void;
  redirectTo?: string;
} = {}) {
  const { handleCallback, isLoading } = useAuth();
  const [error, setError] = useState<{ code: string; description?: string } | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const processedRef = useRef(false);

  useEffect(() => {
    if (processedRef.current) return;
    processedRef.current = true;

    async function processCallback() {
      const result = await handleCallback();

      if (result.success && result.user) {
        setUser(result.user);
        options.onSuccess?.(result.user);
        
        if (options.redirectTo && typeof window !== 'undefined') {
          window.location.href = options.redirectTo;
        }
      } else if (result.errorCode) {
        const err = {
          code: result.errorCode,
          description: result.errorDescription,
        };
        setError(err);
        options.onError?.(err);
      }
    }

    processCallback();
  }, [handleCallback, options]);

  return {
    isProcessing: isLoading,
    error,
    user,
  };
}

// =============================================================================
// PROTECTED ROUTES
// =============================================================================

/**
 * Hook for protected route logic
 *
 * Redirects to login if not authenticated.
 *
 * @param options - Protection options
 * @returns Loading and authentication state
 *
 * @example
 * ```tsx
 * function Dashboard() {
 *   const { isChecking, isAllowed } = useProtectedRoute({
 *     redirectTo: '/login',
 *   });
 *
 *   if (isChecking) return <Loading />;
 *   if (!isAllowed) return null; // Redirect happens automatically
 *
 *   return <div>Dashboard content</div>;
 * }
 * ```
 */
export function useProtectedRoute(options: {
  redirectTo: string;
  requiredRoles?: string[];
}): {
  isChecking: boolean;
  isAllowed: boolean;
  user: AuthUser | null;
} {
  const { isAuthenticated, isLoading, checkAuth, user } = useAuth();
  const [isChecking, setIsChecking] = useState(true);
  const checkedRef = useRef(false);

  useEffect(() => {
    async function check() {
      if (checkedRef.current) return;
      
      setIsChecking(true);
      const isAuth = isAuthenticated || await checkAuth();
      checkedRef.current = true;
      setIsChecking(false);

      if (!isAuth && typeof window !== 'undefined') {
        window.location.href = options.redirectTo;
      }
    }

    check();
  }, [isAuthenticated, isLoading, checkAuth, options.redirectTo]);

  // Check role requirements if specified
  const hasRequiredRoles = !options.requiredRoles || 
    (user?.tenantRoles?.some(role => options.requiredRoles?.includes(role)) ?? false);

  return {
    isChecking: isChecking || isLoading,
    isAllowed: isAuthenticated && hasRequiredRoles,
    user,
  };
}

// =============================================================================
// API WITH LOADING STATE
// =============================================================================

/**
 * Hook for making authenticated API calls with loading state
 *
 * @returns API call function with loading state
 *
 * @example
 * ```tsx
 * function UserProfile() {
 *   const { callApi, isLoading, error } = useAuthApi();
 *   const [user, setUser] = useState(null);
 *
 *   useEffect(() => {
 *     callApi(async (api) => {
 *       const { data } = await api.get('/api/users/me');
 *       setUser(data);
 *     });
 *   }, [callApi]);
 *
 *   if (isLoading) return <Loading />;
 *   if (error) return <Error message={error.message} />;
 *   return <div>{user?.name}</div>;
 * }
 * ```
 */
export function useAuthApi<T = unknown>() {
  const api = useApi();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [data, setData] = useState<T | null>(null);

  const callApi = useCallback(async (
    operation: (apiInstance: typeof api) => Promise<T>
  ): Promise<T | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await operation(api);
      setData(result);
      return result;
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error(String(err));
      setError(errorObj);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [api]);

  return {
    callApi,
    isLoading,
    error,
    data,
  };
}

// =============================================================================
// PERMISSIONS
// =============================================================================

/**
 * Hook to check user permissions
 *
 * @returns Permission checking utilities
 *
 * @example
 * ```tsx
 * function AdminPanel() {
 *   const { hasPermission, hasAnyPermission, hasAllPermissions } = usePermissions();
 *
 *   if (!hasPermission('admin:access')) return <AccessDenied />;
 *
 *   return (
 *     <div>
 *       {hasAnyPermission(['admin:users', 'admin:settings']) && <AdminNav />}
 *       {hasAllPermissions(['admin:delete', 'admin:confirm']) && <DeleteButton />}
 *     </div>
 *   );
 * }
 * ```
 */
export function usePermissions() {
  const user = useUser();

  const hasPermission = useCallback((permission: string): boolean => {
    return user?.tenantPermissions?.includes(permission) ?? false;
  }, [user?.tenantPermissions]);

  const hasAnyPermission = useCallback((permissions: string[]): boolean => {
    return permissions.some(p => user?.tenantPermissions?.includes(p)) ?? false;
  }, [user?.tenantPermissions]);

  const hasAllPermissions = useCallback((permissions: string[]): boolean => {
    return permissions.every(p => user?.tenantPermissions?.includes(p)) ?? false;
  }, [user?.tenantPermissions]);

  const hasRole = useCallback((role: string): boolean => {
    return user?.tenantRoles?.includes(role) ?? false;
  }, [user?.tenantRoles]);

  const hasAnyRole = useCallback((roles: string[]): boolean => {
    return roles.some(r => user?.tenantRoles?.includes(r)) ?? false;
  }, [user?.tenantRoles]);

  return {
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    hasRole,
    hasAnyRole,
    permissions: user?.tenantPermissions ?? [],
    roles: user?.tenantRoles ?? [],
  };
}

// =============================================================================
// TOKEN REFRESH
// =============================================================================

/**
 * Hook for manual token refresh
 *
 * @returns Refresh function and state
 *
 * @example
 * ```tsx
 * function TokenManager() {
 *   const { refresh, isRefreshing, lastRefreshed } = useTokenRefresh();
 *
 *   return (
 *     <div>
 *       <button onClick={refresh} disabled={isRefreshing}>
 *         Refresh Token
 *       </button>
 *       {lastRefreshed && <span>Last refreshed: {lastRefreshed.toLocaleTimeString()}</span>}
 *     </div>
 *   );
 * }
 * ```
 */
export function useTokenRefresh() {
  const { refreshToken, isRefreshing } = useAuth();
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    const result = await refreshToken();
    
    if (result.success) {
      setLastRefreshed(new Date());
    } else if (result.error) {
      setError(new Error(result.error.message));
    }

    return result;
  }, [refreshToken]);

  return {
    refresh,
    isRefreshing,
    lastRefreshed,
    error,
  };
}

// =============================================================================
// USER PREFERENCES
// =============================================================================

/**
 * Hook for managing user preferences in localStorage
 *
 * Note: This is safe because it stores user preferences, not auth tokens.
 *
 * @param key - Preference key
 * @param defaultValue - Default value
 * @returns Preference value and setter
 *
 * @example
 * ```tsx
 * function ThemeToggle() {
 *   const [theme, setTheme] = useUserPreference('theme', 'light');
 *
 *   return (
 *     <button onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
 *       {theme}
 *     </button>
 *   );
 * }
 * ```
 */
export function useUserPreference<T>(
  key: string,
  defaultValue: T,
): [T, (value: T) => void] {
  const user = useUser();
  const storageKey = user ? `authvital:${user.id}:${key}` : `authvital:anon:${key}`;
  
  const [value, setValue] = useState<T>(() => {
    if (typeof window === 'undefined') return defaultValue;
    
    try {
      const stored = localStorage.getItem(storageKey);
      return stored ? JSON.parse(stored) : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  const setPreference = useCallback((newValue: T) => {
    setValue(newValue);
    
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(storageKey, JSON.stringify(newValue));
      } catch {
        // Ignore storage errors
      }
    }
  }, [storageKey]);

  return [value, setPreference];
}
