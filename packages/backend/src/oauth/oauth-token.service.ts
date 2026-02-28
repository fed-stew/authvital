import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { KeyService } from './key.service';
import { OAuthSessionService } from './oauth-session.service';
import { OAuthLicenseService } from './oauth-license.service';
import { OWNER_PERMISSIONS } from '../authorization';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import { CodeChallengeMethod, Prisma } from '@prisma/client';

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

interface TenantScope {
  tenantId: string;
  tenantSubdomain: string;
}

interface UserWithMemberships {
  id: string;
  email: string | null;
  givenName: string | null;
  familyName: string | null;
  memberships: { tenant: { id: string; slug: string; name: string } }[];
}

interface ApplicationConfig {
  id: string;
  clientId: string;
  accessTokenTtl: number;
  refreshTokenTtl: number;
  licensingMode?: string | null;
  [key: string]: unknown;
}

interface MembershipRoleData {
  membershipTenantRoles: {
    tenantRole: { slug: string; permissions: string[] };
  }[];
  membershipRoles: {
    role: { slug: string };
  }[];
}

/**
 * Handles OAuth token generation and grant type processing.
 *
 * Supports:
 * - authorization_code grant (with PKCE)
 * - refresh_token grant (with Token Ghosting rotation)
 * - client_credentials grant (M2M)
 */
@Injectable()
export class OAuthTokenService {
  private readonly issuer: string;
  private readonly logger = new Logger(OAuthTokenService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly keyService: KeyService,
    private readonly configService: ConfigService,
    private readonly sessionService: OAuthSessionService,
    private readonly licenseService: OAuthLicenseService,
  ) {
    this.issuer = this.configService.getOrThrow<string>('BASE_URL');
  }

  /**
   * Process token request based on grant type
   */
  async token(params: TokenParams): Promise<TokenResponse> {
    switch (params.grantType) {
      case 'authorization_code':
        return this.handleAuthorizationCodeGrant(params);
      case 'refresh_token':
        return this.handleRefreshTokenGrant(params);
      case 'client_credentials':
        return this.handleClientCredentialsGrant(params);
      default:
        throw new BadRequestException('Unsupported grant_type');
    }
  }

  /**
   * Handle authorization_code grant type
   */
  private async handleAuthorizationCodeGrant(
    params: TokenParams,
  ): Promise<TokenResponse> {
    if (!params.code) {
      throw new BadRequestException('Missing code parameter');
    }

    this.logger.debug(
      `[OAuth Token] Exchanging code: ${params.code.substring(0, 8)}...`,
    );

    // Find authorization code
    const authCode = await this.prisma.authorizationCode.findUnique({
      where: { code: params.code },
      include: {
        user: {
          include: {
            memberships: {
              where: { status: 'ACTIVE' },
              include: { tenant: true },
            },
          },
        },
        application: true,
      },
    });

    if (!authCode) {
      this.logger.debug('[OAuth Token] Code not found in database');
      throw new UnauthorizedException(
        'Invalid authorization code - code not found or already deleted',
      );
    }

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
      await this.sessionService.revokeUserAppTokens(
        authCode.userId,
        authCode.applicationId,
      );
      throw new UnauthorizedException('Authorization code already used');
    }

    // Verify client_id matches
    if (authCode.application.clientId !== params.clientId) {
      throw new UnauthorizedException('Client ID mismatch');
    }

    // Verify redirect_uri matches exactly
    if (params.redirectUri && params.redirectUri !== authCode.redirectUri) {
      throw new UnauthorizedException(
        `Redirect URI mismatch: got "${params.redirectUri}" but expected "${authCode.redirectUri}"`,
      );
    }

    // If application has a client secret configured, it MUST be provided
    if (authCode.application.clientSecret) {
      if (!params.clientSecret) {
        throw new UnauthorizedException(
          'Client secret is required for this application',
        );
      }
      const secretValid = await bcrypt.compare(
        params.clientSecret,
        authCode.application.clientSecret,
      );
      if (!secretValid) {
        throw new UnauthorizedException('Invalid client secret');
      }
    }

    // Verify PKCE code_verifier
    if (authCode.codeChallenge) {
      if (!params.codeVerifier) {
        throw new UnauthorizedException('Missing code_verifier for PKCE');
      }
      const valid = this.verifyPkce(
        params.codeVerifier,
        authCode.codeChallenge,
        authCode.codeChallengeMethod || CodeChallengeMethod.S256,
      );
      if (!valid) {
        throw new UnauthorizedException(
          'Invalid code_verifier - PKCE verification failed',
        );
      }
    }

    // Mark code as used
    await this.prisma.authorizationCode.update({
      where: { id: authCode.id },
      data: { usedAt: new Date() },
    });

    // Generate tokens with optional tenant scope
    return this.generateTokens(
      authCode.user,
      authCode.application,
      authCode.scope || 'openid profile email',
      authCode.nonce,
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
      throw new BadRequestException('Missing refresh_token parameter');
    }

    let jwtPayload: {
      sid: string;
      sub: string;
      aud: string;
      scope: string;
      tenantId?: string;
      tenantSubdomain?: string;
    };

    // Step 1: Verify JWT signature
    try {
      jwtPayload = await this.sessionService.verifyRefreshTokenJwt(
        params.refreshToken,
      );

      // Validate audience (client_id) matches
      if (jwtPayload.aud !== params.clientId) {
        throw new UnauthorizedException('Client ID mismatch');
      }

      this.logger.debug(
        `[Token Ghosting] Verified refresh JWT, session ID: ${jwtPayload.sid}`,
      );
    } catch (error) {
      this.logger.debug(`[Token Ghosting] JWT verification failed: ${error}`);
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Step 2: Lookup session in database
    const refreshTokenInclude = {
      user: {
        include: {
          memberships: {
            where: { status: 'ACTIVE' as const },
            include: { tenant: true },
          },
        },
      },
      application: true,
    } satisfies Prisma.RefreshTokenInclude;

    const refreshToken = await this.prisma.refreshToken.findUnique({
      where: { id: jwtPayload.sid },
      include: refreshTokenInclude,
    });

    if (!refreshToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Step 3: Validate session state (Token Ghosting "ghost check")
    if (refreshToken.revoked || refreshToken.revokedAt) {
      this.logger.warn(
        `[Token Ghosting] Session ${refreshToken.id} has been revoked`,
      );
      throw new UnauthorizedException('Session has been revoked');
    }

    if (refreshToken.expiresAt < new Date()) {
      throw new UnauthorizedException('Session expired');
    }

    // Step 4: Rotate refresh token (revoke old, generate new)
    await this.prisma.refreshToken.update({
      where: { id: refreshToken.id },
      data: {
        revoked: true,
        revokedAt: new Date(),
      },
    });

    // Maintain tenant scope when refreshing tokens
    return this.generateTokens(
      refreshToken.user,
      refreshToken.application,
      refreshToken.scope || 'openid profile email',
      null, // nonce not needed for refresh token grant
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
        'client_id and client_secret are required for client_credentials grant',
      );
    }

    // Find application by client_id
    const app = await this.prisma.application.findUnique({
      where: { clientId: params.clientId },
    });

    if (!app || !app.isActive) {
      throw new UnauthorizedException('Invalid client_id');
    }

    if (!app.clientSecret) {
      throw new UnauthorizedException(
        'Application does not have a client secret configured. ' +
          'Generate a client secret in the admin panel to enable M2M authentication.',
      );
    }

    const secretValid = await bcrypt.compare(
      params.clientSecret,
      app.clientSecret,
    );
    if (!secretValid) {
      throw new UnauthorizedException('Invalid client_secret');
    }

    // Generate M2M access token (no user, no refresh token)
    return this.generateM2MTokens(app, params.scope || 'system:admin');
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
    const accessTokenPayload: Record<string, unknown> = {
      scope,
      client_id: application.clientId,
      token_type: 'm2m', // Indicate this is a machine token
    };

    const accessToken = await this.keyService.signJwt(accessTokenPayload, {
      subject: `app:${application.clientId}`,
      audience: application.clientId,
      issuer: this.issuer,
      expiresIn: application.accessTokenTtl,
    });

    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: application.accessTokenTtl,
      scope,
      // No refresh_token for M2M - clients should request new tokens when needed
    };
  }

  /**
   * Generate access token, refresh token, and optionally ID token
   *
   * @param tenantScope - Optional tenant scope. If provided, token ONLY includes this tenant.
   *                      This enables "separate token per tenant" pattern for strict isolation.
   */
  async generateTokens(
    user: UserWithMemberships,
    application: ApplicationConfig,
    scope: string,
    nonce?: string | null,
    tenantScope?: TenantScope | null,
  ): Promise<TokenResponse> {
    const scopes = scope.split(' ');

    // Determine which tenants to include in the token
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
          'User does not have access to this tenant',
        );
      }

      orgId = selectedTenant.tenant.id;
      tenantSubdomain = selectedTenant.tenant.slug;
    }

    // Fetch roles and permissions when scoped to a single tenant
    const roleData = tenantScope
      ? await this.fetchMembershipRoles(user.id, tenantScope.tenantId, application.id)
      : null;

    // Build access token payload
    const accessTokenPayload = await this.buildAccessTokenPayload({
      user,
      application,
      scopes,
      orgId,
      tenantSubdomain,
      tenantScope,
      roleData,
      scope,
    });

    // Sign access token
    const accessToken = await this.keyService.signJwt(accessTokenPayload, {
      subject: user.id,
      audience: application.clientId,
      issuer: this.issuer,
      expiresIn: application.accessTokenTtl,
    });

    // Create refresh token session (Token Ghosting)
    const refreshTokenRecord = await this.prisma.refreshToken.create({
      data: {
        scope,
        expiresAt: new Date(Date.now() + application.refreshTokenTtl * 1000),
        userId: user.id,
        applicationId: application.id,
        revoked: false,
        tenantId: tenantScope?.tenantId,
        tenantSubdomain: tenantScope?.tenantSubdomain,
      },
    });

    // Generate signed refresh JWT with session ID
    const refreshTokenJwt = await this.sessionService.generateRefreshTokenJwt({
      sid: refreshTokenRecord.id,
      sub: user.id,
      aud: application.clientId,
      scope,
      tenantId: tenantScope?.tenantId,
      tenantSubdomain: tenantScope?.tenantSubdomain,
      expiresIn: application.refreshTokenTtl,
    });

    const response: TokenResponse = {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: application.accessTokenTtl,
      refresh_token: refreshTokenJwt,
      scope,
    };

    // Generate ID Token if openid scope is requested
    if (scopes.includes('openid')) {
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

  /**
   * Fetch membership roles for a user in a specific tenant
   */
  private async fetchMembershipRoles(
    userId: string,
    tenantId: string,
    applicationId: string,
  ) {
    return this.prisma.membership.findFirst({
      where: {
        userId,
        tenantId,
        status: 'ACTIVE',
      },
      include: {
        membershipTenantRoles: {
          include: {
            tenantRole: true,
          },
        },
        membershipRoles: {
          where: {
            role: {
              applicationId,
            },
          },
          include: {
            role: true,
          },
        },
      },
    });
  }

  /**
   * Build access token payload with roles, permissions, and license info
   */
  private async buildAccessTokenPayload(params: {
    user: UserWithMemberships;
    application: ApplicationConfig;
    scopes: string[];
    orgId?: string;
    tenantSubdomain?: string;
    tenantScope?: TenantScope | null;
    roleData: MembershipRoleData | null;
    scope: string;
  }): Promise<Record<string, unknown>> {
    const {
      user,
      application,
      scopes,
      orgId,
      tenantSubdomain,
      tenantScope,
      roleData,
      scope,
    } = params;

    const accessTokenPayload: Record<string, unknown> = {
      scope,
      ...(orgId && { tenant_id: orgId }),
      ...(tenantSubdomain && { tenant_subdomain: tenantSubdomain }),
    };

    if (scopes.includes('email')) {
      accessTokenPayload.email = user.email;
    }

    if (scopes.includes('profile')) {
      accessTokenPayload.given_name = user.givenName;
      accessTokenPayload.family_name = user.familyName;
    }

    // Add roles and permissions when tenant-scoped
    if (roleData && tenantScope) {
      const tenantRoles = roleData.membershipTenantRoles.map(
        (mtr) => mtr.tenantRole.slug,
      );
      const tenantPermissions = [
        ...new Set(
          roleData.membershipTenantRoles.flatMap(
            (mtr) => mtr.tenantRole.permissions,
          ),
        ),
      ];

      const appRoles = roleData.membershipRoles.map((mr) => mr.role.slug);

      // Check if user has owner role
      const hasOwnerRole = tenantRoles.includes('owner');
      if (hasOwnerRole) {
        accessTokenPayload.tenant_roles = tenantRoles;
        accessTokenPayload.tenant_permissions = [
          ...new Set([...OWNER_PERMISSIONS, ...tenantPermissions]),
        ];
      } else {
        accessTokenPayload.tenant_roles = tenantRoles;
        accessTokenPayload.tenant_permissions = tenantPermissions;
      }

      if (appRoles.length > 0) {
        accessTokenPayload.app_roles = appRoles;
      }

      // Add license info if applicable
      const licenseInfo = await this.licenseService.fetchLicenseInfo(
        user.id,
        tenantScope.tenantId,
        application,
      );
      if (licenseInfo) {
        accessTokenPayload.license = licenseInfo;
      }
    }

    return accessTokenPayload;
  }

  /**
   * Verify PKCE code_verifier against stored code_challenge
   * Only S256 is supported (OAuth 2.1 compliant)
   */
  private verifyPkce(
    codeVerifier: string,
    codeChallenge: string,
    method: CodeChallengeMethod,
  ): boolean {
    if (method !== CodeChallengeMethod.S256) {
      return false; // Reject any non-S256 method
    }

    const hash = crypto.createHash('sha256').update(codeVerifier).digest();
    const computed = this.base64UrlEncode(hash);
    return computed === codeChallenge;
  }

  /**
   * Base64 URL encode (no padding)
   */
  private base64UrlEncode(buffer: Buffer): string {
    return buffer
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }
}
