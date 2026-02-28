/**
 * @authvital/sdk - Client-Side Types
 *
 * Type definitions for React components and browser-side SDK.
 * Re-exports common types from @authvital/shared where appropriate.
 */

import type { ReactNode, CSSProperties } from 'react';

// =============================================================================
// RE-EXPORT FROM SHARED
// =============================================================================

export type {
  TokenResponse,
  InvitationDetails,
} from '@authvital/shared';

// =============================================================================
// PROVIDER CONFIGURATION
// =============================================================================

export interface AuthVitalProviderProps {
  /** OAuth Client ID from AuthVital admin panel */
  clientId: string;
  /** AuthVital server URL (e.g., http://localhost:3000) */
  authVitalHost: string;
  /** Redirect after successful sign-in */
  afterSignInUrl?: string;
  /** Redirect after successful sign-up */
  afterSignUpUrl?: string;
  /**
   * Initial user data (from your server after JWT verification).
   */
  initialUser?: AuthVitalUser | null;
  /**
   * Initial tenants data (from your server after JWT verification).
   */
  initialTenants?: AuthVitalTenant[];
  /** Children */
  children: ReactNode;
}

// =============================================================================
// USER & TENANT TYPES (Client-specific shapes)
// =============================================================================

/**
 * User info for client-side components.
 * Simplified from the full User type for UI purposes.
 */
export interface AuthVitalUser {
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

/**
 * Tenant info for client-side components.
 */
export interface AuthVitalTenant {
  id: string;
  name: string;
  slug: string;
  imageUrl?: string | null;
  role: string;
}

export interface AuthVitalMembership {
  id: string;
  tenant: AuthVitalTenant;
  role: string;
  joinedAt: string;
}

// =============================================================================
// AUTH CONTEXT
// =============================================================================

export interface AuthContextValue {
  isAuthenticated: boolean;
  isLoading: boolean;
  isSigningIn: boolean;
  isSigningUp: boolean;
  user: AuthVitalUser | null;
  tenants: AuthVitalTenant[];
  currentTenant: AuthVitalTenant | null;
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
  checkAuth: () => Promise<boolean>;

  // State setters
  setAuthState: (user: AuthVitalUser | null, tenants?: AuthVitalTenant[]) => void;
  clearAuthState: () => void;
}

export interface LoginResult {
  user: AuthVitalUser;
  tenants: AuthVitalTenant[];
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
  user: AuthVitalUser;
  tenant?: AuthVitalTenant;
  needsEmailVerification?: boolean;
}

// =============================================================================
// COMPONENT PROPS
// =============================================================================

export interface SignInProps {
  onSuccess?: (user: AuthVitalUser, tenants: AuthVitalTenant[]) => void;
  onError?: (error: Error) => void;
  showSocialLogins?: boolean;
  showSignupLink?: boolean;
  showForgotPassword?: boolean;
  redirectUrl?: string;
  appearance?: AppearanceProps;
}

export interface SignUpProps {
  onSuccess?: (data: unknown) => void;
  onError?: (error: Error) => void;
  showSocialLogins?: boolean;
  showSignInLink?: boolean;
  showTerms?: boolean;
  termsUrl?: string;
  privacyUrl?: string;
  redirectUrl?: string;
  appearance?: AppearanceProps;
}

export interface UserButtonProps {
  showName?: boolean;
  afterSignOutUrl?: string;
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
  redirectTo?: string;
  showLoading?: boolean;
  loadingComponent?: ReactNode;
}

export interface TenantSwitcherProps {
  onChange?: (tenant: AuthVitalTenant) => void;
  showCreateTenant?: boolean;
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
  authVitalHost: string;
  clientId: string;
  redirectUri: string;
  scope?: string;
}

export interface StandaloneAuthOptions {
  authVitalHost: string;
  clientId: string;
  redirectUri: string;
  scope?: string;
  state?: string;
}

export interface LoginToAuthVitalOptions {
  screen?: 'login' | 'signup';
  clientId?: string;
}

// =============================================================================
// INVITATION TYPES (Client-specific)
// =============================================================================

export interface CreateInvitationParams {
  email: string;
  tenantId: string;
  role?: string;
  expiresInDays?: number;
  clientId?: string;
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
