/**
 * @authvital/server - Next.js Middleware & Helpers
 *
 * Next.js integration including:
 * - App Router (RSC) helpers
 * - Pages Router (getServerSideProps) helpers
 * - Edge Runtime middleware
 * - API route handlers
 */

import { type NextRequest, NextResponse } from 'next/server';
import type { ReadonlyRequestCookies } from 'next/dist/server/web/spec-extension/adapters/request-cookies';
import type { TokenResponse } from '@authvital/shared';
import {
  createSessionStore,
  parseSessionCookie,
  rotateSessionCookie,
  type SessionStoreConfig,
  type SessionTokens,
  type CookieOptions,
} from '../session/index.js';
import { ServerClient, type ServerClientConfig } from '../client/index.js';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Auth context for Next.js requests.
 */
export interface NextAuthContext {
  /** Whether user is authenticated */
  isAuthenticated: boolean;
  /** Access token (if authenticated) */
  accessToken: string | null;
  /** Refresh token (if authenticated) */
  refreshToken: string | null;
  /** Session ID (if authenticated) */
  sessionId: string | null;
  /** Server client pre-configured with tokens */
  client: ServerClient;
  /** Whether tokens were refreshed during this request */
  refreshed: boolean;
}

/**
 * Edge middleware configuration.
 */
export interface EdgeMiddlewareConfig extends Omit<SessionStoreConfig, 'authVitalHost'> {
  /** AuthVital API host */
  authVitalHost: string;
  /** OAuth client ID */
  clientId: string;
  /** OAuth client secret */
  clientSecret: string;
  /** Public paths that don't require auth (can use patterns) */
  publicPaths?: string[];
  /** Login page path (redirect here if auth required) */
  loginPath?: string;
  /** Callback after token refresh */
  onRefresh?: (tokens: TokenResponse) => void;
}

/**
 * Server component auth options.
 */
export interface ServerComponentOptions {
  /** Require authentication (redirect to login if not auth'd) */
  requireAuth?: boolean;
  /** Login page path for redirects */
  loginPath?: string;
  /** Required permissions */
  requirePermissions?: string[];
}

// =============================================================================
// EDGE RUNTIME MIDDLEWARE (App Router / Middleware.ts)
// =============================================================================

/**
 * Create Next.js Edge Runtime middleware for authentication.
 *
 * This middleware runs at the edge before requests reach your application.
 * It validates sessions and handles token refresh.
 *
 * @param config - Edge middleware configuration
 * @returns Next.js middleware function
 *
 * @example
 * ```typescript
 * // middleware.ts
 * import { createAuthMiddleware } from '@authvital/server/middleware';
 *
 * export default createAuthMiddleware({
 *   secret: process.env.SESSION_SECRET!,
 *   authVitalHost: process.env.AUTHVITAL_HOST!,
 *   clientId: process.env.AUTHVITAL_CLIENT_ID!,
 *   clientSecret: process.env.AUTHVITAL_CLIENT_SECRET!,
 *   publicPaths: ['/login', '/signup', '/api/public'],
 *   loginPath: '/login',
 * });
 *
 * export const config = {
 *   matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
 * };
 * ```
 */
export function createAuthMiddleware(config: EdgeMiddlewareConfig) {
  const cookieName = config.cookie?.name ?? 'authvital_session';
  const publicPaths = config.publicPaths ?? [];
  const loginPath = config.loginPath ?? '/login';

  const clientConfig: ServerClientConfig = {
    authVitalHost: config.authVitalHost,
    clientId: config.clientId,
    clientSecret: config.clientSecret,
  };

  return async function middleware(request: NextRequest): Promise<NextResponse> {
    const { pathname } = request.nextUrl;

    // Check if path is public
    const isPublic = publicPaths.some((path) =>
      pathname === path || pathname.startsWith(`${path}/`)
    );

    // Get session cookie
    const sessionCookie = request.cookies.get(cookieName);

    // No cookie and public path - allow through
    if (!sessionCookie && isPublic) {
      return NextResponse.next();
    }

    // No cookie and protected path - redirect to login
    if (!sessionCookie && !isPublic) {
      const loginUrl = new URL(loginPath, request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }

    // TypeScript type narrowing - sessionCookie is defined after early returns
    if (!sessionCookie) {
      return NextResponse.next();
    }

    // Narrow the type - sessionCookie is guaranteed to be defined here
    const cookie = sessionCookie;

    // Validate session
    try {
      const tokens = parseSessionCookie(cookie.value, config.secret);
      const now = Math.floor(Date.now() / 1000);
      const needsRefresh = tokens.expiresAt <= now + 300; // 5 min buffer

      let _currentTokens = tokens;
      let _refreshed = false;

      // Handle token refresh
      if (needsRefresh && tokens.refreshToken) {
        const refreshResult = await refreshTokens(tokens, clientConfig);

        if (refreshResult) {
          _currentTokens = {
            accessToken: refreshResult.access_token,
            refreshToken: refreshResult.refresh_token ?? tokens.refreshToken,
            expiresAt: now + refreshResult.expires_in,
            sessionId: tokens.sessionId,
          };
          _refreshed = true;

          // Update cookie
          const newCookieValue = rotateSessionCookie(
            cookie.value,
            refreshResult,
            config.secret
          );

          // Build response with refreshed cookie
          const response = isPublic
            ? NextResponse.next()
            : NextResponse.next();

          const cookieOptions = buildCookieOptions(config.cookie, config.isProduction);
          const { name: _name, ...restOptions } = cookieOptions;
          response.cookies.set({
            name: cookieName,
            value: newCookieValue,
            ...restOptions,
          });

          if (config.onRefresh) {
            config.onRefresh(refreshResult);
          }

          return response;
        }
      }

      // Valid session - allow through
      return NextResponse.next();
    } catch {
      // Invalid session cookie
      const response = isPublic
        ? NextResponse.next()
        : NextResponse.redirect(new URL(loginPath, request.url));

      // Clear invalid cookie
      response.cookies.delete(cookieName);
      return response;
    }
  };
}

// =============================================================================
// APP ROUTER - SERVER COMPONENTS
// =============================================================================

/**
 * Get authentication context in a Server Component.
 *
 * @param cookieStore - Next.js cookie store (from cookies())
 * @param config - Server client configuration
 * @returns Auth context
 *
 * @example
 * ```typescript
 * // app/dashboard/page.tsx
 * import { cookies } from 'next/headers';
 * import { getServerAuth } from '@authvital/server/middleware';
 *
 * export default async function DashboardPage() {
 *   const auth = await getServerAuth(cookies(), {
 *     secret: process.env.SESSION_SECRET!,
 *     authVitalHost: process.env.AUTHVITAL_HOST!,
 *     clientId: process.env.AUTHVITAL_CLIENT_ID!,
 *     clientSecret: process.env.AUTHVITAL_CLIENT_SECRET!,
 *   });
 *
 *   if (!auth.isAuthenticated) {
 *     redirect('/login');
 *   }
 *
 *   const user = await auth.client.getCurrentUser();
 *
 *   return <div>Welcome, {user?.email}</div>;
 * }
 * ```
 */
export async function getServerAuth(
  cookieStore: ReadonlyRequestCookies,
  config: SessionStoreConfig & ServerClientConfig
): Promise<NextAuthContext> {
  const cookieName = config.cookie?.name ?? 'authvital_session';
  const sessionCookie = cookieStore.get(cookieName);

  const clientConfig: ServerClientConfig = {
    authVitalHost: config.authVitalHost,
    clientId: config.clientId,
    clientSecret: config.clientSecret,
  };

  // No session
  if (!sessionCookie) {
    return {
      isAuthenticated: false,
      accessToken: null,
      refreshToken: null,
      sessionId: null,
      client: new ServerClient(clientConfig),
      refreshed: false,
    };
  }

  try {
    const tokens = parseSessionCookie(sessionCookie.value, config.secret);
    const now = Math.floor(Date.now() / 1000);
    const needsRefresh = tokens.expiresAt <= now + 300;

    let currentTokens = tokens;
    let refreshed = false;

    // Handle token refresh
    if (needsRefresh && tokens.refreshToken) {
      const refreshResult = await refreshTokens(tokens, clientConfig);

      if (refreshResult) {
        currentTokens = {
          accessToken: refreshResult.access_token,
          refreshToken: refreshResult.refresh_token ?? tokens.refreshToken,
          expiresAt: now + refreshResult.expires_in,
          sessionId: tokens.sessionId,
        };
        refreshed = true;
      }
    }

    return {
      isAuthenticated: true,
      accessToken: currentTokens.accessToken,
      refreshToken: currentTokens.refreshToken,
      sessionId: currentTokens.sessionId,
      client: new ServerClient(clientConfig, currentTokens),
      refreshed,
    };
  } catch {
    // Invalid session
    return {
      isAuthenticated: false,
      accessToken: null,
      refreshToken: null,
      sessionId: null,
      client: new ServerClient(clientConfig),
      refreshed: false,
    };
  }
}

/**
 * Protected Server Component wrapper.
 * Automatically redirects to login if not authenticated.
 *
 * @param cookieStore - Next.js cookie store
 * @param config - Server configuration
 * @param options - Protection options
 * @returns Auth context (throws redirect if not authenticated)
 *
 * @example
 * ```typescript
 * // app/protected/page.tsx
 * import { cookies } from 'next/headers';
 * import { requireServerAuth } from '@authvital/server/middleware';
 * import { redirect } from 'next/navigation';
 *
 * export default async function ProtectedPage() {
 *   const auth = await requireServerAuth(cookies(), {
 *     secret: process.env.SESSION_SECRET!,
 *     authVitalHost: process.env.AUTHVITAL_HOST!,
 *     clientId: process.env.AUTHVITAL_CLIENT_ID!,
 *     clientSecret: process.env.AUTHVITAL_CLIENT_SECRET!,
 *   }, { loginPath: '/login' });
 *
 *   // User is authenticated here
 *   return <div>Protected content</div>;
 * }
 * ```
 */
export async function requireServerAuth(
  cookieStore: ReadonlyRequestCookies,
  config: SessionStoreConfig & ServerClientConfig,
  options: { loginPath?: string } = {}
): Promise<NextAuthContext> {
  const auth = await getServerAuth(cookieStore, config);

  if (!auth.isAuthenticated) {
    const { redirect } = await import('next/navigation');
    redirect(options.loginPath ?? '/login');
  }

  return auth;
}

// =============================================================================
// PAGES ROUTER - getServerSideProps
// =============================================================================

/**
 * Helper for getServerSideProps with authentication.
 *
 * @param context - Next.js context
 * @param config - Server configuration
 * @returns Auth context for props
 *
 * @example
 * ```typescript
 * // pages/dashboard.tsx
 * import { getServerSideAuth } from '@authvital/server/middleware';
 * import type { GetServerSideProps } from 'next';
 *
 * export const getServerSideProps: GetServerSideProps = async (context) => {
 *   const auth = await getServerSideAuth(context, {
 *     secret: process.env.SESSION_SECRET!,
 *     authVitalHost: process.env.AUTHVITAL_HOST!,
 *     clientId: process.env.AUTHVITAL_CLIENT_ID!,
 *     clientSecret: process.env.AUTHVITAL_CLIENT_SECRET!,
 *   });
 *
 *   if (!auth.isAuthenticated) {
 *     return {
 *       redirect: {
 *         destination: '/login',
 *         permanent: false,
 *       },
 *     };
 *   }
 *
 *   const user = await auth.client.getCurrentUser();
 *
 *   return {
 *     props: {
 *       user: user ?? null,
 *     },
 *   };
 * };
 * ```
 */
export async function getServerSideAuth(
  context: {
    req: { headers: { cookie?: string } };
    res: { setHeader: (name: string, value: string | string[]) => void };
  },
  config: SessionStoreConfig & ServerClientConfig
): Promise<NextAuthContext> {
  const cookieName = config.cookie?.name ?? 'authvital_session';
  const cookieHeader = context.req.headers.cookie;

  const clientConfig: ServerClientConfig = {
    authVitalHost: config.authVitalHost,
    clientId: config.clientId,
    clientSecret: config.clientSecret,
  };

  // Parse cookies
  const cookies: Record<string, string> = {};
  if (cookieHeader) {
    cookieHeader.split(';').forEach((cookie) => {
      const [name, ...valueParts] = cookie.trim().split('=');
      if (name && valueParts.length > 0) {
        cookies[name] = decodeURIComponent(valueParts.join('='));
      }
    });
  }

  const sessionCookie = cookies[cookieName];

  if (!sessionCookie) {
    return {
      isAuthenticated: false,
      accessToken: null,
      refreshToken: null,
      sessionId: null,
      client: new ServerClient(clientConfig),
      refreshed: false,
    };
  }

  try {
    const tokens = parseSessionCookie(sessionCookie, config.secret);
    const now = Math.floor(Date.now() / 1000);
    const needsRefresh = tokens.expiresAt <= now + 300;

    let currentTokens = tokens;
    let refreshed = false;

    // Handle token refresh
    if (needsRefresh && tokens.refreshToken) {
      const refreshResult = await refreshTokens(tokens, clientConfig);

      if (refreshResult) {
        currentTokens = {
          accessToken: refreshResult.access_token,
          refreshToken: refreshResult.refresh_token ?? tokens.refreshToken,
          expiresAt: now + refreshResult.expires_in,
          sessionId: tokens.sessionId,
        };
        refreshed = true;

        // Update cookie in response
        const sessionStore = createSessionStore({
          secret: config.secret,
          authVitalHost: config.authVitalHost,
          cookie: config.cookie,
          isProduction: config.isProduction,
        });

        const rotation = sessionStore.rotateSession(
          sessionCookie,
          refreshResult,
          {}
        );

        if (rotation.success && rotation.setCookieHeader) {
          context.res.setHeader('Set-Cookie', rotation.setCookieHeader);
        }
      }
    }

    return {
      isAuthenticated: true,
      accessToken: currentTokens.accessToken,
      refreshToken: currentTokens.refreshToken,
      sessionId: currentTokens.sessionId,
      client: new ServerClient(clientConfig, currentTokens),
      refreshed,
    };
  } catch {
    return {
      isAuthenticated: false,
      accessToken: null,
      refreshToken: null,
      sessionId: null,
      client: new ServerClient(clientConfig),
      refreshed: false,
    };
  }
}

// =============================================================================
// API ROUTE HELPERS
// =============================================================================

/**
 * Get auth context in an API route handler.
 *
 * @param request - Next.js API request
 * @param config - Server configuration
 * @returns Auth context
 *
 * @example
 * ```typescript
 * // app/api/profile/route.ts
 * import { NextRequest, NextResponse } from 'next/server';
 * import { getRouteAuth } from '@authvital/server/middleware';
 *
 * export async function GET(request: NextRequest) {
 *   const auth = await getRouteAuth(request, {
 *     secret: process.env.SESSION_SECRET!,
 *     authVitalHost: process.env.AUTHVITAL_HOST!,
 *     clientId: process.env.AUTHVITAL_CLIENT_ID!,
 *     clientSecret: process.env.AUTHVITAL_CLIENT_SECRET!,
 *   });
 *
 *   if (!auth.isAuthenticated) {
 *     return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 *   }
 *
 *   const user = await auth.client.getCurrentUser();
 *   return NextResponse.json({ user });
 * }
 * ```
 */
export async function getRouteAuth(
  request: NextRequest,
  config: SessionStoreConfig & ServerClientConfig
): Promise<NextAuthContext> {
  const cookieName = config.cookie?.name ?? 'authvital_session';
  const sessionCookie = request.cookies.get(cookieName);

  const clientConfig: ServerClientConfig = {
    authVitalHost: config.authVitalHost,
    clientId: config.clientId,
    clientSecret: config.clientSecret,
  };

  if (!sessionCookie) {
    return {
      isAuthenticated: false,
      accessToken: null,
      refreshToken: null,
      sessionId: null,
      client: new ServerClient(clientConfig),
      refreshed: false,
    };
  }

  try {
    const tokens = parseSessionCookie(sessionCookie.value, config.secret);
    const now = Math.floor(Date.now() / 1000);
    const needsRefresh = tokens.expiresAt <= now + 300;

    let currentTokens = tokens;
    let refreshed = false;

    if (needsRefresh && tokens.refreshToken) {
      const refreshResult = await refreshTokens(tokens, clientConfig);

      if (refreshResult) {
        currentTokens = {
          accessToken: refreshResult.access_token,
          refreshToken: refreshResult.refresh_token ?? tokens.refreshToken,
          expiresAt: now + refreshResult.expires_in,
          sessionId: tokens.sessionId,
        };
        refreshed = true;
      }
    }

    return {
      isAuthenticated: true,
      accessToken: currentTokens.accessToken,
      refreshToken: currentTokens.refreshToken,
      sessionId: currentTokens.sessionId,
      client: new ServerClient(clientConfig, currentTokens),
      refreshed,
    };
  } catch {
    return {
      isAuthenticated: false,
      accessToken: null,
      refreshToken: null,
      sessionId: null,
      client: new ServerClient(clientConfig),
      refreshed: false,
    };
  }
}

// =============================================================================
// SESSION MANAGEMENT HELPERS
// =============================================================================

/**
 * Create a session and set cookie in response.
 *
 * @param tokens - OAuth tokens from AuthVital
 * @param response - NextResponse to set cookie on
 * @param config - Session configuration
 * @returns Modified response
 *
 * @example
 * ```typescript
 * // app/api/callback/route.ts
 * import { NextResponse } from 'next/server';
 * import { setRouteSession } from '@authvital/server/middleware';
 *
 * export async function GET(request: Request) {
 *   const tokens = await exchangeCodeForTokens(request);
 *   const response = NextResponse.redirect('/dashboard');
 *
 *   setRouteSession(tokens, response, {
 *     secret: process.env.SESSION_SECRET!,
 *     authVitalHost: process.env.AUTHVITAL_HOST!,
 *   });
 *
 *   return response;
 * }
 * ```
 */
export function setRouteSession(
  tokens: TokenResponse,
  response: NextResponse,
  config: SessionStoreConfig
): NextResponse {
  const sessionStore = createSessionStore({
    secret: config.secret,
    authVitalHost: config.authVitalHost,
    cookie: config.cookie,
    isProduction: config.isProduction,
  });

  const session = sessionStore.createSession(tokens);
  const cookieOptions = buildCookieOptions(config.cookie, config.isProduction);
  const { name: _name, ...restOptions } = cookieOptions;

  response.cookies.set({
    name: sessionStore.cookieName,
    value: session.cookieValue,
    ...restOptions,
  });

  return response;
}

/**
 * Clear session cookie.
 *
 * @param response - NextResponse to modify
 * @param config - Session configuration
 * @returns Modified response
 */
export function clearRouteSession(
  response: NextResponse,
  config: SessionStoreConfig
): NextResponse {
  const sessionStore = createSessionStore({
    secret: config.secret,
    authVitalHost: config.authVitalHost,
    cookie: config.cookie,
    isProduction: config.isProduction,
  });

  response.cookies.delete(sessionStore.cookieName);
  return response;
}

// =============================================================================
// INTERNAL HELPERS
// =============================================================================

async function refreshTokens(
  tokens: SessionTokens,
  config: ServerClientConfig
): Promise<TokenResponse | null> {
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
      return null;
    }

    return await response.json() as TokenResponse;
  } catch {
    return null;
  }
}

function buildCookieOptions(
  cookieConfig: Partial<CookieOptions> | undefined,
  isProduction: boolean | undefined
): CookieOptions {
  const isProd = isProduction ?? process.env.NODE_ENV === 'production';

  return {
    name: cookieConfig?.name ?? 'authvital_session',
    path: cookieConfig?.path ?? '/',
    httpOnly: cookieConfig?.httpOnly ?? true,
    secure: cookieConfig?.secure ?? isProd,
    sameSite: cookieConfig?.sameSite ?? 'lax',
    maxAge: cookieConfig?.maxAge ?? 30 * 24 * 60 * 60,
    domain: cookieConfig?.domain,
  };
}

// =============================================================================
// RE-EXPORTS
// =============================================================================

export { createSessionStore, createCookieOptions } from '../session/index.js';
export { createServerClient } from '../client/index.js';
