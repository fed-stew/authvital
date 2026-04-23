/**
 * @authvital/browser - Browser-Specific Types
 *
 * Type definitions for browser/SPA authentication.
 *
 * @packageDocumentation
 */

import type { EnhancedJwtPayload, TokenResponse } from '@authvital/shared';

// =============================================================================
// RE-EXPORT FROM SHARED
// =============================================================================

export type { EnhancedJwtPayload, TokenResponse };

// =============================================================================
// AUTHVITAL CONFIGURATION
// =============================================================================

/**
 * Configuration options for the AuthVital browser client
 */
export interface AuthVitalBrowserConfig {
  /** AuthVital server URL (e.g., https://auth.myapp.com) */
  authVitalHost: string;
  /** OAuth client_id for your application */
  clientId: string;
  /** OAuth redirect URI (defaults to current origin + /auth/callback) */
  redirectUri?: string;
  /** OAuth scopes to request (space-separated) */
  scope?: string;
  /** Called when authentication is required (e.g., redirect to login) */
  onAuthRequired?: () => void;
  /** Called when token refresh fails */
  onRefreshFailed?: (error: Error) => void;
  /** Enable debug logging */
  debug?: boolean;
}

// =============================================================================
// USER & SESSION TYPES
// =============================================================================

/**
 * User information from the authentication session
 */
export interface AuthUser {
  /** Unique user identifier */
  id: string;
  /** User's email address */
  email: string;
  /** Whether email is verified */
  emailVerified?: boolean;
  /** User's full name */
  name?: string;
  /** User's given/first name */
  givenName?: string;
  /** User's family/last name */
  familyName?: string;
  /** Profile picture URL */
  picture?: string;
  /** Current tenant ID (if tenant-scoped) */
  tenantId?: string;
  /** Tenant subdomain (if tenant-scoped) */
  tenantSubdomain?: string;
  /** User's roles in the current tenant */
  tenantRoles?: string[];
  /** User's permissions in the current tenant */
  tenantPermissions?: string[];
  /** License information (if applicable) */
  license?: {
    type: string;
    name: string;
    features: string[];
  };
}

/**
 * Current authentication state
 */
export interface AuthState {
  /** Whether user is currently authenticated */
  isAuthenticated: boolean;
  /** Whether auth state is being determined */
  isLoading: boolean;
  /** Whether a token refresh is in progress */
  isRefreshing: boolean;
  /** Current user information */
  user: AuthUser | null;
  /** Current access token (from memory) */
  accessToken: string | null;
  /** Any authentication error */
  error: AuthError | null;
}

/**
 * Authentication error structure
 */
export interface AuthError {
  /** Error code */
  code: string;
  /** Human-readable error message */
  message: string;
  /** Original error if available */
  originalError?: Error;
}

// =============================================================================
// AUTH METHOD RESULTS
// =============================================================================

/**
 * Result of a login operation
 */
export interface LoginResult {
  /** Whether login was successful */
  success: boolean;
  /** User information (if successful) */
  user?: AuthUser;
  /** Access token (if successful) */
  accessToken?: string;
  /** Error (if failed) */
  error?: AuthError;
}

/**
 * Result of a logout operation
 */
export interface LogoutResult {
  /** Whether logout was successful */
  success: boolean;
  /** Error (if failed) */
  error?: AuthError;
}

/**
 * Result of a token refresh operation
 */
export interface RefreshResult {
  /** Whether refresh was successful */
  success: boolean;
  /** New access token (if successful) */
  accessToken?: string;
  /** Error (if failed) */
  error?: AuthError;
}

// =============================================================================
// TOKEN STORE TYPES
// =============================================================================

/**
 * Token metadata for rotation tracking
 */
export interface TokenMetadata {
  /** When the token was stored */
  storedAt: number;
  /** Token expiration timestamp */
  expiresAt: number;
  /** Token rotation ID (for detecting rotation) */
  rotationId?: string;
}

/**
 * Pending request callback
 */
export type PendingRequestCallback = (token: string | null, error?: Error) => void;

// =============================================================================
// HTTP INTERCEPTOR TYPES
// =============================================================================

/**
 * Options for creating an Axios instance with AuthVital interceptors
 */
export interface InterceptorOptions {
  /** AuthVital host URL */
  authVitalHost: string;
  /** Function to get current access token */
  getAccessToken: () => string | null;
  /** Function to refresh the access token */
  refreshAccessToken: () => Promise<string | null>;
  /** Called when refresh fails (e.g., redirect to login) */
  onAuthError?: () => void;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Request metadata attached by interceptors
 */
export interface RequestMetadata {
  /** Whether this request has already been retried after a 401 */
  _retry?: boolean;
  /** Timestamp when request was initiated */
  _timestamp?: number;
}

// =============================================================================
// OAUTH TYPES
// =============================================================================

/**
 * OAuth authorization options
 */
export interface AuthorizationOptions {
  /** Pre-fill the email field */
  email?: string;
  /** Show signup screen instead of login */
  screen?: 'login' | 'signup';
  /** State parameter for OAuth flow */
  state?: string;
  /** Invitation token for team invites */
  inviteToken?: string;
  /** Tenant hint for multi-tenant apps */
  tenantHint?: string;
}

/**
 * OAuth callback result
 */
export interface OAuthCallbackResult {
  /** Whether the callback was successful */
  success: boolean;
  /** Access token (if successful) */
  accessToken?: string;
  /** User information (if successful) */
  user?: AuthUser;
  /** Error code (if failed) */
  errorCode?: string;
  /** Error description (if failed) */
  errorDescription?: string;
  /** State parameter (if provided) */
  state?: string;
}

// =============================================================================
// EVENT TYPES
// =============================================================================

/**
 * Auth event types
 */
export type AuthEventType =
  | 'auth:login'
  | 'auth:logout'
  | 'auth:refresh'
  | 'auth:refresh-failed'
  | 'auth:error';

/**
 * Auth event payload
 */
export interface AuthEvent {
  /** Event type */
  type: AuthEventType;
  /** Event payload */
  payload: unknown;
  /** Event timestamp */
  timestamp: number;
}

/**
 * Auth event listener
 */
export type AuthEventListener = (event: AuthEvent) => void;

// =============================================================================
// UTILITY TYPES
// =============================================================================

/**
 * Deep partial type utility
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * Nullable type utility
 */
export type Nullable<T> = T | null | undefined;
