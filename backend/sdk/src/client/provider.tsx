/**
 * @authvader/sdk - React Provider & Hooks
 * 
 * Provides authentication context for React applications.
 * This is a CLIENT-ONLY state manager - it does NOT call the IDP.
 * 
 * Your app's server should verify JWTs using the server SDK's `getCurrentUser()`
 * and pass the user data to this provider.
 * 
 * @example
 * ```tsx
 * import { AuthVaderProvider, useAuth } from '@authvader/sdk';
 * 
 * // User data comes from YOUR server (which verified the JWT)
 * function App({ initialUser, initialTenants }) {
 *   return (
 *     <AuthVaderProvider
 *       clientId="your-client-id"
 *       authVaderHost="http://localhost:3000"
 *       initialUser={initialUser}
 *       initialTenants={initialTenants}
 *     >
 *       <YourApp />
 *     </AuthVaderProvider>
 *   );
 * }
 * ```
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type {
  AuthVaderProviderProps,
  AuthVaderUser,
  AuthVaderTenant,
  AuthContextValue,
  LoginResult,
  SignUpData,
  SignUpResult,
  UseInvitationOptions,
  InvitationDetails,
} from './types';


// =============================================================================
// CONTEXTS
// =============================================================================

const AuthContext = createContext<AuthContextValue | null>(null);
const ConfigContext = createContext<{ authVaderHost: string; clientId: string } | null>(null);

// =============================================================================
// PROVIDER
// =============================================================================

export function AuthVaderProvider({
  clientId,
  authVaderHost,
  initialUser = null,
  initialTenants = [],
  children,
}: AuthVaderProviderProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isSigningUp, setIsSigningUp] = useState(false);
  const [user, setUser] = useState<AuthVaderUser | null>(initialUser);
  const [tenants, setTenants] = useState<AuthVaderTenant[]>(initialTenants);
  const [currentTenant, setCurrentTenant] = useState<AuthVaderTenant | null>(initialTenants[0] || null);
  const [error, setError] = useState<string | null>(null);



  // =============================================================================
  // STATE SETTERS (for apps to update after server verification)
  // =============================================================================

  /**
   * Set the authenticated user and their tenants.
   * Call this after your server verifies the JWT using getCurrentUser().
   */
  const setAuthState = useCallback((newUser: AuthVaderUser | null, newTenants: AuthVaderTenant[] = []) => {
    setUser(newUser);
    setTenants(newTenants);
    setCurrentTenant(newTenants[0] || null);
    setError(null);
  }, []);

  /**
   * Clear auth state (call on logout)
   */
  const clearAuthState = useCallback(() => {
    setUser(null);
    setTenants([]);
    setCurrentTenant(null);
  }, []);

  // =============================================================================
  // OAUTH REDIRECTS (no API calls, just navigation)
  // =============================================================================

  /**
   * Redirect to AuthVader login page (OAuth flow)
   */
  const login = useCallback(
    async (_email?: string, _password?: string): Promise<LoginResult> => {
      // If email/password provided, this is a legacy call - redirect to OAuth instead
      setIsSigningIn(true);
      setError(null);
      
      try {
        const { startAuthorizationFlow } = await import('./oauth');
        const redirectUri = typeof window !== 'undefined' 
          ? window.location.origin + '/api/auth/callback' 
          : '';
        
        await startAuthorizationFlow({
          authVaderHost,
          clientId,
          redirectUri,
        });
        
        // This won't actually return since we redirect
        return { user: null as any, tenants: [] };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Login failed';
        setError(message);
        throw err;
      } finally {
        setIsSigningIn(false);
      }
    },
    [authVaderHost, clientId],
  );

  /**
   * Redirect to AuthVader signup page (OAuth flow)
   */
  const signUp = useCallback(
    async (_data?: SignUpData): Promise<SignUpResult> => {
      setIsSigningUp(true);
      setError(null);
      
      try {
        const { startAuthorizationFlow } = await import('./oauth');
        const redirectUri = typeof window !== 'undefined' 
          ? window.location.origin + '/api/auth/callback' 
          : '';
        
        await startAuthorizationFlow({
          authVaderHost,
          clientId,
          redirectUri,
        }, { screen: 'signup' });
        
        // This won't actually return since we redirect
        return { user: null as any };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Sign up failed';
        setError(message);
        throw err;
      } finally {
        setIsSigningUp(false);
      }
    },
    [authVaderHost, clientId],
  );

  /**
   * Sign out - clears local state and redirects to logout
   */
  const signOut = useCallback(async () => {
    clearAuthState();
    
    // Redirect to AuthVader logout endpoint
    const { logout: authVaderLogout } = await import('./oauth');
    await authVaderLogout(authVaderHost, {
      postLogoutRedirectUri: typeof window !== 'undefined' ? window.location.origin : undefined,
    });
  }, [authVaderHost, clearAuthState]);

  // =============================================================================
  // TENANT MANAGEMENT
  // =============================================================================

  const setActiveTenant = useCallback(
    (tenantId: string) => {
      const tenant = tenants.find((t) => t.id === tenantId);
      if (tenant) setCurrentTenant(tenant);
    },
    [tenants],
  );

  // =============================================================================
  // NO-OP METHODS (for backwards compatibility)
  // =============================================================================

  const refreshToken = useCallback(async () => {
    // No-op: Token refresh should happen server-side
    // Your app's server should handle token refresh and update state via setAuthState
  }, []);

  const checkAuth = useCallback(async () => {
    // Just return current state - actual verification should happen server-side
    return !!user;
  }, [user]);

  // =============================================================================
  // CONTEXT VALUE
  // =============================================================================

  const value: AuthContextValue = {
    isAuthenticated: !!user,
    isLoading,
    isSigningIn,
    isSigningUp,
    user,
    tenants,
    currentTenant,
    error,
    // Auth methods (redirect to OAuth)
    login,
    signIn: login,
    signUp,
    signOut,
    logout: signOut,
    // Tenant methods
    setActiveTenant,
    switchTenant: setActiveTenant,
    // Session methods (no-ops, server handles this)
    refreshToken,
    checkAuth,
    // State setters (new!)
    setAuthState,
    clearAuthState,
  };

  const configValue = { authVaderHost, clientId };

  return (
    <ConfigContext.Provider value={configValue}>
      <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
    </ConfigContext.Provider>
  );
}

// =============================================================================
// HOOKS
// =============================================================================

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthVaderProvider');
  }
  return context;
}

export function useUser(): AuthVaderUser | null {
  const { user } = useAuth();
  return user;
}

export function useTenant(): AuthVaderTenant | null {
  const { currentTenant } = useAuth();
  return currentTenant;
}

export function useTenants(): AuthVaderTenant[] {
  const { tenants } = useAuth();
  return tenants;
}

export function useAuthVaderConfig() {
  const context = useContext(ConfigContext);
  if (!context) {
    throw new Error('useAuthVaderConfig must be used within an AuthVaderProvider');
  }
  return context;
}

// =============================================================================
// OAUTH HOOK (handles redirects, NOT direct API calls)
// =============================================================================

export function useOAuth(options?: { redirectUri?: string }) {
  const config = useAuthVaderConfig();
  const { isAuthenticated } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  
  const redirectUri = options?.redirectUri || (typeof window !== 'undefined' ? window.location.origin + '/api/auth/callback' : '');

  const startLogin = useCallback(async (opts?: { state?: string; scope?: string }) => {
    setIsLoading(true);
    try {
      const { startAuthorizationFlow } = await import('./oauth');
      await startAuthorizationFlow({
        authVaderHost: config.authVaderHost,
        clientId: config.clientId,
        redirectUri,
        scope: opts?.scope,
      }, { state: opts?.state });
    } finally {
      setIsLoading(false);
    }
  }, [config, redirectUri]);

  const startSignup = useCallback(async (opts?: { state?: string; scope?: string }) => {
    setIsLoading(true);
    try {
      const { startAuthorizationFlow } = await import('./oauth');
      await startAuthorizationFlow({
        authVaderHost: config.authVaderHost,
        clientId: config.clientId,
        redirectUri,
        scope: opts?.scope,
      }, { state: opts?.state, screen: 'signup' });
    } finally {
      setIsLoading(false);
    }
  }, [config, redirectUri]);

  const logoutFn = useCallback(async (logoutOptions?: { postLogoutRedirectUri?: string }) => {
    const { logout: authVaderLogout } = await import('./oauth');
    await authVaderLogout(config.authVaderHost, logoutOptions);
  }, [config.authVaderHost]);

  return {
    isAuthenticated,
    isLoading,
    startLogin,
    startSignup,
    logout: logoutFn,
  };
}

// =============================================================================
// INVITATION HOOK
// =============================================================================

export function useInvitation(options: UseInvitationOptions = {}) {
  const { onConsumed, onError } = options;
  const config = useAuthVaderConfig();
  
  const [invitation, setInvitation] = useState<InvitationDetails | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [consumed, setConsumed] = useState(false);

  const fetchInvitation = useCallback(async (token: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const { getInvitation } = await import('./invitations');
      const invite = await getInvitation(config.authVaderHost, token);
      setInvitation(invite);
      return invite;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to fetch invitation');
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [config.authVaderHost]);

  const acceptAndLogin = useCallback(async (token: string, loginOptions?: { state?: string }) => {
    const { storeInviteToken } = await import('./invitations');
    const { startAuthorizationFlow } = await import('./oauth');
    storeInviteToken(token);
    await startAuthorizationFlow({
      authVaderHost: config.authVaderHost,
      clientId: config.clientId,
      redirectUri: typeof window !== 'undefined' ? window.location.origin + '/api/auth/callback' : '',
    }, { state: loginOptions?.state });
  }, [config]);

  /**
   * Consume an invitation. This should be called from your SERVER after OAuth callback,
   * not from the client directly. This hook method is provided for backwards compatibility.
   */
  const consumeInvite = useCallback(async (token: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const { consumeInvitation, clearStoredInviteToken } = await import('./invitations');
      const result = await consumeInvitation(config.authVaderHost, '', token);
      clearStoredInviteToken();
      setConsumed(true);
      onConsumed?.(result);
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to consume invitation');
      setError(error);
      onError?.(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [config.authVaderHost, onConsumed, onError]);

  return {
    invitation,
    isLoading,
    error,
    consumed,
    hasPendingInvite: typeof window !== 'undefined' ? !!sessionStorage.getItem('authvader_invite_token') : false,
    fetchInvitation,
    acceptAndLogin,
    consumeInvite,
  };
}
