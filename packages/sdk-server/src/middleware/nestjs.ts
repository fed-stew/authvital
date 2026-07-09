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

// Web Crypto API types (available in Node 15+ but not in ES2020 lib)
type WebCryptoKey = Awaited<ReturnType<typeof crypto.subtle.importKey>>;

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
  /** Decoded JWT claims — user identity from the access token */
  user: AuthVitalUser;
}

/**
 * Decoded user identity from the JWT access token.
 * Standard OIDC claims + AuthVital tenant claims.
 */
export interface AuthVitalUser {
  /** User ID (from JWT `sub` claim) */
  id: string;
  /** User email */
  email: string;
  /** Given/first name */
  givenName?: string;
  /** Family/last name */
  familyName?: string;
  /** Display name */
  displayName?: string;
  /** Profile picture URL */
  pictureUrl?: string;
  /** Current tenant ID */
  tenantId?: string;
  /** Current tenant subdomain/slug */
  tenantSlug?: string;
  /** Tenant roles (e.g., ['owner', 'admin']) */
  tenantRoles?: string[];
  /** Tenant permissions */
  tenantPermissions?: string[];
  /** Application roles */
  appRoles?: string[];
  /** License info */
  license?: {
    type: string;
    name: string;
    features: string[];
  };
  /** Raw JWT claims for anything not mapped above */
  [key: string]: unknown;
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

      // Decode JWT claims for easy access to user identity
      const user = this.decodeJwtPayload(tokens.accessToken);

      // Attach auth context to request
      req.authVital = {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        sessionId: tokens.sessionId,
        client,
        refreshed,
        user,
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

  /**
   * Decode JWT payload without verification (token was already validated by encryption).
   * The trust model: tokens are stored in AES-256-GCM encrypted cookies —
   * only our server could have encrypted them, so the JWT content is trustworthy.
   */
  private decodeJwtPayload(token: string): AuthVitalUser {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        return { id: '', email: '' };
      }
      // Handle base64url padding
      const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const padded = base64 + '==='.slice(0, (4 - (base64.length % 4)) % 4);
      const payload = JSON.parse(Buffer.from(padded, 'base64').toString('utf-8'));

      return {
        id: payload.sub || '',
        email: payload.email || '',
        givenName: payload.given_name || payload.givenName || undefined,
        familyName: payload.family_name || payload.familyName || undefined,
        displayName: payload.name || payload.displayName || undefined,
        pictureUrl: payload.picture || payload.pictureUrl || undefined,
        tenantId: payload.tenant_id || payload.tenantId || undefined,
        tenantSlug: payload.tenant_subdomain || payload.tenantSlug || undefined,
        tenantRoles: payload.tenant_roles || payload.tenantRoles || undefined,
        tenantPermissions: payload.tenant_permissions || payload.tenantPermissions || undefined,
        appRoles: payload.app_roles || payload.appRoles || undefined,
        license: payload.license || undefined,
      };
    } catch {
      return { id: '', email: '' };
    }
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

/**
 * Lightweight JWT Auth Guard.
 *
 * Works with plain JWT cookies or Authorization headers.
 * Does NOT require AuthVitalMiddleware or SessionStore.
 * Validates JWT signature via JWKS, then attaches user context to request.
 *
 * Use this when your app stores access_token as a plain httpOnly cookie
 * (e.g., after OAuth callback) rather than using encrypted session cookies.
 *
 * @example
 * ```typescript
 * // Register as global guard in app.module.ts
 * {
 *   provide: APP_GUARD,
 *   useClass: AuthVitalJwtGuard,
 * }
 * ```
 */
@Injectable()
export class AuthVitalJwtGuard implements CanActivate {
  private jwksUrl: string;
  private cachedKeys: Map<string, WebCryptoKey> = new Map();
  private keysLastFetched = 0;
  private readonly KEY_CACHE_TTL = 60 * 60 * 1000; // 1 hour

  constructor(
    @Inject(AUTHVITAL_OPTIONS)
    private readonly options: AuthVitalModuleOptions,
  ) {
    this.jwksUrl = `${options.authVitalHost}/.well-known/jwks.json`;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithAuthVital>();

    // Check for @Public() decorator
    const handler = context.getHandler();
    const classRef = context.getClass();
    const isPublic =
      Reflect.getMetadata('authvital:public', handler) ||
      Reflect.getMetadata('authvital:public', classRef);

    if (isPublic) {
      return true;
    }

    // Skip if middleware already ran (session-based auth)
    if (request.authVital) {
      return true;
    }

    // Extract token from cookie or Authorization header
    const cookieToken = request.cookies?.['access_token'];
    const headerAuth = request.headers.authorization;
    const headerToken = headerAuth?.startsWith('Bearer ') ? headerAuth.substring(7) : undefined;
    const token = cookieToken || headerToken;

    if (!token) {
      throw new UnauthorizedException('No authentication token provided');
    }

    // Decode and verify JWT
    try {
      const user = await this.verifyAndDecodeJwt(token);

      // Attach auth context (compatible with @CurrentUser decorator)
      request.authVital = {
        accessToken: token,
        refreshToken: request.cookies?.['refresh_token'] || null,
        sessionId: '',
        client: new ServerClient({
          authVitalHost: this.options.authVitalHost,
          clientId: this.options.clientId,
          clientSecret: this.options.clientSecret,
        }, {
          accessToken: token,
          refreshToken: request.cookies?.['refresh_token'] || '',
          expiresAt: 0,
          sessionId: '',
        }),
        refreshed: false,
        user,
        metadata: {
          createdAt: 0,
          lastAccessedAt: Date.now(),
          rotationCount: 0,
        },
      };

      return true;
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  private async verifyAndDecodeJwt(token: string): Promise<AuthVitalUser> {
    // Decode header to get kid
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid JWT format');
    }

    const headerBase64 = parts[0].replace(/-/g, '+').replace(/_/g, '/');
    const headerPadded = headerBase64 + '==='.slice(0, (4 - (headerBase64.length % 4)) % 4);
    const header = JSON.parse(Buffer.from(headerPadded, 'base64').toString('utf-8'));
    const kid = header.kid;

    // Get signing key
    const key = await this.getSigningKey(kid);

    // Verify signature
    const signatureInput = parts[0] + '.' + parts[1];
    const signatureBase64 = parts[2].replace(/-/g, '+').replace(/_/g, '/');
    const signaturePadded = signatureBase64 + '==='.slice(0, (4 - (signatureBase64.length % 4)) % 4);
    const signature = Buffer.from(signaturePadded, 'base64');

    const valid = await this.verifySignature(key, signatureInput, signature);
    if (!valid) {
      throw new Error('Invalid JWT signature');
    }

    // Decode payload
    const payloadBase64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const payloadPadded = payloadBase64 + '==='.slice(0, (4 - (payloadBase64.length % 4)) % 4);
    const payload = JSON.parse(Buffer.from(payloadPadded, 'base64').toString('utf-8'));

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      throw new Error('Token expired');
    }

    return {
      id: payload.sub || '',
      email: payload.email || '',
      givenName: payload.given_name || payload.givenName || undefined,
      familyName: payload.family_name || payload.familyName || undefined,
      displayName: payload.name || payload.displayName || undefined,
      pictureUrl: payload.picture || payload.pictureUrl || undefined,
      tenantId: payload.tenant_id || payload.tenantId || undefined,
      tenantSlug: payload.tenant_subdomain || payload.tenantSlug || undefined,
      tenantRoles: payload.tenant_roles || payload.tenantRoles || undefined,
      tenantPermissions: payload.tenant_permissions || payload.tenantPermissions || undefined,
      appRoles: payload.app_roles || payload.appRoles || undefined,
      license: payload.license || undefined,
    };
  }

  private async getSigningKey(kid: string): Promise<WebCryptoKey> {
    // Check cache
    const now = Date.now();
    if (this.cachedKeys.has(kid) && (now - this.keysLastFetched) < this.KEY_CACHE_TTL) {
      return this.cachedKeys.get(kid)!;
    }

    // Fetch JWKS
    const response = await fetch(this.jwksUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch JWKS: ${response.status}`);
    }

    const jwks = await response.json() as { keys: Array<{ kid: string; kty: string; n: string; e: string; alg?: string; use?: string }> };
    this.keysLastFetched = now;
    this.cachedKeys.clear();

    // Import all keys
    for (const jwk of jwks.keys) {
      if (jwk.kty === 'RSA' && (!jwk.use || jwk.use === 'sig')) {
        const cryptoKey = await crypto.subtle.importKey(
          'jwk',
          { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: jwk.alg || 'RS256' },
          { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
          false,
          ['verify'],
        );
        this.cachedKeys.set(jwk.kid, cryptoKey);
      }
    }

    const key = this.cachedKeys.get(kid);
    if (!key) {
      throw new Error(`Signing key not found for kid: ${kid}`);
    }

    return key;
  }

  private async verifySignature(key: WebCryptoKey, input: string, signature: Buffer): Promise<boolean> {
    const encoder = new TextEncoder();
    return crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      key,
      signature,
      encoder.encode(input),
    );
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
      AuthVitalJwtGuard,
    ];

    return {
      module: AuthVitalModule,
      global: options.isGlobal ?? false,
      providers,
      exports: [AUTHVITAL_OPTIONS, AUTHVITAL_SESSION_STORE, AuthVitalMiddleware, AuthVitalGuard, AuthVitalJwtGuard],
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
      AuthVitalJwtGuard,
    ];

    return {
      module: AuthVitalModule,
      global: options.isGlobal ?? false,
      imports: options.imports || [],
      providers,
      exports: [AUTHVITAL_OPTIONS, AUTHVITAL_SESSION_STORE, AuthVitalMiddleware, AuthVitalGuard, AuthVitalJwtGuard],
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
