/**
 * @authvital/sdk - Auth Namespace
 *
 * Authentication operations (register, login, password reset, etc.).
 */

import type { BaseClient } from '../base-client';

/**
 * Registration response.
 */
export interface RegisterResponse {
  id: string;
  email: string;
  emailVerified: boolean;
  givenName?: string;
  familyName?: string;
  createdAt: string;
}

/**
 * Login response (no MFA).
 */
export interface LoginResponse {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  expiresIn: number;
  user: {
    id: string;
    email: string;
    givenName?: string;
    familyName?: string;
  };
}

/**
 * Login response when MFA is required.
 */
export interface MfaRequiredResponse {
  mfaRequired: true;
  mfaChallengeToken: string;
  redirectUri?: string;
  clientId?: string;
}

/**
 * Creates the auth namespace with authentication methods.
 *
 * @param client - The base client instance for making authenticated requests
 * @returns Object containing all auth methods
 */
export function createAuthNamespace(client: BaseClient) {
  return {
    /**
     * Register a new user.
     *
     * @param params - Registration parameters
     *
     * @example
     * ```ts
     * app.post('/api/auth/register', async (req, res) => {
     *   const user = await authvital.auth.register({
     *     email: req.body.email,
     *     password: req.body.password,
     *     givenName: req.body.givenName,
     *     familyName: req.body.familyName,
     *   });
     *   res.json(user);
     * });
     * ```
     */
    register: async (params: {
      email: string;
      password: string;
      givenName?: string;
      familyName?: string;
    }): Promise<RegisterResponse> => {
      return client.request<RegisterResponse>('POST', '/api/auth/register', params);
    },

    /**
     * Login with email and password.
     *
     * May return MFA challenge if user has MFA enabled.
     *
     * @param params - Login parameters
     *
     * @example
     * ```ts
     * app.post('/api/auth/login', async (req, res) => {
     *   const result = await authvital.auth.login({
     *     email: req.body.email,
     *     password: req.body.password,
     *   });
     *
     *   if ('mfaRequired' in result && result.mfaRequired) {
     *     res.json({ mfaRequired: true, challengeToken: result.mfaChallengeToken });
     *   } else {
     *     res.cookie('access_token', result.accessToken, { httpOnly: true });
     *     res.json({ user: result.user });
     *   }
     * });
     * ```
     */
    login: async (params: {
      email: string;
      password: string;
      redirectUri?: string;
      clientId?: string;
    }): Promise<LoginResponse | MfaRequiredResponse> => {
      return client.request<LoginResponse | MfaRequiredResponse>(
        'POST',
        '/api/auth/login',
        params,
      );
    },

    /**
     * Verify email with token.
     *
     * @param token - Verification token from email
     *
     * @example
     * ```ts
     * app.post('/api/auth/verify-email', async (req, res) => {
     *   const result = await authvital.auth.verifyEmail(req.body.token);
     *   res.json(result);
     * });
     * ```
     */
    verifyEmail: async (
      token: string,
    ): Promise<{ success: boolean; email: string; emailVerified: boolean }> => {
      return client.request<{ success: boolean; email: string; emailVerified: boolean }>(
        'POST',
        '/api/auth/verify-email',
        { token },
      );
    },

    /**
     * Resend verification email.
     *
     * @param email - Email address
     *
     * @example
     * ```ts
     * await authvital.auth.resendVerificationEmail('user@example.com');
     * ```
     */
    resendVerificationEmail: async (email: string): Promise<{ success: boolean }> => {
      return client.request<{ success: boolean }>('POST', '/api/auth/resend-verification', {
        email,
      });
    },

    /**
     * Request password reset email.
     *
     * Always returns success to prevent email enumeration.
     *
     * @param email - Email address
     *
     * @example
     * ```ts
     * await authvital.auth.forgotPassword('user@example.com');
     * ```
     */
    forgotPassword: async (email: string): Promise<{ success: boolean }> => {
      return client.request<{ success: boolean }>('POST', '/api/auth/forgot-password', {
        email,
      });
    },

    /**
     * Reset password with token.
     *
     * @param params - Token and new password
     *
     * @example
     * ```ts
     * app.post('/api/auth/reset-password', async (req, res) => {
     *   await authvital.auth.resetPassword({
     *     token: req.body.token,
     *     password: req.body.password,
     *   });
     *   res.json({ success: true });
     * });
     * ```
     */
    resetPassword: async (params: {
      token: string;
      password: string;
    }): Promise<{ success: boolean }> => {
      return client.request<{ success: boolean }>('POST', '/api/auth/reset-password', params);
    },
  };
}

export type AuthNamespace = ReturnType<typeof createAuthNamespace>;
