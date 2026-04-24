/**
 * @authvital/server - NestJS Middleware
 *
 * NestJS integration including:
 * - AuthVitalMiddleware: NestMiddleware for session management
 * - AuthVitalGuard: CanActivate guard for authentication
 * - @CurrentUser() decorator: Access auth context in controllers
 * - AuthVitalModule: Configurable module for dependency injection
 */

import type {
  NestMiddleware,
  CanActivate,
  ExecutionContext,
  DynamicModule,
  Provider,
} from '@nestjs/common';
import {
  Injectable,
  Inject,
  SetMetadata,
  createParamDecorator,
  UnauthorizedException,
  ForbiddenException,
  Module,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import type { TokenResponse } from '@authvital/shared';
import {
  createSessionStore,
  type SessionStoreConfig,
  type SessionTokens,
  type SessionStore,
} from '../session/index.js';
import { ServerClient, type ServerClientConfig } from '../client/index.js';

// =============================================================================
// TYPES
// =============================================================================

/**
 * AuthVital context attached to requests.
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
 * Request with AuthVital context.
 */
export interface RequestWithAuthVital extends Request {
  authVital?: AuthVitalContext;
}

/**
 * AuthVital module configuration.
 */
export interface AuthVitalModuleOptions extends Omit<SessionStoreConfig, 'authVitalHost'> {
  /** AuthVital API host */
  authVitalHost: string;
  /** OAuth client ID */
  clientId: string;
  /** OAuth client secret (for token refresh) */
  clientSecret: string;
  /** Routes to exclude from authentication (strings or RegExp patterns as strings) */
  publicRoutes?: string[];
  /** Callback when session is refreshed */
  onRefresh?: (tokens: TokenResponse, req: Request, res: Response) => void;
  /** Whether to make the module global */
  isGlobal?: boolean;
}

/**
 * Guard options for authentication requirements.
 */
export interface AuthGuardOptions {
  /** Redirect to this path if not authenticated (instead of throwing 401) */
  redirectTo?: string;
}

// =============================================================================
// INJECTION TOKENS
// =============================================================================

/** Injection token for AuthVital module options */
export const AUTHVITAL_OPTIONS = Symbol('AUTHVITAL_OPTIONS');

/** Injection token for session store */
export const AUTHVITAL_SESSION_STORE = Symbol('AUTHVITAL_SESSION_STORE');

// =============================================================================
// AUTHVITAL MIDDLEWARE
// =============================================================================

/**
 * NestJS middleware for AuthVital session management.
 *
 * This middleware:
 * 1. Parses session cookies from incoming requests
 * 2. Decrypts and validates tokens
 * 3. Refreshes tokens if expired
 * 4. Attaches auth context to req.authVital
 * 5. Creates a server client pre-configured with the access token
 *
 * @example
 * ```typescript
 * // app.module.ts
 * import { AuthVitalMiddleware } from '@authvital/server/middleware/nestjs';
 * import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
 *
 * @Module({ ... })
 * export class AppModule implements NestModule {
 *   configure(consumer: MiddlewareConsumer) {
 *     consumer
 *       .apply(AuthVitalMiddleware)
 *       .forRoutes('*');
 *   }
 * }
 * ```
 */
@Injectable()
export class AuthVitalMiddleware implements NestMiddleware {
  private readonly clientConfig: ServerClientConfig;
  private readonly publicRoutes: string[];

  constructor(
    @Inject(AUTHVITAL_OPTIONS)
    private readonly options: AuthVitalModuleOptions,
    @Inject(AUTHVITAL_SESSION_STORE)
    private readonly sessionStore: SessionStore
  ) {
    this.clientConfig = {
      authVitalHost: options.authVitalHost,
      clientId: options.clientId,
      clientSecret: options.clientSecret,
    };
    this.publicRoutes = options.publicRoutes ?? [];
  }

  async use(req: RequestWithAuthVital, res: Response, next: NextFunction): Promise<void> {
    try {
      // Check if this route is public
      const _isPublic = this.publicRoutes.some((route) => {
        return req.path === route || req.path.startsWith(route);
      });

      // Validate session
      const validation = this.sessionStore.validateSession(req.headers.cookie);

      if (!validation.valid) {
        // Clear invalid session cookie
        if (validation.error && this.sessionStore.hasSession(req.headers.cookie)) {
          res.setHeader('Set-Cookie', this.sessionStore.createClearCookieHeader());
        }

        // Continue without auth context (guards will handle unauthorized)
        return next();
      }

      const { session, needsRefresh } = validation;

      if (!session) {
        return next();
      }

      let tokens = session.tokens;
      let refreshed = false;

      // Handle token refresh if needed
      if (needsRefresh && tokens.refreshToken) {
        const refreshResult = await this.performTokenRefresh(tokens);

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
            ? this.sessionStore.getSessionTokens(cookieHeader)
            : null;

          if (currentCookie) {
            // Extract encrypted value from cookie header
            const encryptedValue = this.extractCookieValue(cookieHeader);

            if (encryptedValue) {
              const rotation = this.sessionStore.rotateSession(
                encryptedValue,
                refreshResult.tokens,
                {
                  userAgent: req.headers['user-agent'],
                  ipAddress: req.ip ?? undefined,
                }
              );

              if (rotation.success && rotation.setCookieHeader) {
                res.setHeader('Set-Cookie', rotation.setCookieHeader);

                // Call user callback
                if (this.options.onRefresh) {
                  this.options.onRefresh(refreshResult.tokens, req, res);
                }
              }
            }
          }
        }
      }

      // Create server client with the (potentially refreshed) tokens
      const client = new ServerClient(this.clientConfig, tokens);

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
  }

  private extractCookieValue(cookieHeader: string | undefined): string | null {
    if (!cookieHeader) return null;

    const cookieName = this.sessionStore.cookieName;
    const cookies = cookieHeader.split(';');

    for (const cookie of cookies) {
      const [name, ...valueParts] = cookie.trim().split('=');
      if (name === cookieName && valueParts.length > 0) {
        return decodeURIComponent(valueParts.join('='));
      }
    }

    return null;
  }

  private async performTokenRefresh(
    tokens: SessionTokens
  ): Promise<{ success: boolean; tokens?: TokenResponse }> {
    try {
      const url = `${this.clientConfig.authVitalHost}/api/oauth/token`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: tokens.refreshToken ?? '',
          client_id: this.clientConfig.clientId,
          client_secret: this.clientConfig.clientSecret,
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
}

// =============================================================================
// AUTHVITAL GUARD
// =============================================================================

/**
 * NestJS guard for authentication protection.
 *
 * Use this guard to protect routes/controllers that require authentication.
 *
 * @example
 * ```typescript
 * // Protect specific routes
 * @Controller('api')
 * export class ApiController {
 *   @Get('profile')
 *   @UseGuards(AuthVitalGuard)
 *   async getProfile(@CurrentUser() auth: AuthVitalContext) {
 *     const user = await auth.client.getCurrentUser();
 *     return user;
 *   }
 * }
 *
 * // Protect entire controller
 * @Controller('api/admin')
 * @UseGuards(AuthVitalGuard)
 * export class AdminController {
 *   @Get('users')
 *   async getUsers(@CurrentUser() auth: AuthVitalContext) {
 *     // Authenticated user only
 *   }
 * }
 * ```
 */
@Injectable()
export class AuthVitalGuard implements CanActivate {
  constructor(
    @Inject(AUTHVITAL_OPTIONS)
    private readonly options: AuthVitalModuleOptions
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = this.getRequest(context);
    const auth = request.authVital;

    if (!auth) {
      // Check if redirect is configured
      if (this.options.publicRoutes?.includes('/login')) {
        // Cannot redirect from guard, throw unauthorized
        throw new UnauthorizedException('Authentication required');
      }
      throw new UnauthorizedException('Authentication required');
    }

    return true;
  }

  private getRequest(context: ExecutionContext): RequestWithAuthVital {
    return context.switchToHttp().getRequest();
  }
}

/**
 * Guard that requires specific permissions.
 *
 * Use with @RequirePermissions() decorator.
 *
 * @example
 * ```typescript
 * @Controller('api/admin')
 * export class AdminController {
 *   @Delete('users/:id')
 *   @UseGuards(AuthVitalPermissionGuard)
 *   @RequirePermissions('users:delete')
 *   async deleteUser(@CurrentUser() auth: AuthVitalContext) {
 *     // User must have 'users:delete' permission
 *   }
 * }
 * ```
 */
@Injectable()
export class AuthVitalPermissionGuard implements CanActivate {
  constructor(
    @Inject(AUTHVITAL_OPTIONS)
    private readonly options: AuthVitalModuleOptions,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = this.getRequest(context);
    const auth = request.authVital;

    if (!auth) {
      throw new UnauthorizedException('Authentication required');
    }

    // Get required permissions from metadata
    const requiredPermissions = this.getRequiredPermissions(context);

    if (requiredPermissions.length === 0) {
      return true;
    }

    // Check permissions via API
    try {
      const response = await auth.client.post<{
        results: Record<string, boolean>;
        allAllowed: boolean;
      }>('/api/auth/check-permissions', {
        permissions: requiredPermissions,
      });

      if (!response.ok || !response.data?.allAllowed) {
        throw new ForbiddenException({
          message: 'Permission denied',
          required: requiredPermissions,
          results: response.data?.results,
        });
      }

      return true;
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error;
      }
      throw new ForbiddenException('Permission check failed');
    }
  }

  private getRequest(context: ExecutionContext): RequestWithAuthVital {
    return context.switchToHttp().getRequest();
  }

  private getRequiredPermissions(context: ExecutionContext): string[] {
    const handler = context.getHandler();
    const controller = context.getClass();

    // Check handler-level metadata
    const handlerPermissions = Reflect.getMetadata(PERMISSIONS_METADATA, handler) || [];
    const controllerPermissions = Reflect.getMetadata(PERMISSIONS_METADATA, controller) || [];

    return [...controllerPermissions, ...handlerPermissions];
  }
}

// =============================================================================
// DECORATORS
// =============================================================================

/** Metadata key for permissions */
const PERMISSIONS_METADATA = 'authvital:permissions';

/**
 * Parameter decorator to access the AuthVital context.
 *
 * Use this to inject the auth context into your controller methods.
 *
 * @example
 * ```typescript
 * @Controller('api')
 * export class UserController {
 *   @Get('profile')
 *   @UseGuards(AuthVitalGuard)
 *   async getProfile(@CurrentUser() auth: AuthVitalContext) {
 *     const user = await auth.client.getCurrentUser();
 *     return user;
 *   }
 *
 *   @Get('token')
 *   @UseGuards(AuthVitalGuard)
 *   getToken(@CurrentUser('accessToken') token: string) {
 *     // Just get the access token
 *     return { token };
 *   }
 * }
 * ```
 */
export const CurrentUser = createParamDecorator(
  (data: keyof AuthVitalContext | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<RequestWithAuthVital>();
    const auth = request.authVital;

    if (!auth) {
      throw new UnauthorizedException('Authentication required');
    }

    // Return specific property if requested, otherwise return full context
    return data ? auth[data] : auth;
  }
);

/**
 * Decorator to mark routes or controllers as public (no authentication required).
 *
 * @example
 * ```typescript
 * @Controller('api')
 * export class ApiController {
 *   @Get('public-data')
 *   @Public()
 *   async getPublicData() {
 *     // No authentication required
 *   }
 * }
 * ```
 */
export const Public = () => SetMetadata('authvital:public', true);

/**
 * Decorator to require specific permissions for a route or controller.
 *
 * @param permissions - Required permissions
 *
 * @example
 * ```typescript
 * @Controller('api/admin')
 * export class AdminController {
 *   @Delete('users/:id')
 *   @RequirePermissions('users:delete')
 *   async deleteUser() {
 *     // Requires 'users:delete' permission
 *   }
 *
 *   @Post('roles')
 *   @RequirePermissions('roles:create', 'roles:assign')
 *   async createRole() {
 *     // Requires multiple permissions
 *   }
 * }
 * ```
 */
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_METADATA, permissions);

// =============================================================================
// AUTHVITAL MODULE
// =============================================================================

/**
 * Configurable NestJS module for AuthVital integration.
 *
 * This module provides:
 * - AuthVitalMiddleware for session management
 * - AuthVitalGuard for route protection
 * - CurrentUser decorator for accessing auth context
 * - SessionStore as injectable service
 *
 * @example
 * ```typescript
 * // app.module.ts
 * import { AuthVitalModule } from '@authvital/server/middleware/nestjs';
 *
 * @Module({
 *   imports: [
 *     AuthVitalModule.forRoot({
 *       secret: process.env.SESSION_SECRET!,
 *       authVitalHost: 'https://auth.example.com',
 *       clientId: process.env.AUTHVITAL_CLIENT_ID!,
 *       clientSecret: process.env.AUTHVITAL_CLIENT_SECRET!,
 *       publicRoutes: ['/api/public', '/health'],
 *       isGlobal: true,
 *     }),
 *   ],
 * })
 * export class AppModule implements NestModule {
 *   configure(consumer: MiddlewareConsumer) {
 *     consumer
 *       .apply(AuthVitalMiddleware)
 *       .forRoutes('*');
 *   }
 * }
 * ```
 */
@Module({})
export class AuthVitalModule {
  /**
   * Synchronously configure the AuthVital module.
   *
   * @param options - Module configuration options
   * @returns Configured dynamic module
   */
  static forRoot(options: AuthVitalModuleOptions): DynamicModule {
    const sessionStore = createSessionStore({
      secret: options.secret,
      cookie: options.cookie,
      isProduction: options.isProduction,
      authVitalHost: options.authVitalHost,
    });

    const providers: Provider[] = [
      {
        provide: AUTHVITAL_OPTIONS,
        useValue: options,
      },
      {
        provide: AUTHVITAL_SESSION_STORE,
        useValue: sessionStore,
      },
      AuthVitalMiddleware,
      AuthVitalGuard,
      AuthVitalPermissionGuard,
    ];

    return {
      module: AuthVitalModule,
      global: options.isGlobal ?? false,
      providers,
      exports: [AUTHVITAL_OPTIONS, AUTHVITAL_SESSION_STORE, AuthVitalMiddleware, AuthVitalGuard],
    };
  }

  /**
   * Asynchronously configure the AuthVital module.
   *
   * Useful for configuration from ConfigService or other async sources.
   *
   * @example
   * ```typescript
   * AuthVitalModule.forRootAsync({
   *   imports: [ConfigModule],
   *   useFactory: async (config: ConfigService) => ({
   *     secret: config.get('SESSION_SECRET'),
   *     authVitalHost: config.get('AUTHVITAL_HOST'),
   *     clientId: config.get('AUTHVITAL_CLIENT_ID'),
   *     clientSecret: config.get('AUTHVITAL_CLIENT_SECRET'),
   *     isGlobal: true,
   *   }),
   *   inject: [ConfigService],
   * })
   * ```
   */
  static forRootAsync(options: {
    imports?: any[];
    useFactory: (...args: any[]) => Promise<AuthVitalModuleOptions> | AuthVitalModuleOptions;
    inject?: any[];
    isGlobal?: boolean;
  }): DynamicModule {
    const sessionStoreProvider: Provider = {
      provide: AUTHVITAL_SESSION_STORE,
      useFactory: (opts: AuthVitalModuleOptions) => {
        return createSessionStore({
          secret: opts.secret,
          cookie: opts.cookie,
          isProduction: opts.isProduction,
          authVitalHost: opts.authVitalHost,
        });
      },
      inject: [AUTHVITAL_OPTIONS],
    };

    const optionsProvider: Provider = {
      provide: AUTHVITAL_OPTIONS,
      useFactory: options.useFactory,
      inject: options.inject || [],
    };

    const providers: Provider[] = [
      optionsProvider,
      sessionStoreProvider,
      AuthVitalMiddleware,
      AuthVitalGuard,
      AuthVitalPermissionGuard,
    ];

    return {
      module: AuthVitalModule,
      global: options.isGlobal ?? false,
      imports: options.imports || [],
      providers,
      exports: [AUTHVITAL_OPTIONS, AUTHVITAL_SESSION_STORE, AuthVitalMiddleware, AuthVitalGuard],
    };
  }
}

// =============================================================================
// SESSION HELPERS
// =============================================================================

/**
 * Set a session for a request/response.
 *
 * @param sessionStore - Configured session store
 * @param tokens - OAuth tokens
 * @param req - Express request
 * @param res - Express response
 *
 * @example
 * ```typescript
 * @Controller('api')
 * export class AuthController {
 *   constructor(
 *     @Inject(AUTHVITAL_SESSION_STORE)
 *     private readonly sessionStore: SessionStore,
 *   ) {}
 *
 *   @Post('login')
 *   async login(@Req() req: Request, @Res() res: Response) {
 *     const tokens = await this.exchangeCodeForTokens(req.body.code);
 *     setSession(this.sessionStore, tokens, req, res);
 *     res.json({ success: true });
 *   }
 * }
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
    ipAddress: req.ip ?? undefined,
  });

  res.setHeader('Set-Cookie', session.setCookieHeader);
}

/**
 * Clear the session (logout).
 *
 * @param sessionStore - Configured session store
 * @param res - Express response
 *
 * @example
 * ```typescript
 * @Controller('api')
 * export class AuthController {
 *   @Post('logout')
 *   async logout(
 *     @Inject(AUTHVITAL_SESSION_STORE) sessionStore: SessionStore,
 *     @Res() res: Response
 *   ) {
 *     clearSession(sessionStore, res);
 *     res.json({ success: true });
 *   }
 * }
 * ```
 */
export function clearSession(sessionStore: SessionStore, res: Response): void {
  res.setHeader('Set-Cookie', sessionStore.createClearCookieHeader());
}

// =============================================================================
// RE-EXPORTS
// =============================================================================

export { createSessionStore, createCookieOptions } from '../session/index.js';
export { createServerClient } from '../client/index.js';
