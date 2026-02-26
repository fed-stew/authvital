/**
 * @authvader/sdk - Client-Side Types
 * 
 * Type definitions for React components and browser-side SDK.
 */

import type { ReactNode, CSSProperties } from 'react';

// =============================================================================
// PROVIDER CONFIGURATION
// =============================================================================

export interface AuthVaderProviderProps {
  /** OAuth Client ID from AuthVader admin panel */
  clientId: string;
  /** AuthVader server URL (e.g., http://localhost:3000) */
  authVaderHost: string;
  /** Redirect after successful sign-in */
  afterSignInUrl?: string;
  /** Redirect after successful sign-up */
  afterSignUpUrl?: string;
  /**
   * Initial user data (from your server after JWT verification).
   * Your server should use `getCurrentUser()` from the server SDK to verify the JWT,
   * then pass the user data here.
   */
  initialUser?: AuthVaderUser | null;
  /**
   * Initial tenants data (from your server after JWT verification).
   */
  initialTenants?: AuthVaderTenant[];
  /** Children */
  children: ReactNode;
}

// =============================================================================
// USER & TENANT TYPES
// =============================================================================

export interface AuthVaderUser {
  id: string;
  email: string | null;
  givenName: string | null;
  familyName: string | null;
  fullName: string | null;
  imageUrl?: string | null;
  isAnonymous: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface AuthVaderTenant {
  id: string;
  name: string;
  slug: string;
  imageUrl?: string | null;
  role: string;
}

export interface AuthVaderMembership {
  id: string;
  tenant: AuthVaderTenant;
  role: string;
  joinedAt: string;
}

// =============================================================================
// AUTH CONTEXT
// =============================================================================

export interface AuthContextValue {
  /** Whether user is authenticated */
  isAuthenticated: boolean;
  /** Whether auth state is loading */
  isLoading: boolean;
  /** Whether sign-in is in progress */
  isSigningIn: boolean;
  /** Whether sign-up is in progress */
  isSigningUp: boolean;
  /** Current user (null if not authenticated) */
  user: AuthVaderUser | null;
  /** User's tenants */
  tenants: AuthVaderTenant[];
  /** Currently active tenant */
  currentTenant: AuthVaderTenant | null;
  /** Last error message */
  error: string | null;

  // Auth methods
  login: (email: string, password: string) => Promise<LoginResult>;
  signIn: (email: string, password: string) => Promise<LoginResult>;
  signUp: (data: SignUpData) => Promise<SignUpResult>;
  signOut: () => Promise<void>;
  logout: () => Promise<void>;

  // Tenant methods
  setActiveTenant: (tenantId: string) => void;
  switchTenant: (tenantId: string) => void;

  // Session methods
  refreshToken: () => Promise<void>;
  /** Check if user is authenticated */
  checkAuth: () => Promise<boolean>;

  // State setters (for updating after server verification)
  /**
   * Set the authenticated user and tenants.
   * Call this after your server verifies the JWT using getCurrentUser().
   */
  setAuthState: (user: AuthVaderUser | null, tenants?: AuthVaderTenant[]) => void;
  /**
   * Clear auth state (call on logout)
   */
  clearAuthState: () => void;
}

export interface LoginResult {
  user: AuthVaderUser;
  tenants: AuthVaderTenant[];
  redirectToken?: string;
  redirectUrl?: string;
}

export interface SignUpData {
  email: string;
  password: string;
  givenName?: string;
  familyName?: string;
  phone?: string;
}

export interface SignUpResult {
  user: AuthVaderUser;
  tenant?: AuthVaderTenant;
  needsEmailVerification?: boolean;
}

// =============================================================================
// COMPONENT PROPS
// =============================================================================

export interface SignInProps {
  /** Callback on successful sign-in */
  onSuccess?: (user: AuthVaderUser, tenants: AuthVaderTenant[]) => void;
  /** Callback on error */
  onError?: (error: Error) => void;
  /** Show social login buttons (Google, GitHub, etc.) */
  showSocialLogins?: boolean;
  /** Show "Create account" link */
  showSignupLink?: boolean;
  /** Show "Forgot password" link */
  showForgotPassword?: boolean;
  /** Custom redirect after sign-in */
  redirectUrl?: string;
  /** Appearance customization */
  appearance?: AppearanceProps;
}

export interface SignUpProps {
  /** Callback on successful sign-up initiation (email sent) */
  onSuccess?: (data: any) => void;
  /** Callback on error */
  onError?: (error: Error) => void;
  /** Show social login buttons */
  showSocialLogins?: boolean;
  /** Show "Sign in" link */
  showSignInLink?: boolean;
  /** Show terms checkbox */
  showTerms?: boolean;
  /** Terms of service URL */
  termsUrl?: string;
  /** Privacy policy URL */
  privacyUrl?: string;
  /** Custom redirect after sign-up */
  redirectUrl?: string;
  /** Appearance customization */
  appearance?: AppearanceProps;
}

export interface UserButtonProps {
  /** Show user's name next to avatar */
  showName?: boolean;
  /** URL to redirect after sign-out */
  afterSignOutUrl?: string;
  /** Custom menu items */
  menuItems?: UserMenuItemProps[];
}

export interface UserMenuItemProps {
  label: string;
  onClick?: () => void;
  href?: string;
  icon?: ReactNode;
}

export interface ProtectedRouteProps {
  children: ReactNode;
  /** URL to redirect if not authenticated */
  redirectTo?: string;
  /** Show loading spinner while checking auth */
  showLoading?: boolean;
  /** Custom loading component */
  loadingComponent?: ReactNode;
}

export interface TenantSwitcherProps {
  /** Callback when tenant changes */
  onChange?: (tenant: AuthVaderTenant) => void;
  /** Show "Create tenant" option */
  showCreateTenant?: boolean;
  /** Appearance customization */
  appearance?: AppearanceProps;
}

// =============================================================================
// APPEARANCE / THEMING
// =============================================================================

export interface AppearanceProps {
  theme?: 'light' | 'dark' | 'auto';
  variables?: AppearanceVariables;
  elements?: AppearanceElements;
}

export interface AppearanceVariables {
  colorPrimary?: string;
  colorBackground?: string;
  colorText?: string;
  colorTextSecondary?: string;
  colorDanger?: string;
  colorSuccess?: string;
  borderRadius?: string;
  fontFamily?: string;
  fontSize?: string;
}

export interface AppearanceElements {
  card?: CSSProperties;
  form?: CSSProperties;
  input?: CSSProperties;
  button?: CSSProperties;
  primaryButton?: CSSProperties;
  secondaryButton?: CSSProperties;
  socialButton?: CSSProperties;
  link?: CSSProperties;
  error?: CSSProperties;
  header?: CSSProperties;
  footer?: CSSProperties;
}

// =============================================================================
// OAUTH TYPES
// =============================================================================

export interface OAuthConfig {
  authVaderHost: string;
  clientId: string;
  redirectUri: string;
  scope?: string;
}

/**
 * Token response from OAuth token endpoint.
 * Note: In cookie-based auth, these tokens are set as httpOnly cookies
 * and are NOT accessible to JavaScript. This type is mainly for
 * server-side SDK use or for understanding the response structure.
 */
export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  id_token?: string;
  scope?: string;
}

export interface StandaloneAuthOptions {
  authVaderHost: string;
  clientId: string;
  redirectUri: string;
  scope?: string;
  state?: string;
}

export interface LoginToAuthVaderOptions {
  screen?: 'login' | 'signup';
  clientId?: string;
}

// =============================================================================
// INVITATION TYPES
// =============================================================================

export interface InvitationDetails {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  tenant: {
    id: string;
    name: string;
    slug: string;
  };
  invitedBy: {
    name: string;
  } | null;
}

export interface CreateInvitationParams {
  email: string;
  tenantId: string;
  role?: string;
  expiresInDays?: number;
  clientId?: string; // Application client ID - determines redirect URL after acceptance
}

export interface CreateInvitationResult {
  id: string;
  email: string;
  token: string;
  role: string;
  expiresAt: string;
  tenant: {
    id: string;
    name: string;
    slug: string;
  };
  inviteUrl: string;
}

export interface ConsumeInvitationResult {
  success: boolean;
  membership: {
    id: string;
    tenantId: string;
    tenant: {
      id: string;
      name: string;
      slug: string;
    };
  };
  alreadyMember: boolean;
}

export interface UseInvitationOptions {
  autoConsume?: boolean;
  onConsumed?: (result: ConsumeInvitationResult) => void;
  onError?: (error: Error) => void;
}
