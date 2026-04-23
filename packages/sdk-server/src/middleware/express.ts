/**
 * @authvital/server - Express Middleware
 *
 * Express.js middleware for session management and authentication.
 * Parses encrypted session cookies and attaches auth context to requests.
 */

import type { Request, Response, NextFunction } from 'express';
import type { SessionTokens, SessionStore } from '../session/index.js';
import { ServerClient, type ServerClientConfig } from '../client/server-client.js';
import { createSessionStore, type SessionStoreConfig } from '../session/store.js';
import type { TokenResponse } from '@authvital/shared';

// =============================================================================
// TYPES
// =============================================================================

declare module 'express' {
  interface Request {
    /**
     * AuthVital authentication context.
     * Attached by authVitalMiddleware when a valid session exists.
     */
    authVital?: AuthVitalContext;
  }
}

/**
 * AuthVital context attached to Express requests.
 */
export interface AuthVitalContext {
  /** Access token for API calls */
  accessToken: string;
  /** Refresh token (if available) */
  refreshToken: string | null;
  /** Session ID */
  sessionId: string;
  /** Server client pre-configured with the access token */
  client: ServerClient;
  /** Whether the session was refreshed during this request */
  refreshed: boolean;
  /** Session metadata */
  metadata: {
    createdAt: number;
    lastAccessedAt: number;
    rotationCount: number;
  };
}

/**
 * Middleware configuration options.
 */
export interface AuthVitalMiddlewareConfig extends Omit<SessionStoreConfig, 'authVitalHost'> {
  /** AuthVital API host */
  authVitalHost: string;
  /** OAuth client ID */
  clientId: string;
  /** OAuth client secret (for token refresh) */
  clientSecret: string;
  /** Routes to exclude from authentication (can be strings or RegExp) */
  publicRoutes?: (string | RegExp)[];
  /** Callback when session is refreshed */
  onRefresh?: (tokens: TokenResponse, req: Request, res: Response) => void;
}

/**
 * Middleware options for specific route handlers.
 */
export interface RouteOptions {
  /** Whether this route requires authentication */
  required?: boolean;
}

// =============================================================================
// MIDDLEWARE FACTORY
// =============================================================================

/**
 * Create AuthVital middleware for Express applications.
 *
 * This middleware:
 * 1. Parses session cookies from incoming requests
 * 2. Decrypts and validates tokens
 * 3. Refreshes tokens if expired
 * 4. Attaches auth context to req.authVital
 * 5. Creates a server client pre-configured with the access token
 *
 * @param config - Middleware configuration
 * @returns Express middleware function
 *
 * @example
 * ```typescript
 * import express from 'express';
 * import { authVitalMiddleware } from '@authvital/server/middleware';
 *
 * const app = express();
 *
 * app.use(authVitalMiddleware({
 *   secret: process.env.SESSION_SECRET,
 *   authVitalHost: 'https://auth.example.com',
 *   clientId: process.env.AUTHVITAL_CLIENT_ID,
 *   clientSecret: process.env.AUTHVITAL_CLIENT_SECRET,
 * }));
 *
 * // Access auth context in routes
 * app.get('/api/profile', (req, res) => {
 *   if (!req.authVital) {
 *     return res.status(401).json({ error: 'Unauthorized' });
 *   }
 *   // Use req.authVital.accessToken or req.authVital.client
 * });
 * ```
 */
export function authVitalMiddleware(config: AuthVitalMiddlewareConfig) {
  const sessionStore = createSessionStore({
    secret: config.secret,
    cookie: config.cookie,
    isProduction: config.isProduction,
    authVitalHost: config.authVitalHost,
  });

  const clientConfig: ServerClientConfig = {
    authVitalHost: config.authVitalHost,
    clientId: config.clientId,
    clientSecret: config.clientSecret,
  };

  const publicRoutes = config.publicRoutes ?? [];

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Check if this route is public
      const isPublic = publicRoutes.some((route) => {
        if (typeof route === 'string') {
          return req.path === route || req.path.startsWith(route);
        }
        return route.test(req.path);
      });

      // Validate session
      const validation = sessionStore.validateSession(req.headers.cookie);

      if (!validation.valid) {
        // Clear invalid session cookie
        if (validation.error && sessionStore.hasSession(req.headers.cookie)) {
          res.setHeader('Set-Cookie', sessionStore.createClearCookieHeader());
        }

        if (isPublic) {
          return next();
        }

        // For protected routes, continue without authVital context
        // (route handler should check req.authVital)
        return next();
      }

      const { session, needsRefresh } = validation;

      if (!session) {
        if (isPublic) {
          return next();
        }
        return next();
      }

      let tokens = session.tokens;
      let refreshed = false;

      // Handle token refresh if needed
      if (needsRefresh && tokens.refreshToken) {
        const refreshResult = await performTokenRefresh(
          tokens,
          clientConfig,
          sessionStore
        );

        if (refreshResult.success && refreshResult.tokens) {
          tokens = {
            accessToken: refreshResult.tokens.access_token,
            refreshToken: refreshResult.tokens.refresh_token ?? tokens.refreshToken,
            expiresAt: Math.floor(Date.now() / 1000) + refreshResult.tokens.expires_in,
            sessionId: tokens.sessionId,
          };
          refreshed = true;

          // Rotate session cookie with new tokens
          const cookieHeader = req.headers.cookie;
          const currentCookie = cookieHeader
            ? sessionStore.getSessionTokens(cookieHeader)
            : null;

          if (currentCookie) {
            const rotation = sessionStore.rotateSession(
              // We need the encrypted value, but we have tokens. Create a dummy encrypted value
              // by serializing the cookie header extraction
              req.headers.cookie?.split(';')
                .find(c => c.trim().startsWith(`${sessionStore.cookieName}=`))
                ?.split('=')[1] || '',
              refreshResult.tokens,
              {
                userAgent: req.headers['user-agent'],
                ipAddress: req.ip,
              }
            );

            if (rotation.success && rotation.setCookieHeader) {
              res.setHeader('Set-Cookie', rotation.setCookieHeader);

              // Call user callback
              if (config.onRefresh) {
                config.onRefresh(refreshResult.tokens, req, res);
              }
            }
          }
        }
      }

      // Create server client with the (potentially refreshed) tokens
      const client = new ServerClient(clientConfig, tokens);

      // Attach auth context to request
      req.authVital = {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        sessionId: tokens.sessionId,
        client,
        refreshed,
        metadata: {
          createdAt: session.metadata.createdAt,
          lastAccessedAt: Date.now(),
          rotationCount: session.metadata.rotationCount + (refreshed ? 1 : 0),
        },
      };

      next();
    } catch (error) {
      next(error);
    }
  };
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

interface RefreshResult {
  success: boolean;
  tokens?: TokenResponse;
}

async function performTokenRefresh(
  tokens: SessionTokens,
  config: ServerClientConfig,
  _sessionStore: SessionStore
): Promise<RefreshResult> {
  try {
    const url = `${config.authVitalHost}/api/oauth/token`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: tokens.refreshToken ?? '',
        client_id: config.clientId,
        client_secret: config.clientSecret,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return { success: false };
    }

    const newTokens = await response.json() as TokenResponse;
    return { success: true, tokens: newTokens };
  } catch {
    return { success: false };
  }
}

// =============================================================================
// AUTH GUARD MIDDLEWARE
// =============================================================================

/**
 * Create middleware that requires authentication.
 *
 * @param options - Guard options
 * @returns Express middleware that rejects unauthenticated requests
 *
 * @example
 * ```typescript
 * app.get('/api/protected',
 *   requireAuth(),
 *   (req, res) => {
 *     // req.authVital is guaranteed to exist
 *     res.json({ user: req.authVital.accessToken });
 *   }
 * );
 * ```
 */
export function requireAuth(options: { redirectTo?: string } = {}) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.authVital) {
      if (options.redirectTo) {
        res.redirect(options.redirectTo);
        return;
      }

      res.status(401).json({
        error: 'Unauthorized',
        code: 'AUTH_REQUIRED',
      });
      return;
    }

    next();
  };
}

/**
 * Create middleware that requires specific permissions.
 *
 * @param permissions - Required permissions (any of these)
 * @returns Express middleware
 *
 * @example
 * ```typescript
 * app.delete('/api/users/:id',
 *   requireAuth(),
 *   requirePermission('users:delete'),
 *   async (req, res) => {
 *     // User has users:delete permission
 *   }
 * );
 * ```
 */
export function requirePermission(...permissions: string[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.authVital) {
      res.status(401).json({
        error: 'Unauthorized',
        code: 'AUTH_REQUIRED',
      });
      return;
    }

    try {
      const response = await req.authVital.client.post<{
        results: Record<string, boolean>;
        allAllowed: boolean;
      }>('/api/auth/check-permissions', {
        permissions,
      });

      if (!response.ok || !response.data?.allAllowed) {
        res.status(403).json({
          error: 'Forbidden',
          code: 'PERMISSION_DENIED',
          details: {
            required: permissions,
            results: response.data?.results,
          },
        });
        return;
      }

      next();
    } catch {
      res.status(500).json({
        error: 'Internal Server Error',
        code: 'PERMISSION_CHECK_FAILED',
      });
    }
  };
}

// =============================================================================
// SESSION HANDLERS
// =============================================================================

/**
 * Create a login handler that sets the session cookie.
 *
 * @param sessionStore - Configured session store
 * @returns Handler function for setting session
 *
 * @example
 * ```typescript
 * app.post('/api/login', async (req, res) => {
 *   const tokens = await authenticateUser(req.body);
 *   setSession(sessionStore, tokens, req, res);
 *   res.json({ success: true });
 * });
 * ```
 */
export function setSession(
  sessionStore: SessionStore,
  tokens: TokenResponse,
  req: Request,
  res: Response
): void {
  const session = sessionStore.createSession(tokens, {
    userAgent: req.headers['user-agent'],
    ipAddress: req.ip,
  });

  res.setHeader('Set-Cookie', session.setCookieHeader);
}

/**
 * Clear the session cookie (logout).
 *
 * @param sessionStore - Configured session store
 * @param res - Express response object
 */
export function clearSession(sessionStore: SessionStore, res: Response): void {
  res.setHeader('Set-Cookie', sessionStore.createClearCookieHeader());
}

// =============================================================================
// RE-EXPORTS
// =============================================================================

export { createSessionStore, createCookieOptions } from '../session/index.js';
export { createServerClient } from '../client/index.js';
