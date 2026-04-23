/**
 * @authvital/sdk - Users Namespace
 *
 * User profile and account management operations.
 */

import type { BaseClient, RequestLike } from '../base-client';

/**
 * User profile data.
 */
export interface UserProfile {
  id: string;
  email: string;
  emailVerified: boolean;
  username?: string;
  displayName?: string;
  givenName?: string;
  familyName?: string;
  middleName?: string;
  nickname?: string;
  pictureUrl?: string;
  website?: string;
  gender?: string;
  birthdate?: string;
  zoneinfo?: string;
  locale?: string;
  phone?: string;
  phoneVerified?: boolean;
  mfaEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * User session info.
 */
export interface UserSession {
  id: string;
  userAgent: string;
  ipAddress: string;
  location?: string;
  lastActive: string;
  createdAt: string;
  isCurrent: boolean;
}

/**
 * User update parameters.
 */
export interface UpdateUserParams {
  displayName?: string;
  givenName?: string;
  familyName?: string;
  middleName?: string;
  nickname?: string;
  pictureUrl?: string;
  website?: string;
  zoneinfo?: string;
  locale?: string;
}

/**
 * Creates the users namespace with user profile methods.
 *
 * @param client - The base client instance for making authenticated requests
 * @returns Object containing all user methods
 */
export function createUsersNamespace(client: BaseClient) {
  return {
    /**
     * Get the current authenticated user's profile.
     *
     * @param request - The incoming HTTP request
     *
     * @example
     * ```ts
     * app.get('/api/me', async (req, res) => {
     *   const user = await authvital.users.getCurrentUser(req);
     *   res.json(user);
     * });
     * ```
     */
    getCurrentUser: async (request: RequestLike): Promise<UserProfile> => {
      await client.validateRequest(request);
      return client.request<UserProfile>('GET', '/api/users/me');
    },

    /**
     * Update the current user's profile.
     *
     * @param request - The incoming HTTP request
     * @param params - Fields to update
     *
     * @example
     * ```ts
     * app.patch('/api/me', async (req, res) => {
     *   const updated = await authvital.users.updateCurrentUser(req, {
     *     displayName: req.body.displayName,
     *     zoneinfo: req.body.timezone,
     *   });
     *   res.json(updated);
     * });
     * ```
     */
    updateCurrentUser: async (
      request: RequestLike,
      params: UpdateUserParams,
    ): Promise<UserProfile> => {
      await client.validateRequest(request);
      return client.request<UserProfile>('PATCH', '/api/users/me', params);
    },

    /**
     * Change the current user's password.
     *
     * @param request - The incoming HTTP request
     * @param params - Current and new password
     *
     * @example
     * ```ts
     * app.post('/api/me/password', async (req, res) => {
     *   await authvital.users.changePassword(req, {
     *     currentPassword: req.body.currentPassword,
     *     newPassword: req.body.newPassword,
     *   });
     *   res.json({ success: true });
     * });
     * ```
     */
    changePassword: async (
      request: RequestLike,
      params: { currentPassword: string; newPassword: string },
    ): Promise<{ success: boolean }> => {
      await client.validateRequest(request);
      return client.request<{ success: boolean }>('POST', '/api/users/me/password', params);
    },

    /**
     * Get active sessions for the current user.
     *
     * @param request - The incoming HTTP request
     *
     * @example
     * ```ts
     * app.get('/api/me/sessions', async (req, res) => {
     *   const sessions = await authvital.users.getSessions(req);
     *   res.json(sessions);
     * });
     * ```
     */
    getSessions: async (request: RequestLike): Promise<UserSession[]> => {
      await client.validateRequest(request);
      const result = await client.request<{ sessions: UserSession[] }>(
        'GET',
        '/api/users/me/sessions',
      );
      return result.sessions;
    },

    /**
     * Revoke a specific session.
     *
     * @param request - The incoming HTTP request
     * @param sessionId - The session ID to revoke
     *
     * @example
     * ```ts
     * app.delete('/api/me/sessions/:id', async (req, res) => {
     *   await authvital.users.revokeSession(req, req.params.id);
     *   res.json({ success: true });
     * });
     * ```
     */
    revokeSession: async (
      request: RequestLike,
      sessionId: string,
    ): Promise<{ success: boolean }> => {
      await client.validateRequest(request);
      return client.request<{ success: boolean }>(
        'DELETE',
        `/api/users/me/sessions/${encodeURIComponent(sessionId)}`,
      );
    },

    /**
     * Revoke all sessions except the current one.
     *
     * @param request - The incoming HTTP request
     *
     * @example
     * ```ts
     * app.delete('/api/me/sessions', async (req, res) => {
     *   const { count } = await authvital.users.revokeAllSessions(req);
     *   res.json({ revoked: count });
     * });
     * ```
     */
    revokeAllSessions: async (
      request: RequestLike,
    ): Promise<{ success: boolean; count: number }> => {
      await client.validateRequest(request);
      return client.request<{ success: boolean; count: number }>(
        'DELETE',
        '/api/users/me/sessions',
      );
    },

    /**
     * Request email change (sends verification to new email).
     *
     * @param request - The incoming HTTP request
     * @param params - New email and password verification
     *
     * @example
     * ```ts
     * app.post('/api/me/email', async (req, res) => {
     *   await authvital.users.requestEmailChange(req, {
     *     newEmail: req.body.newEmail,
     *     password: req.body.password,
     *   });
     *   res.json({ message: 'Verification email sent' });
     * });
     * ```
     */
    requestEmailChange: async (
      request: RequestLike,
      params: { newEmail: string; password: string },
    ): Promise<{ success: boolean }> => {
      await client.validateRequest(request);
      return client.request<{ success: boolean }>('POST', '/api/users/me/email', params);
    },

    /**
     * Get MFA status for a user.
     *
     * @param userId - The user ID
     *
     * @example
     * ```ts
     * const { mfaEnabled } = await authvital.users.getMfaStatus('user-123');
     * if (!mfaEnabled && tenantPolicy === 'REQUIRED') {
     *   // Redirect to MFA setup
     * }
     * ```
     */
    getMfaStatus: async (
      userId: string,
    ): Promise<{ mfaEnabled: boolean; mfaVerifiedAt: string | null }> => {
      return client.request<{ mfaEnabled: boolean; mfaVerifiedAt: string | null }>(
        'GET',
        `/api/users/${encodeURIComponent(userId)}/mfa-status`,
      );
    },

    /**
     * Delete the current user's account.
     *
     * @param request - The incoming HTTP request
     * @param params - Password and confirmation text
     *
     * @example
     * ```ts
     * app.delete('/api/me', async (req, res) => {
     *   await authvital.users.deleteAccount(req, {
     *     password: req.body.password,
     *     confirmation: 'DELETE MY ACCOUNT',
     *   });
     *   res.json({ success: true });
     * });
     * ```
     */
    deleteAccount: async (
      request: RequestLike,
      params: { password: string; confirmation: string },
    ): Promise<{ success: boolean }> => {
      await client.validateRequest(request);
      return client.request<{ success: boolean }>('DELETE', '/api/users/me', params);
    },
  };
}

export type UsersNamespace = ReturnType<typeof createUsersNamespace>;
