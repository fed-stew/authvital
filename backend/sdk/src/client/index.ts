/**
 * @authvader/sdk - Client-Side Exports
 * 
 * React components, hooks, and browser utilities for AuthVader integration.
 * 
 * IMPORTANT: Auth state is managed via httpOnly cookies for security.
 * No tokens are stored in localStorage/sessionStorage.
 */

// Provider and hooks
export {
  AuthVaderProvider,
  useAuth,
  useUser,
  useTenant,
  useTenants,
  useAuthVaderConfig,
  useOAuth,
  useInvitation,
} from './provider';

// OAuth utilities
export {
  // Simple navigation (no PKCE)
  loginToAuthVader,
  signupAtAuthVader,
  // PKCE utilities
  generateCodeVerifier,
  generateCodeChallenge,
  // State encoding
  encodeState,
  decodeState,
  // Authorization flow
  startAuthorizationFlow,
  handleCallback,
  exchangeCodeForTokens,
  // Standalone auth functions
  startLogin,
  startSignup,
  // Trampoline utilities
  extractCallbackParams,
  // Auth status (cookie-based)
  checkAuthStatus,
  // Logout
  logout,
  // JWT decoding (for display only, NOT auth decisions)
  decodeJwt,
} from './oauth';

// Invitation utilities
export {
  storeInviteToken,
  getStoredInviteToken,
  clearStoredInviteToken,
  captureInviteTokenFromUrl,
  getInvitation,
  createInvitation,
  consumeInvitation,
  listTenantInvitations,
  revokeInvitation,
} from './invitations';



// Components
export {
  ProtectedRoute,
  SignUpForm,
  VerifyEmail,
  CompleteSignupForm,
  getStyles,
} from './components';
export type {
  SignUpFormProps,
  VerifyEmailProps,
  VerifiedData,
  CompleteSignupFormProps,
  CompleteSignupResult,
} from './components';

// Types
export type {
  // Provider
  AuthVaderProviderProps,
  // User & Tenant
  AuthVaderUser,
  AuthVaderTenant,
  AuthVaderMembership,
  // Auth context
  AuthContextValue,
  LoginResult,
  SignUpData,
  SignUpResult,
  // Component props
  SignInProps,
  SignUpProps,
  UserButtonProps,
  UserMenuItemProps,
  ProtectedRouteProps,
  TenantSwitcherProps,
  // Appearance
  AppearanceProps,
  AppearanceVariables,
  AppearanceElements,
  // OAuth
  OAuthConfig,
  TokenResponse,
  StandaloneAuthOptions,
  LoginToAuthVaderOptions,
  // Invitations
  InvitationDetails,
  CreateInvitationParams,
  CreateInvitationResult,
  ConsumeInvitationResult,
  UseInvitationOptions,
} from './types';

export type { AuthStatus } from './oauth';
