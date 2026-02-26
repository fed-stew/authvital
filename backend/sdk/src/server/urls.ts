/**
 * @authvader/sdk - Server-Side URL Builders
 *
 * Simple URL builders for landing pages, emails, and other non-OAuth contexts.
 * Use these when you just need a link to the AuthVader login/signup page
 * WITHOUT the full PKCE ceremony.
 *
 * For full OAuth flows with PKCE, use OAuthFlow from './oauth-flow' instead.
 *
 * @example
 * ```ts
 * import { getSignupUrl, getLoginUrl } from '@authvader/sdk/server';
 *
 * // For a "Get Started" button on your landing page
 * const signupLink = getSignupUrl({
 *   authVaderHost: 'https://auth.myapp.com',
 *   clientId: 'my-app',
 *   redirectUri: 'https://app.myapp.com/dashboard',
 * });
 *
 * // For an email CTA
 * const loginLink = getLoginUrl({
 *   authVaderHost: 'https://auth.myapp.com',
 *   clientId: 'my-app',
 * });
 * ```
 */

// =============================================================================
// URL OPTIONS
// =============================================================================

export interface AuthUrlOptions {
  /** AuthVader server URL (e.g., https://auth.myapp.com) */
  authVaderHost: string;
  /** OAuth client_id for your application */
  clientId: string;
  /** Optional: Where to redirect after auth completes */
  redirectUri?: string;
}

export interface SignupUrlOptions extends AuthUrlOptions {
  /** Optional: Pre-fill the email field */
  email?: string;
  /** Optional: Invitation token (for accepting team invites) */
  inviteToken?: string;
}

export interface LoginUrlOptions extends AuthUrlOptions {
  /** Optional: Pre-fill the email field */
  email?: string;
  /** Optional: Hint for which tenant to log into */
  tenantHint?: string;
}

// =============================================================================
// URL BUILDERS
// =============================================================================

/**
 * Build a signup URL for landing pages, emails, etc.
 *
 * This is a simple redirect - NOT a full OAuth flow.
 * AuthVader will handle the OAuth redirect internally after signup.
 *
 * @example
 * ```ts
 * // Basic signup link
 * const url = getSignupUrl({
 *   authVaderHost: 'https://auth.myapp.com',
 *   clientId: 'my-app',
 * });
 *
 * // With redirect after signup
 * const url = getSignupUrl({
 *   authVaderHost: 'https://auth.myapp.com',
 *   clientId: 'my-app',
 *   redirectUri: 'https://app.myapp.com/onboarding',
 * });
 *
 * // With pre-filled email (e.g., from waitlist)
 * const url = getSignupUrl({
 *   authVaderHost: 'https://auth.myapp.com',
 *   clientId: 'my-app',
 *   email: 'user@example.com',
 * });
 *
 * // For team invite acceptance
 * const url = getSignupUrl({
 *   authVaderHost: 'https://auth.myapp.com',
 *   clientId: 'my-app',
 *   inviteToken: 'abc123',
 * });
 * ```
 */
export function getSignupUrl(options: SignupUrlOptions): string {
  const url = new URL(`${options.authVaderHost}/auth/signup`);

  url.searchParams.set('client_id', options.clientId);

  if (options.redirectUri) {
    url.searchParams.set('redirect_uri', options.redirectUri);
  }

  if (options.email) {
    url.searchParams.set('email', options.email);
  }

  if (options.inviteToken) {
    url.searchParams.set('invite_token', options.inviteToken);
  }

  return url.toString();
}

/**
 * Build a login URL for landing pages, emails, etc.
 *
 * This is a simple redirect - NOT a full OAuth flow.
 * AuthVader will handle the OAuth redirect internally after login.
 *
 * @example
 * ```ts
 * // Basic login link
 * const url = getLoginUrl({
 *   authVaderHost: 'https://auth.myapp.com',
 *   clientId: 'my-app',
 * });
 *
 * // With redirect after login
 * const url = getLoginUrl({
 *   authVaderHost: 'https://auth.myapp.com',
 *   clientId: 'my-app',
 *   redirectUri: 'https://app.myapp.com/dashboard',
 * });
 *
 * // With tenant hint (for multi-tenant apps)
 * const url = getLoginUrl({
 *   authVaderHost: 'https://auth.myapp.com',
 *   clientId: 'my-app',
 *   tenantHint: 'acme-corp',
 * });
 * ```
 */
export function getLoginUrl(options: LoginUrlOptions): string {
  const url = new URL(`${options.authVaderHost}/auth/login`);

  url.searchParams.set('client_id', options.clientId);

  if (options.redirectUri) {
    url.searchParams.set('redirect_uri', options.redirectUri);
  }

  if (options.email) {
    url.searchParams.set('email', options.email);
  }

  if (options.tenantHint) {
    url.searchParams.set('tenant_hint', options.tenantHint);
  }

  return url.toString();
}

/**
 * Build a password reset URL.
 *
 * @example
 * ```ts
 * const url = getPasswordResetUrl({
 *   authVaderHost: 'https://auth.myapp.com',
 *   clientId: 'my-app',
 *   email: 'user@example.com',
 * });
 * ```
 */
export function getPasswordResetUrl(options: AuthUrlOptions & { email?: string }): string {
  const url = new URL(`${options.authVaderHost}/auth/reset-password`);

  url.searchParams.set('client_id', options.clientId);

  if (options.redirectUri) {
    url.searchParams.set('redirect_uri', options.redirectUri);
  }

  if (options.email) {
    url.searchParams.set('email', options.email);
  }

  return url.toString();
}

/**
 * Build an invite acceptance URL.
 *
 * Use this when sending team invitation emails.
 *
 * @example
 * ```ts
 * const url = getInviteAcceptUrl({
 *   authVaderHost: 'https://auth.myapp.com',
 *   clientId: 'my-app',
 *   inviteToken: 'abc123xyz',
 * });
 * ```
 */
export function getInviteAcceptUrl(
  options: AuthUrlOptions & { inviteToken: string },
): string {
  const url = new URL(`${options.authVaderHost}/auth/accept-invite`);

  url.searchParams.set('client_id', options.clientId);
  url.searchParams.set('token', options.inviteToken);

  if (options.redirectUri) {
    url.searchParams.set('redirect_uri', options.redirectUri);
  }

  return url.toString();
}

export interface LogoutUrlOptions {
  /** AuthVader server URL (e.g., https://auth.myapp.com) */
  authVaderHost: string;
  /** Optional: Where to redirect after logout completes. If not provided, shows IDP's logged-out page. */
  postLogoutRedirectUri?: string;
}

/**
 * Build a logout URL that clears the IDP session.
 *
 * Use this when logging out users - it will clear both your app's
 * cookies AND the IDP session.
 *
 * @example
 * ```ts
 * // In your logout endpoint - show IDP's logged out page:
 * const logoutUrl = getLogoutUrl({
 *   authVaderHost: 'https://auth.myapp.com',
 * });
 * res.redirect(logoutUrl);
 *
 * // Or redirect back to your app after logout:
 * const logoutUrl = getLogoutUrl({
 *   authVaderHost: 'https://auth.myapp.com',
 *   postLogoutRedirectUri: 'https://myapp.com/',
 * });
 * ```
 */
export function getLogoutUrl(options: LogoutUrlOptions): string {
  const url = new URL(`${options.authVaderHost}/api/auth/logout/redirect`);
  if (options.postLogoutRedirectUri) {
    url.searchParams.set('post_logout_redirect_uri', options.postLogoutRedirectUri);
  }
  return url.toString();
}

// =============================================================================
// ACCOUNT SETTINGS URL (standalone - doesn't need tenantId)
// =============================================================================

/**
 * Get URL for user account settings page (standalone version)
 *
 * RECOMMENDED: Use authvader.getAccountSettingsUrl() instead for consistency.
 * This standalone function is for cases where you don't have an AuthVader client.
 *
 * @example
 * ```typescript
 * const url = getAccountSettingsUrl(authVaderHost);
 * // Returns: https://auth.example.com/account/settings
 * ```
 */
export function getAccountSettingsUrl(authVaderHost: string): string {
  return `${authVaderHost.replace(/\/$/, '')}/account/settings`;
}
