import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  NotFoundException,
  Logger,
} from "@nestjs/common";
import { OWNER_PERMISSIONS } from "../authorization";
import { ConfigService } from "@nestjs/config";

import { PrismaService } from "../prisma/prisma.service";
import { KeyService } from "./key.service";
import * as crypto from "crypto";
import * as bcrypt from "bcrypt";
import { v4 as uuidv4 } from "uuid";
import { ApplicationType, CodeChallengeMethod, Prisma } from "@prisma/client";

export interface AuthorizeParams {
  clientId: string;
  redirectUri: string;
  responseType: string;
  scope?: string;
  state?: string;
  nonce?: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
  // Tenant scoping for separate token per tenant
  tenantId?: string;
  tenantSubdomain?: string;
}

export interface TokenParams {
  grantType: string;
  code?: string;
  codeVerifier?: string;
  clientId: string;
  clientSecret?: string;
  redirectUri?: string;
  refreshToken?: string;
  scope?: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  id_token?: string;
}

@Injectable()
export class OAuthService {
  private readonly issuer: string;
  private readonly logger = new Logger(OAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly keyService: KeyService,
    private readonly configService: ConfigService,
  ) {
    this.issuer = this.configService.getOrThrow<string>("BASE_URL");
  }

  // ===========================================================================
  // REDIRECT URI VALIDATION (with wildcard support)
  // ===========================================================================

  /**
   * Check if a redirect URI matches any registered URI pattern
   * Supports:
   * - Exact matches
   * - Wildcards: http://*.example.com/callback
   * - Tenant placeholder: https://{tenant}.example.com/callback (validates tenant exists in DB)
   *
   * @returns Validation result with reason if validation fails
   */
  private async matchesRedirectUri(
    redirectUri: string,
    registeredUris: string[],
  ): Promise<{ valid: boolean; reason?: string }> {
    this.logger.log(
      `[matchesRedirectUri] Checking redirectUri: ${redirectUri}`,
    );
    this.logger.log(
      `[matchesRedirectUri] Registered URIs: ${JSON.stringify(registeredUris)}`,
    );

    for (const pattern of registeredUris) {
      this.logger.log(`[matchesRedirectUri] Checking pattern: ${pattern}`);

      // Exact match
      if (pattern === redirectUri) {
        this.logger.log(`[matchesRedirectUri] Exact match!`);
        return { valid: true };
      }

      // Tenant placeholder match (e.g., https://{tenant}.myapp.com/callback)
      if (pattern.includes("{tenant}")) {
        // For URL patterns, only the dot (.) needs escaping in regex
        // (the { and } are not special in JS regex)
        const escaped = pattern.replace(/\./g, "\\.");

        this.logger.log(
          `[matchesRedirectUri] Escaped pattern: ${JSON.stringify(escaped)}`,
        );

        // Now replace the escaped \{tenant\} with a capture group
        const regexPattern = escaped.replace(/{tenant}/g, "([a-zA-Z0-9-]+)");

        this.logger.log(
          `[matchesRedirectUri] Final regex pattern: ${JSON.stringify(regexPattern)}`,
        );

        try {
          const regex = new RegExp(`^${regexPattern}$`);
          this.logger.log(
            `[matchesRedirectUri] Testing regex against: ${redirectUri}`,
          );
          const match = redirectUri.match(regex);

          this.logger.log(
            `[matchesRedirectUri] Match result: ${JSON.stringify(match)}`,
          );

          if (match && match[1]) {
            const tenantSlug = match[1];
            this.logger.log(
              `[matchesRedirectUri] Tenant placeholder match! Extracted tenant slug: ${tenantSlug}`,
            );

            // Validate tenant exists in database
            const tenant = await this.prisma.tenant.findUnique({
              where: { slug: tenantSlug },
              select: { id: true },
            });

            if (tenant) {
              this.logger.log(
                `[matchesRedirectUri] Tenant ${tenantSlug} exists in DB! Match valid.`,
              );
              return { valid: true };
            } else {
              this.logger.warn(
                `[matchesRedirectUri] Tenant ${tenantSlug} not found in DB!`,
              );
              return {
                valid: false,
                reason: `Tenant "${tenantSlug}" not found in database. The redirect URI pattern requires the tenant to exist.`,
              };
            }
          } else {
            this.logger.warn(
              `[matchesRedirectUri] Tenant placeholder pattern didn't match.`,
            );
            this.logger.warn(
              `[matchesRedirectUri]   Pattern: ${JSON.stringify(pattern)}`,
            );
            this.logger.warn(
              `[matchesRedirectUri]   Escaped: ${JSON.stringify(escaped)}`,
            );
            this.logger.warn(
              `[matchesRedirectUri]   Regex Pattern: ${JSON.stringify(regexPattern)}`,
            );
            this.logger.warn(
              `[matchesRedirectUri]   Redirect URI: ${JSON.stringify(redirectUri)}`,
            );
          }
        } catch (e) {
          // Invalid regex pattern, skip
          this.logger.error(`[matchesRedirectUri] Regex error: ${e}`);
        }
        continue;
      }

      // Wildcard match (e.g., http://*.localhost:5173/callback)
      if (pattern.includes("*")) {
        // Escape dots, then replace * with subdomain pattern
        const regexPattern = pattern
          .split(".")
          .join("\\.")
          .split("*")
          .join("[a-zA-Z0-9-]+");

        try {
          const regex = new RegExp(`^${regexPattern}$`);
          if (regex.test(redirectUri)) {
            this.logger.log(`[matchesRedirectUri] Wildcard match!`);
            return { valid: true };
          }
        } catch (e) {
          // Invalid regex pattern, skip
          this.logger.error(`[matchesRedirectUri] Wildcard regex error: ${e}`);
        }
      }
    }

    this.logger.warn(`[matchesRedirectUri] No matching pattern found!`);
    return {
      valid: false,
      reason: `Redirect URI "${redirectUri}" does not match any registered pattern. Did you mean to register this URI, or use a wildcard or {tenant} placeholder?`,
    };
  }

  // ===========================================================================
  // AUTHORIZATION ENDPOINT
  // ===========================================================================

  /**
   * Validate authorize request and generate authorization code
   */
  async authorize(userId: string, params: AuthorizeParams): Promise<string> {
    // Verify user exists (handles stale sessions after database reseed)
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException(
        "User session is invalid. Please login again.",
      );
    }

    // Validate response_type
    if (params.responseType !== "code") {
      throw new BadRequestException(
        'Invalid response_type. Only "code" is supported.',
      );
    }

    // Find application by client_id
    const app = await this.prisma.application.findUnique({
      where: { clientId: params.clientId },
    });

    if (!app || !app.isActive) {
      throw new BadRequestException("Invalid client_id");
    }

    // Validate redirect_uri (supports wildcards and {tenant} placeholder)
    if (
      !(await this.matchesRedirectUri(params.redirectUri, app.redirectUris))
    ) {
      throw new BadRequestException(
        "Invalid redirect_uri. URI must be registered with the application.",
      );
    }

    // PKCE validation for SPA apps (required)
    if (app.type === ApplicationType.SPA) {
      if (!params.codeChallenge) {
        throw new BadRequestException(
          "PKCE code_challenge is required for SPA applications",
        );
      }
      if (params.codeChallengeMethod !== "S256") {
        throw new BadRequestException(
          "Invalid code_challenge_method. Only S256 is supported.",
        );
      }
    }

    // Generate authorization code
    const code = uuidv4();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Store authorization code with PKCE data and optional tenant scope
    await this.prisma.authorizationCode.create({
      data: {
        code,
        redirectUri: params.redirectUri,
        scope: params.scope || "openid profile email",
        state: params.state,
        nonce: params.nonce,
        codeChallenge: params.codeChallenge,
        codeChallengeMethod: params.codeChallengeMethod
          ? (params.codeChallengeMethod.toUpperCase() as CodeChallengeMethod)
          : null,
        expiresAt,
        userId,
        applicationId: app.id,
        // Tenant scoping: if provided, token will ONLY include this tenant
        tenantId: params.tenantId,
        tenantSubdomain: params.tenantSubdomain,
      },
    });

    return code;
  }

  // ===========================================================================
  // TOKEN ENDPOINT
  // ===========================================================================

  /**
   * Exchange authorization code for tokens
   */
  async token(params: TokenParams): Promise<TokenResponse> {
    switch (params.grantType) {
      case "authorization_code":
        return this.handleAuthorizationCodeGrant(params);
      case "refresh_token":
        return this.handleRefreshTokenGrant(params);
      case "client_credentials":
        return this.handleClientCredentialsGrant(params);
      default:
        throw new BadRequestException("Unsupported grant_type");
    }
  }

  /**
   * Handle authorization_code grant type
   */
  private async handleAuthorizationCodeGrant(
    params: TokenParams,
  ): Promise<TokenResponse> {
    if (!params.code) {
      throw new BadRequestException("Missing code parameter");
    }

    console.log(
      "[OAuth Token] Exchanging code:",
      params.code.substring(0, 8) + "...",
    );
    console.log("[OAuth Token] Client ID:", params.clientId);
    console.log("[OAuth Token] Redirect URI:", params.redirectUri);
    console.log("[OAuth Token] Has code_verifier:", !!params.codeVerifier);

    // Find authorization code
    const authCode = await this.prisma.authorizationCode.findUnique({
      where: { code: params.code },
      include: {
        user: {
          include: {
            memberships: {
              where: { status: "ACTIVE" },
              include: { tenant: true },
            },
          },
        },
        application: true,
      },
    });

    if (!authCode) {
      console.log("[OAuth Token] Code not found in database");
      throw new UnauthorizedException(
        "Invalid authorization code - code not found or already deleted",
      );
    }

    console.log("[OAuth Token] Found code, expires:", authCode.expiresAt);
    console.log("[OAuth Token] Code already used:", !!authCode.usedAt);
    console.log("[OAuth Token] Stored redirect_uri:", authCode.redirectUri);

    // Check if code is expired
    if (authCode.expiresAt < new Date()) {
      await this.prisma.authorizationCode.delete({
        where: { id: authCode.id },
      });
      throw new UnauthorizedException(
        `Authorization code expired (expired at ${authCode.expiresAt.toISOString()})`,
      );
    }

    // Check if code was already used
    if (authCode.usedAt) {
      // Potential replay attack - revoke all tokens for this user/app
      await this.revokeUserAppTokens(authCode.userId, authCode.applicationId);
      throw new UnauthorizedException("Authorization code already used");
    }

    // Verify client_id matches
    if (authCode.application.clientId !== params.clientId) {
      throw new UnauthorizedException("Client ID mismatch");
    }

    // Verify redirect_uri matches exactly
    if (params.redirectUri && params.redirectUri !== authCode.redirectUri) {
      throw new UnauthorizedException(
        `Redirect URI mismatch: got "${params.redirectUri}" but expected "${authCode.redirectUri}"`,
      );
    }

    // If application has a client secret configured, it MUST be provided
    // This ensures confidential clients cannot skip authentication
    if (authCode.application.clientSecret) {
      if (!params.clientSecret) {
        throw new UnauthorizedException(
          "Client secret is required for this application",
        );
      }
      const secretValid = await bcrypt.compare(
        params.clientSecret,
        authCode.application.clientSecret,
      );
      if (!secretValid) {
        throw new UnauthorizedException("Invalid client secret");
      }
    }

    // Verify PKCE code_verifier
    if (authCode.codeChallenge) {
      if (!params.codeVerifier) {
        throw new UnauthorizedException("Missing code_verifier for PKCE");
      }
      const valid = this.verifyPkce(
        params.codeVerifier,
        authCode.codeChallenge,
        authCode.codeChallengeMethod || CodeChallengeMethod.S256,
      );
      if (!valid) {
        throw new UnauthorizedException(
          "Invalid code_verifier - PKCE verification failed",
        );
      }
    }

    // Mark code as used
    await this.prisma.authorizationCode.update({
      where: { id: authCode.id },
      data: { usedAt: new Date() },
    });

    // Generate tokens with optional tenant scope
    // If the auth code was scoped to a tenant, the resulting token will ONLY include that tenant
    return this.generateTokens(
      authCode.user,
      authCode.application,
      authCode.scope || "openid profile email",
      authCode.nonce,
      // Pass tenant scope if present (separate token per tenant pattern)
      authCode.tenantId && authCode.tenantSubdomain
        ? {
            tenantId: authCode.tenantId,
            tenantSubdomain: authCode.tenantSubdomain,
          }
        : null,
    );
  }

  /**
   * Handle refresh_token grant type
   *
   * TOKEN GHOSTING FLOW:
   * 1. Verify JWT signature (no DB hit if invalid - fast rejection)
   * 2. Extract session ID (sid) from JWT
   * 3. Check session validity in DB (revoked = false, not expired)
   * 4. Generate new tokens with rotation (revoke old session, create new)
   */
  private async handleRefreshTokenGrant(
    params: TokenParams,
  ): Promise<TokenResponse> {
    if (!params.refreshToken) {
      throw new BadRequestException("Missing refresh_token parameter");
    }

    let sessionId: string;
    let jwtPayload: {
      sid: string;
      sub: string;
      aud: string;
      scope: string;
      tenantId?: string;
      tenantSubdomain?: string;
    } | null = null;

    // ==========================================================================
    // STEP 1: Try to verify as Token Ghosting JWT first
    // ==========================================================================
    try {
      jwtPayload = await this.verifyRefreshTokenJwt(params.refreshToken);
      sessionId = jwtPayload.sid;

      // Validate audience (client_id) matches
      if (jwtPayload.aud !== params.clientId) {
        throw new UnauthorizedException("Client ID mismatch");
      }

      this.logger.debug(
        `[Token Ghosting] Verified refresh JWT, session ID: ${sessionId}`,
      );
    } catch (error) {
      // Token Ghosting only - invalid JWT means invalid token
      this.logger.debug(`[Token Ghosting] JWT verification failed: ${error}`);
      throw new UnauthorizedException("Invalid refresh token");
    }

    // ==========================================================================
    // STEP 2: Lookup session in database
    // ==========================================================================
    const refreshTokenInclude = {
      user: {
        include: {
          memberships: {
            where: { status: "ACTIVE" as const },
            include: { tenant: true },
          },
        },
      },
      application: true,
    } satisfies Prisma.RefreshTokenInclude;

    type RefreshTokenWithRelations = Prisma.RefreshTokenGetPayload<{
      include: typeof refreshTokenInclude;
    }>;
    let refreshToken: RefreshTokenWithRelations | null = null;

    // Token Ghosting: lookup by session ID from JWT
    refreshToken = await this.prisma.refreshToken.findUnique({
      where: { id: jwtPayload.sid },
      include: refreshTokenInclude,
    });

    if (!refreshToken) {
      throw new UnauthorizedException("Invalid refresh token");
    }

    // ==========================================================================
    // STEP 3: Validate session state (Token Ghosting "ghost check")
    // ==========================================================================
    if (refreshToken.revoked || refreshToken.revokedAt) {
      this.logger.warn(
        `[Token Ghosting] Session ${refreshToken.id} has been revoked`,
      );
      throw new UnauthorizedException("Session has been revoked");
    }

    if (refreshToken.expiresAt < new Date()) {
      throw new UnauthorizedException("Session expired");
    }

    // Client ID already validated via JWT aud claim in Token Ghosting

    // ==========================================================================
    // STEP 4: Rotate refresh token (revoke old, generate new)
    // ==========================================================================
    await this.prisma.refreshToken.update({
      where: { id: refreshToken.id },
      data: {
        revoked: true,
        revokedAt: new Date(),
      },
    });

    // Maintain tenant scope when refreshing tokens
    // If the original refresh token was scoped to a tenant, the new token will be too
    return this.generateTokens(
      refreshToken.user,
      refreshToken.application,
      refreshToken.scope || "openid profile email",
      null, // nonce not needed for refresh token grant
      // Pass tenant scope if present (maintain isolation on refresh)
      refreshToken.tenantId && refreshToken.tenantSubdomain
        ? {
            tenantId: refreshToken.tenantId,
            tenantSubdomain: refreshToken.tenantSubdomain,
          }
        : null,
    );
  }

  /**
   * Handle client_credentials grant type (Machine-to-Machine)
   * Used for backend-to-backend communication without a user context
   */
  private async handleClientCredentialsGrant(
    params: TokenParams,
  ): Promise<TokenResponse> {
    if (!params.clientId || !params.clientSecret) {
      throw new BadRequestException(
        "client_id and client_secret are required for client_credentials grant",
      );
    }

    // Find application by client_id
    const app = await this.prisma.application.findUnique({
      where: { clientId: params.clientId },
    });

    if (!app || !app.isActive) {
      throw new UnauthorizedException("Invalid client_id");
    }

    // Any application with a client secret can use client_credentials grant
    // This enables the unified app model where one app supports both user auth AND M2M
    if (!app.clientSecret) {
      throw new UnauthorizedException(
        "Application does not have a client secret configured. " +
          "Generate a client secret in the admin panel to enable M2M authentication.",
      );
    }

    const secretValid = await bcrypt.compare(
      params.clientSecret,
      app.clientSecret,
    );
    if (!secretValid) {
      throw new UnauthorizedException("Invalid client_secret");
    }

    // Generate M2M access token (no user, no refresh token)
    return this.generateM2MTokens(app, params.scope || "system:admin");
  }

  /**
   * Generate Machine-to-Machine tokens (no user context)
   */
  private async generateM2MTokens(
    application: {
      id: string;
      clientId: string;
      accessTokenTtl: number;
    },
    scope: string,
  ): Promise<TokenResponse> {
    // M2M tokens don't have user claims, just application/scope info
    const accessTokenPayload: Record<string, unknown> = {
      scope,
      client_id: application.clientId,
      token_type: "m2m", // Indicate this is a machine token
    };

    // Sign access token
    const accessToken = await this.keyService.signJwt(accessTokenPayload, {
      subject: `app:${application.clientId}`, // Subject is the application itself
      audience: application.clientId,
      issuer: this.issuer,
      expiresIn: application.accessTokenTtl,
    });

    return {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: application.accessTokenTtl,
      scope,
      // No refresh_token for M2M - clients should request new tokens when needed
    };
  }

  // ===========================================================================
  // TOKEN GENERATION
  // ===========================================================================

  /**
   * Generate access token, refresh token, and optionally ID token
   *
   * @param tenantScope - Optional tenant scope. If provided, token ONLY includes this tenant.
   *                      This enables "separate token per tenant" pattern for strict isolation.
   */
  private async generateTokens(
    user: {
      id: string;
      email: string | null;
      givenName: string | null;
      familyName: string | null;
      memberships: { tenant: { id: string; slug: string; name: string } }[];
    },
    application: {
      id: string;
      clientId: string;
      accessTokenTtl: number;
      refreshTokenTtl: number;
      licensingMode?: string | null;
      [key: string]: unknown; // Allow any other properties from Prisma Application
    },
    scope: string,
    nonce?: string | null,
    // Optional tenant scope for separate token per tenant pattern
    tenantScope?: { tenantId: string; tenantSubdomain: string } | null,
  ): Promise<TokenResponse> {
    const scopes = scope.split(" ");

    // Determine which tenants to include in the token
    // If tenant scope is provided, include ONLY that tenant (strict isolation)
    // Otherwise, include all tenants (for IDP dashboard)
    let _tokenTenants: Array<{ id: string; slug: string; name: string }> = [];
    let orgId: string | undefined;
    let tenantSubdomain: string | undefined;

    if (tenantScope) {
      // SEPARATE TOKEN PER TENANT: Only include the selected tenant
      const selectedTenant = user.memberships.find(
        (m) =>
          m.tenant.id === tenantScope.tenantId ||
          m.tenant.slug === tenantScope.tenantSubdomain,
      );

      if (!selectedTenant) {
        throw new UnauthorizedException(
          "User does not have access to this tenant",
        );
      }

      _tokenTenants = [
        {
          id: selectedTenant.tenant.id,
          slug: selectedTenant.tenant.slug,
          name: selectedTenant.tenant.name,
        },
      ];
      orgId = selectedTenant.tenant.id;
      tenantSubdomain = selectedTenant.tenant.slug;
    } else {
      // No tenant scope = include all tenants (for IDP dashboard)
      _tokenTenants = user.memberships.map((m) => ({
        id: m.tenant.id,
        slug: m.tenant.slug,
        name: m.tenant.name,
      }));
    }

    // ==========================================================================
    // FETCH ROLES (only when scoped to a single tenant)
    // Note: Application roles no longer have permissions - just name/slug/description
    // Permission checking happens in the consuming application layer
    // ==========================================================================
    let membershipWithRoles: {
      membershipTenantRoles: {
        tenantRole: { slug: string; permissions: string[] };
      }[];
      membershipRoles: {
        role: {
          slug: string;
        };
      }[];
    } | null = null;

    if (tenantScope) {
      // Fetch membership with all role data
      membershipWithRoles = await this.prisma.membership.findFirst({
        where: {
          userId: user.id,
          tenantId: tenantScope.tenantId,
          status: "ACTIVE",
        },
        include: {
          // Tenant-level roles (from TenantRole) - these still have permissions
          membershipTenantRoles: {
            include: {
              tenantRole: true,
            },
          },
          // Application-specific roles (from Role, filtered by this app)
          // No permissions included - roles are now just identifiers
          membershipRoles: {
            where: {
              role: {
                applicationId: application.id,
              },
            },
            include: {
              role: true,
            },
          },
        },
      });
    }

    // Access Token payload (OIDC/JWT standard claims)
    // NOTE: tenants are NOT included in the JWT to keep it lean.
    // Use the GET /oauth/tenants endpoint to fetch tenant details.
    // NOTE: client_id is NOT included - it's already in the `aud` (audience) claim
    const accessTokenPayload: Record<string, unknown> = {
      scope,
      // Explicit tenant claims for easy validation by relying parties
      // (only present when token is scoped to a single tenant)
      ...(orgId && { tenant_id: orgId }),
      ...(tenantSubdomain && { tenant_subdomain: tenantSubdomain }),
    };

    if (scopes.includes("email")) {
      accessTokenPayload.email = user.email;
    }

    if (scopes.includes("profile")) {
      // OIDC standard claims: given_name and family_name
      accessTokenPayload.given_name = user.givenName;
      accessTokenPayload.family_name = user.familyName;
    }

    // ==========================================================================
    // INCLUDE ROLES IN JWT (when scoped to a single tenant)
    // Note: App roles no longer include permissions - permission checking
    // happens in the consuming application layer based on role slugs
    // ==========================================================================
    if (membershipWithRoles && tenantScope) {
      // Extract tenant roles and permissions (TenantRole still has permissions)
      const tenantRoles = membershipWithRoles.membershipTenantRoles.map(
        (mtr) => mtr.tenantRole.slug,
      );
      const tenantPermissions = [
        ...new Set(
          membershipWithRoles.membershipTenantRoles.flatMap(
            (mtr) => mtr.tenantRole.permissions,
          ),
        ),
      ];

      // Extract app-specific roles (just slugs, no permissions)
      const appRoles = membershipWithRoles.membershipRoles.map(
        (mr) => mr.role.slug,
      );

      // Check if user has owner role via TenantRole
      const hasOwnerRole = tenantRoles.includes("owner");
      if (hasOwnerRole) {
        // Owners implicitly have all tenant permissions
        accessTokenPayload.tenant_roles = tenantRoles;
        accessTokenPayload.tenant_permissions = [
          ...new Set([...OWNER_PERMISSIONS, ...tenantPermissions]),
        ];
      } else {
        accessTokenPayload.tenant_roles = tenantRoles;
        accessTokenPayload.tenant_permissions = tenantPermissions;
      }

      // Add app roles (only if non-empty to keep JWT lean)
      // Note: No app_permissions - consuming app handles permission logic based on roles
      if (appRoles.length > 0) {
        accessTokenPayload.app_roles = appRoles;
      }

      // Optionally include license for this app (mode-aware)
      if (tenantScope) {
        try {
          let licenseInfo: {
            type: string;
            name: string;
            features: string[];
          } | null = null;

          if (
            application.licensingMode === "FREE" ||
            application.licensingMode === "TENANT_WIDE"
          ) {
            // For FREE/TENANT_WIDE: Get tenant's subscription (not user's assignment)
            const subscription = await this.prisma.appSubscription.findFirst({
              where: {
                tenantId: tenantScope.tenantId,
                applicationId: application.id,
                status: { in: ["ACTIVE", "TRIALING"] },
              },
              include: { licenseType: true },
              orderBy: { licenseType: { displayOrder: "desc" } }, // Best tier first
            });

            if (subscription) {
              const features = Object.entries(
                subscription.licenseType.features as
                  | Record<string, boolean>
                  | Record<string, never>,
              )
                .filter(([_, enabled]) => enabled === true)
                .map(([key]) => key);

              licenseInfo = {
                type: subscription.licenseType.slug,
                name: subscription.licenseType.name,
                features,
              };
            }
          } else if (application.licensingMode === "PER_SEAT") {
            // For PER_SEAT: Get user's license assignment
            const licenseAssignment =
              await this.prisma.licenseAssignment.findUnique({
                where: {
                  tenantId_userId_applicationId: {
                    tenantId: tenantScope.tenantId,
                    userId: user.id,
                    applicationId: application.id,
                  },
                },
                include: {
                  subscription: {
                    include: { licenseType: true },
                  },
                },
              });

            if (
              licenseAssignment &&
              ["ACTIVE", "TRIALING"].includes(
                licenseAssignment.subscription.status,
              )
            ) {
              const features = Object.entries(
                licenseAssignment.subscription.licenseType.features as
                  | Record<string, boolean>
                  | Record<string, never>,
              )
                .filter(([_, enabled]) => enabled === true)
                .map(([key]) => key);

              licenseInfo = {
                type: licenseAssignment.subscription.licenseType.slug,
                name: licenseAssignment.subscription.licenseType.name,
                features,
              };
            }
          }

          if (licenseInfo) {
            accessTokenPayload.license = licenseInfo;
          }
        } catch (error) {
          // Don't fail token generation if license lookup fails
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          this.logger.warn(
            `Failed to fetch license info for JWT: ${errorMessage}`,
          );
        }
      }
    }

    // Sign access token
    const accessToken = await this.keyService.signJwt(accessTokenPayload, {
      subject: user.id,
      audience: application.clientId,
      issuer: this.issuer,
      expiresIn: application.accessTokenTtl,
    });

    // ==========================================================================
    // TOKEN GHOSTING: Create session record and generate signed refresh JWT
    // The refresh token is a JWT with `sid` claim pointing to the session record.
    // On refresh, we verify JWT signature first (no DB hit if invalid), then
    // check session validity in DB (revoked = false, not expired).
    // ==========================================================================
    const refreshTokenRecord = await this.prisma.refreshToken.create({
      data: {
        scope,
        expiresAt: new Date(Date.now() + application.refreshTokenTtl * 1000),
        userId: user.id,
        applicationId: application.id,
        revoked: false,
        // Preserve tenant scope for token refresh
        tenantId: tenantScope?.tenantId,
        tenantSubdomain: tenantScope?.tenantSubdomain,
      },
    });

    // Generate signed refresh JWT with session ID (sid) claim
    // This enables Token Ghosting: JWT is self-contained but points to revocable session
    const refreshTokenJwt = await this.generateRefreshTokenJwt({
      sid: refreshTokenRecord.id, // Session ID - the key to Token Ghosting
      sub: user.id,
      aud: application.clientId,
      scope,
      tenantId: tenantScope?.tenantId,
      tenantSubdomain: tenantScope?.tenantSubdomain,
      expiresIn: application.refreshTokenTtl,
    });

    const response: TokenResponse = {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: application.accessTokenTtl,
      refresh_token: refreshTokenJwt,
      scope,
    };

    // Generate ID Token if openid scope is requested
    if (scopes.includes("openid")) {
      // OIDC standard claims
      const idTokenPayload: Record<string, unknown> = {
        email: user.email,
        given_name: user.givenName,
        family_name: user.familyName,
      };

      if (nonce) {
        idTokenPayload.nonce = nonce;
      }

      response.id_token = await this.keyService.signJwt(idTokenPayload, {
        subject: user.id,
        audience: application.clientId,
        issuer: this.issuer,
        expiresIn: application.accessTokenTtl,
      });
    }

    return response;
  }

  // ===========================================================================
  // PKCE VERIFICATION
  // ===========================================================================

  /**
   * Verify PKCE code_verifier against stored code_challenge
   */
  /**
   * Verify PKCE code_verifier against stored code_challenge
   * Only S256 is supported (OAuth 2.1 compliant)
   * plain method is deprecated due to security concerns
   */
  private verifyPkce(
    codeVerifier: string,
    codeChallenge: string,
    method: CodeChallengeMethod,
  ): boolean {
    // Only S256 is supported (OAuth 2.1)
    // plain method is deprecated due to security concerns
    if (method !== CodeChallengeMethod.S256) {
      return false; // Reject any non-S256 method
    }

    // S256: BASE64URL(SHA256(code_verifier)) === code_challenge
    const hash = crypto.createHash("sha256").update(codeVerifier).digest();
    const computed = this.base64UrlEncode(hash);
    return computed === codeChallenge;
  }

  /**
   * Base64 URL encode (no padding)
   */
  private base64UrlEncode(buffer: Buffer): string {
    return buffer
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  }

  // ===========================================================================
  // TOKEN GHOSTING: Refresh Token JWT Generation
  // ===========================================================================

  /**
   * Generate a signed refresh token JWT with session ID (sid) claim.
   * This is the core of Token Ghosting:
   * - JWT is self-contained and can be verified without DB lookup
   * - `sid` claim points to a session record that can be revoked
   * - On refresh, verify signature first, then check session validity
   */
  private async generateRefreshTokenJwt(params: {
    sid: string; // Session ID (primary key of refresh_tokens table)
    sub: string; // User ID
    aud: string; // Client ID (audience)
    scope: string; // OAuth scopes
    tenantId?: string; // Optional tenant scope
    tenantSubdomain?: string;
    expiresIn: number; // Expiration in seconds
  }): Promise<string> {
    const refreshPayload: Record<string, unknown> = {
      sid: params.sid, // Session ID - the key to Token Ghosting
      scope: params.scope,
      token_type: "refresh", // Distinguish from access tokens
    };

    // Include tenant scope if present (for tenant-isolated refresh)
    if (params.tenantId) {
      refreshPayload.tenant_id = params.tenantId;
    }
    if (params.tenantSubdomain) {
      refreshPayload.tenant_subdomain = params.tenantSubdomain;
    }

    return this.keyService.signJwt(refreshPayload, {
      subject: params.sub,
      audience: params.aud,
      issuer: this.issuer,
      expiresIn: params.expiresIn,
    });
  }

  /**
   * Verify a refresh token JWT and extract the session ID.
   * This performs cryptographic verification WITHOUT a DB lookup.
   * Returns the payload if valid, throws if invalid/expired/forged.
   */
  async verifyRefreshTokenJwt(token: string): Promise<{
    sid: string;
    sub: string;
    aud: string;
    scope: string;
    tenantId?: string;
    tenantSubdomain?: string;
  }> {
    const payload = await this.keyService.verifyJwt(token, this.issuer);

    // Validate this is actually a refresh token
    if (payload.token_type !== "refresh") {
      throw new UnauthorizedException(
        "Invalid token type - expected refresh token",
      );
    }

    if (!payload.sid || typeof payload.sid !== "string") {
      throw new UnauthorizedException(
        "Invalid refresh token - missing session ID",
      );
    }

    return {
      sid: payload.sid as string,
      sub: payload.sub as string,
      aud: (Array.isArray(payload.aud)
        ? payload.aud[0]
        : payload.aud) as string,
      scope: (payload.scope as string) || "openid profile email",
      tenantId: payload.tenant_id as string | undefined,
      tenantSubdomain: payload.tenant_subdomain as string | undefined,
    };
  }

  // ===========================================================================
  // TOKEN GHOSTING: Session Management
  // ===========================================================================

  /**
   * Revoke a specific session by ID (Token Ghosting logout)
   * This is called when user logs out of a specific session.
   */
  async revokeSession(
    sessionId: string,
  ): Promise<{ success: boolean; message: string }> {
    const result = await this.prisma.refreshToken.updateMany({
      where: {
        id: sessionId,
        revoked: false,
      },
      data: {
        revoked: true,
        revokedAt: new Date(),
      },
    });

    if (result.count === 0) {
      return {
        success: false,
        message: "Session not found or already revoked",
      };
    }

    return { success: true, message: "Session revoked successfully" };
  }

  /**
   * Revoke ALL sessions for a user (Token Ghosting logout-all)
   * This is called when user clicks "logout everywhere".
   */
  async revokeAllUserSessions(
    userId: string,
    applicationId?: string,
  ): Promise<{ success: boolean; count: number }> {
    const where: { userId: string; revoked: boolean; applicationId?: string } =
      {
        userId,
        revoked: false,
      };

    // Optionally scope to a specific application
    if (applicationId) {
      where.applicationId = applicationId;
    }

    const result = await this.prisma.refreshToken.updateMany({
      where,
      data: {
        revoked: true,
        revokedAt: new Date(),
      },
    });

    return { success: true, count: result.count };
  }

  /**
   * Get active sessions for a user (for "manage sessions" UI)
   */
  async getUserSessions(
    userId: string,
    applicationId?: string,
  ): Promise<
    Array<{
      id: string;
      createdAt: Date;
      expiresAt: Date;
      userAgent: string | null;
      ipAddress: string | null;
      tenantSubdomain: string | null;
    }>
  > {
    const where: {
      userId: string;
      revoked: boolean;
      expiresAt: { gt: Date };
      applicationId?: string;
    } = {
      userId,
      revoked: false,
      expiresAt: { gt: new Date() },
    };

    if (applicationId) {
      where.applicationId = applicationId;
    }

    return this.prisma.refreshToken.findMany({
      where,
      select: {
        id: true,
        createdAt: true,
        expiresAt: true,
        userAgent: true,
        ipAddress: true,
        tenantSubdomain: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  // ===========================================================================
  // TOKEN REVOCATION
  // ===========================================================================

  /**
   * Revoke all tokens for a user/application pair
   */
  private async revokeUserAppTokens(userId: string, applicationId: string) {
    await this.prisma.refreshToken.updateMany({
      where: {
        userId,
        applicationId,
        revoked: false,
      },
      data: {
        revoked: true,
        revokedAt: new Date(),
      },
    });
  }

  /**
   * Revoke a refresh token (Token Ghosting JWT only)
   */
  async revokeToken(token: string, tokenTypeHint?: string): Promise<void> {
    // Only refresh tokens can be revoked (access tokens are stateless JWTs)
    if (tokenTypeHint && tokenTypeHint !== "refresh_token") {
      return; // Access tokens cannot be revoked
    }

    try {
      const { sid } = await this.verifyRefreshTokenJwt(token);
      await this.prisma.refreshToken.updateMany({
        where: { id: sid, revoked: false },
        data: { revoked: true, revokedAt: new Date() },
      });
    } catch {
      // Invalid JWT - nothing to revoke
      this.logger.debug("Token revocation skipped - not a valid JWT");
    }
  }

  // ===========================================================================
  // JWT VALIDATION
  // ===========================================================================

  /**
   * Validate JWT token - verifies RSA signature
   * Returns user info if valid, null if invalid/forged
   */
  async validateJwt(
    token: string,
  ): Promise<{
    userId: string;
    email: string | null;
    clientId?: string;
    scope?: string;
  } | null> {
    try {
      const payload = await this.keyService.verifyJwt(token, this.issuer);
      if (!payload) {
        return null;
      }

      return {
        userId: payload.sub as string,
        email: (payload.email as string) || null,
        clientId: payload.client_id as string,
        scope: payload.scope as string,
      };
    } catch {
      return null; // Invalid, expired, or forged token
    }
  }

  /**
   * Validate OAuth access token (RS256) - async version with proper signature verification
   */
  async validateAccessToken(
    token: string,
  ): Promise<{
    userId: string;
    email: string | null;
    clientId?: string;
    scope?: string;
  } | null> {
    try {
      const payload = await this.keyService.verifyJwt(token, this.issuer);
      return {
        userId: payload.sub as string,
        email: (payload.email as string) || null,
        clientId: payload.client_id as string,
        scope: payload.scope as string,
      };
    } catch {
      return null;
    }
  }

  // ===========================================================================
  // TOKEN INTROSPECTION (RFC 7662)
  // ===========================================================================

  /**
   * Introspect a token - validate and return token metadata
   * Used by resource servers to validate tokens
   */
  async introspect(token: string, _tokenTypeHint?: string) {
    // Try to decode as JWT first
    try {
      const decoded = await this.keyService.verifyJwt(token, this.issuer);

      if (!decoded) {
        return { active: false };
      }

      // Get user with their memberships and roles
      const user = await this.prisma.user.findUnique({
        where: { id: decoded.sub as string },
        include: {
          memberships: {
            where: { status: "ACTIVE" },
            include: {
              tenant: true,
              membershipRoles: {
                include: {
                  role: true,
                },
              },
            },
          },
        },
      });

      if (!user) {
        return { active: false };
      }

      // Collect roles by tenant (no permissions - roles are just identifiers now)
      const rolesByTenant: Record<string, string[]> = {};
      const tenants: Array<{ id: string; slug: string; name: string }> = [];

      for (const membership of user.memberships) {
        const roles = membership.membershipRoles.map((mr) => mr.role.slug);
        rolesByTenant[membership.tenant.id] = [...new Set(roles)];
        tenants.push({
          id: membership.tenant.id,
          slug: membership.tenant.slug,
          name: membership.tenant.name,
        });
      }

      return {
        active: true,
        sub: user.id,
        email: user.email,
        // OIDC standard claims
        given_name: user.givenName,
        family_name: user.familyName,
        iat: decoded.iat,
        exp: decoded.exp,
        aud: decoded.aud,
        iss: decoded.iss,
        scope: decoded.scope,
        tenants,
        rolesByTenant,
        isAnonymous: user.isAnonymous,
        isMachine: user.isMachine,
      };
    } catch {
      // Token is invalid or expired
      return { active: false };
    }
  }

  /**
   * Get user info (OIDC UserInfo endpoint)
   */
  async getUserInfo(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        memberships: {
          where: { status: "ACTIVE" },
          include: {
            tenant: {
              select: { id: true, name: true, slug: true },
            },
            membershipRoles: {
              include: {
                role: {
                  select: { id: true, name: true, slug: true },
                },
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    return {
      sub: user.id,
      email: user.email,
      email_verified: true, // TODO: implement email verification
      name:
        [user.givenName, user.familyName].filter(Boolean).join(" ") ||
        undefined,
      given_name: user.givenName,
      family_name: user.familyName,
      phone_number: user.phone,
      updated_at: Math.floor(user.updatedAt.getTime() / 1000),
      tenants: user.memberships.map((m) => ({
        id: m.tenant.id,
        name: m.tenant.name,
        slug: m.tenant.slug,
        roles: m.membershipRoles.map((mr) => ({
          id: mr.role.id,
          name: mr.role.name,
          slug: mr.role.slug,
        })),
      })),
    };
  }

  // ===========================================================================
  // APPLICATION MANAGEMENT
  // ===========================================================================

  /**
   * Get user's tenants (for separate /tenants endpoint)
   * Returns only tenant_id and tenant_name for each tenant the user belongs to
   */
  async getTenants(
    userId: string,
  ): Promise<{ tenants: Array<{ tenant_id: string; tenant_name: string }> }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        memberships: {
          where: { status: "ACTIVE" },
          include: {
            tenant: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    return {
      tenants: user.memberships.map((m) => ({
        tenant_id: m.tenant.id,
        tenant_name: m.tenant.name,
      })),
    };
  }

  /**
   * Get application by client_id (for validation)
   */
  async getApplicationByClientId(clientId: string) {
    return this.prisma.application.findUnique({
      where: { clientId },
    });
  }

  /**
   * Validate redirect_uri against application's allowed redirect URIs
   * Supports:
   * - Exact matches
   * - Wildcard patterns (e.g., http://*.localhost:3000/callback)
   * - Tenant placeholder (e.g., https://{tenant}.example.com/callback) with database validation
   *
   * @returns Validation result with reason if validation fails
   */
  async validateRedirectUri(
    clientId: string,
    redirectUri: string,
  ): Promise<{ valid: boolean; reason?: string }> {
    console.log(`[validateRedirectUri] clientId: ${clientId}`);
    console.log(`[validateRedirectUri] redirectUri: ${redirectUri}`);

    const app = await this.prisma.application.findUnique({
      where: { clientId },
      select: { redirectUris: true },
    });

    if (!app || !app.redirectUris || app.redirectUris.length === 0) {
      console.log(
        `[validateRedirectUri] App not found or no redirect URIs. App found: ${!!app}, redirectUris: ${app?.redirectUris}`,
      );
      return {
        valid: false,
        reason: "Application not found or no redirect URIs configured",
      };
    }

    console.log(
      `[validateRedirectUri] Registered redirect URIs: ${JSON.stringify(app.redirectUris)}`,
    );

    // Use the centralized matchesRedirectUri method which supports wildcards and {tenant} placeholder
    const result = await this.matchesRedirectUri(redirectUri, app.redirectUris);
    return result;
  }

  /**
   * Get application for branding (instance branding used as fallback)
   */
  async getApplicationForBranding(clientId: string) {
    return this.prisma.application.findUnique({
      where: { clientId },
      select: {
        id: true,
        clientId: true,
        name: true,
        isActive: true,
        brandingName: true,
        brandingLogoUrl: true,
        brandingIconUrl: true,
        brandingPrimaryColor: true,
        brandingBackgroundColor: true,
        brandingAccentColor: true,
        brandingSupportUrl: true,
        brandingPrivacyUrl: true,
        brandingTermsUrl: true,
        initiateLoginUri: true,
      },
    });
  }

  /**
   * Generate client secret for any application
   *
   * This enables the unified app model where a single application can support:
   * - User authentication (authorization_code flow with PKCE) for frontends
   * - Machine-to-machine auth (client_credentials flow) for backends
   *
   * Having a client secret is optional - apps without one can still do user auth.
   * Apps WITH a secret can additionally use the server SDK for backend operations.
   */
  async generateClientSecret(applicationId: string): Promise<string> {
    const app = await this.prisma.application.findUnique({
      where: { id: applicationId },
    });

    if (!app) {
      throw new NotFoundException("Application not found");
    }

    const secret = crypto.randomBytes(32).toString("hex");
    const hashedSecret = await bcrypt.hash(secret, 12);

    await this.prisma.application.update({
      where: { id: applicationId },
      data: { clientSecret: hashedSecret },
    });

    return secret; // Return unhashed secret to show once
  }

  /**
   * Revoke (delete) the client secret for an application
   * This disables M2M authentication but user auth still works
   */
  async revokeClientSecret(applicationId: string): Promise<void> {
    const app = await this.prisma.application.findUnique({
      where: { id: applicationId },
    });

    if (!app) {
      throw new NotFoundException("Application not found");
    }

    await this.prisma.application.update({
      where: { id: applicationId },
      data: { clientSecret: null },
    });
  }
}
