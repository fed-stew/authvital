/**
 * @authvader/sdk - Sessions Namespace (Token Ghosting)
 *
 * Manage user sessions: list, revoke specific sessions, or logout everywhere.
 */

import { extractAuthorizationHeader, type BaseClient, type RequestLike } from '../base-client';

// =============================================================================
// SESSION RESPONSE TYPES
// =============================================================================

export interface SessionInfo {
  id: string;
  createdAt: string;
  expiresAt: string;
  userAgent: string | null;
  ipAddress: string | null;
  tenant: string | null;
}

export interface SessionsListResponse {
  sessions: SessionInfo[];
  count: number;
}

export interface SessionRevokeResponse {
  success: boolean;
  message: string;
}

export interface LogoutAllResponse {
  success: boolean;
  message: string;
  count: number;
}

/**
 * Creates the sessions namespace with all session management methods.
 *
 * @param client - The base client instance for making authenticated requests
 * @returns Object containing all session methods
 */
export function createSessionsNamespace(client: BaseClient) {
  return {
    /**
     * Get all active sessions for the authenticated user
     *
     * Returns a list of active sessions with metadata (device info, location, etc.).
     * Useful for building "manage sessions" UI.
     *
     * @example
     * ```ts
     * app.get('/api/sessions', async (req, res) => {
     *   const { sessions, count } = await authvader.sessions.list(req);
     *   res.json(sessions);
     * });
     * ```
     */
    list: async (
      request: RequestLike,
      options?: { applicationId?: string },
    ): Promise<SessionsListResponse> => {
      // Validate JWT to ensure user is authenticated
      await client.validateRequest(request);
      const authHeader = extractAuthorizationHeader(request);

      const params = new URLSearchParams();
      if (options?.applicationId) params.set('application_id', options.applicationId);

      const url = `/oauth/sessions${params.toString() ? `?${params.toString()}` : ''}`;

      // This endpoint uses OAuth token directly, not M2M
      const response = await fetch(`${client.config.authVaderHost}${url}`, {
        method: 'GET',
        headers: {
          Authorization: authHeader!,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error = (await response.json().catch(() => ({ message: response.statusText }))) as {
          message?: string;
        };
        throw new Error(error.message || `Request failed: ${response.status}`);
      }

      return response.json();
    },

    /**
     * Revoke a specific session by ID
     *
     * Call this from "manage sessions" UI to logout a specific device.
     * User can only revoke their own sessions.
     *
     * @example
     * ```ts
     * app.post('/api/sessions/:id/revoke', async (req, res) => {
     *   const result = await authvader.sessions.revoke(req, req.params.id);
     *   res.json(result);
     * });
     * ```
     */
    revoke: async (request: RequestLike, sessionId: string): Promise<SessionRevokeResponse> => {
      await client.validateRequest(request);
      const authHeader = extractAuthorizationHeader(request);

      const response = await fetch(
        `${client.config.authVaderHost}/oauth/sessions/${encodeURIComponent(sessionId)}/revoke`,
        {
          method: 'POST',
          headers: {
            Authorization: authHeader!,
            'Content-Type': 'application/json',
          },
        },
      );

      if (!response.ok) {
        const error = (await response.json().catch(() => ({ message: response.statusText }))) as {
          message?: string;
        };
        throw new Error(error.message || `Request failed: ${response.status}`);
      }

      return response.json();
    },

    /**
     * Revoke ALL sessions for the authenticated user
     *
     * Call this when user clicks "logout everywhere".
     * Revokes all active sessions, forcing re-authentication on all devices.
     *
     * @example
     * ```ts
     * app.post('/api/logout-all', async (req, res) => {
     *   const result = await authvader.sessions.revokeAll(req);
     *   res.json({ message: `Logged out of ${result.count} devices` });
     * });
     * ```
     */
    revokeAll: async (
      request: RequestLike,
      options?: { applicationId?: string },
    ): Promise<LogoutAllResponse> => {
      await client.validateRequest(request);
      const authHeader = extractAuthorizationHeader(request);

      const response = await fetch(`${client.config.authVaderHost}/oauth/logout-all`, {
        method: 'POST',
        headers: {
          Authorization: authHeader!,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          application_id: options?.applicationId,
        }),
      });

      if (!response.ok) {
        const error = (await response.json().catch(() => ({ message: response.statusText }))) as {
          message?: string;
        };
        throw new Error(error.message || `Request failed: ${response.status}`);
      }

      return response.json();
    },

    /**
     * Logout current session
     *
     * Revokes the session associated with the current refresh token.
     * Call this for normal logout.
     *
     * Note: For browser apps, prefer redirecting to /oauth/logout which
     * handles cookie clearing automatically.
     *
     * @example
     * ```ts
     * app.post('/api/logout', async (req, res) => {
     *   // Get refresh token from cookie or body
     *   const refreshToken = req.cookies.refresh_token || req.body.refresh_token;
     *   const result = await authvader.sessions.logout(refreshToken);
     *   res.clearCookie('refresh_token');
     *   res.json(result);
     * });
     * ```
     */
    logout: async (refreshToken: string): Promise<SessionRevokeResponse> => {
      const response = await fetch(`${client.config.authVaderHost}/oauth/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          refresh_token: refreshToken,
        }),
      });

      if (!response.ok) {
        const error = (await response.json().catch(() => ({ message: response.statusText }))) as {
          message?: string;
        };
        throw new Error(error.message || `Request failed: ${response.status}`);
      }

      return response.json();
    },
  };
}

export type SessionsNamespace = ReturnType<typeof createSessionsNamespace>;
