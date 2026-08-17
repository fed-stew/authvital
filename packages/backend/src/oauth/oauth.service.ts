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
import { OAuthTokenService, TokenParams, TokenResponse } from './oauth-token.service';
import { OAuthIntrospectionService } from './oauth-introspection.service';
import { RedirectUriValidatorService } from './redirect-uri-validator.service';
import { MfaService } from '../auth/mfa/mfa.service';
import { MfaEnrollmentRequiredException } from '../auth/mfa/mfa-enrollment-required.exception';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS, AUDIT_TARGET_TYPES } from '../audit/audit-actions';
import * as crypto from 'crypto';
import {
  generateAuthorizationCode,
  hashAuthorizationCode,
} from './utils/hash-code';
import { ApplicationType, CodeChallengeMethod } from '@prisma/client';

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

// Re-export types from sub-services
export { TokenParams, TokenResponse } from './oauth-token.service';

/**
 * Main OAuth service coordinating authorization, token management,
 * and application operations.
 *
 * This service delegates to specialized sub-services:
 * - OAuthSessionService: Token Ghosting session management
 * - OAuthTokenService: Token generation and grant handling
 * - OAuthIntrospectionService: Token validation and introspection
 * - RedirectUriValidatorService: Redirect URI validation
 */
@Injectable()
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name);
  private readonly issuer: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly keyService: KeyService,
    private readonly configService: ConfigService,
    private readonly sessionService: OAuthSessionService,
    private readonly tokenService: OAuthTokenService,
    private readonly introspectionService: OAuthIntrospectionService,
    private readonly redirectUriValidator: RedirectUriValidatorService,
    private readonly mfaService: MfaService,
    private readonly auditService: AuditService,
  ) {
    this.issuer = this.configService.getOrThrow<string>('BASE_URL');
  }

  // ===========================================================================
  // AUTHORIZATION ENDPOINT
  // ===========================================================================

  /**
   * Validate authorize request and generate authorization code
   *
   * @param sessionAmr - AMR (RFC 8176) of the VERIFIED idp_session that is
   *                     authorizing this request. Persisted on the code row
   *                     and stamped into the eventually-minted tokens.
   *                     Undefined/empty (legacy pre-amr sessions) → ['pwd'].
   */
  async authorize(
    userId: string,
    params: AuthorizeParams,
    sessionAmr?: string[],
  ): Promise<string> {
    // Verify user exists (handles stale sessions after database reseed)
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException(
        'User session is invalid. Please login again.',
      );
    }

    // Validate response_type
    if (params.responseType !== 'code') {
      throw new BadRequestException(
        'Invalid response_type. Only "code" is supported.',
      );
    }

    // Find the client credential by client_id (credentials live on ApplicationClient)
    const app = await this.prisma.applicationClient.findUnique({
      where: { clientId: params.clientId },
      include: { application: true },
    });

    if (!app || !app.isActive || !app.application.isActive) {
      throw new BadRequestException('Invalid client_id');
    }

    // Validate redirect_uri using the dedicated validator service
    const validationResult = await this.redirectUriValidator.validateRedirectUri(
      params.redirectUri,
      app.redirectUris,
    );

    if (!validationResult.valid) {
      throw new BadRequestException(
        validationResult.reason ||
          'Invalid redirect_uri. URI must be registered with the application.',
      );
    }

    // PKCE validation for SPA apps (required)
    if (app.type === ApplicationType.SPA) {
      if (!params.codeChallenge) {
        throw new BadRequestException(
          'PKCE code_challenge is required for SPA applications',
        );
      }
      if (params.codeChallengeMethod !== 'S256') {
        throw new BadRequestException(
          'Invalid code_challenge_method. Only S256 is supported.',
        );
      }
    }

    // MFA-at-mint enforcement: a full tenant-scoped code may only be issued
    // when the tenant's MFA policy is satisfied or a grace period applies.
    // Org-less (no tenantId) flows are unaffected.
    if (params.tenantId) {
      const compliance = await this.mfaService.checkUserMfaCompliance(
        userId,
        params.tenantId,
      );

      if (!compliance.compliant && !compliance.withinGrace) {
        // Audit (non-fatal): authorize flow interrupted for MFA enrollment.
        await this.auditService.log({
          tenantId: params.tenantId,
          actorUserId: userId,
          action: AUDIT_ACTIONS.MFA_ENROLLMENT_INTERRUPT,
          targetType: AUDIT_TARGET_TYPES.USER,
          targetId: userId,
          metadata: {
            clientId: params.clientId,
            tenantPolicy: compliance.tenantPolicy,
            gracePeriodEndsAt: compliance.gracePeriodEndsAt?.toISOString(),
          },
        });

        throw new MfaEnrollmentRequiredException({
          tenantId: params.tenantId,
          requiresSetup: compliance.requiresSetup,
          gracePeriodEndsAt: compliance.gracePeriodEndsAt,
        });
      }
      // Within grace (or fully compliant): mint normally. The token service
      // re-checks compliance at exchange time and stamps amr / grace claims,
      // so nothing extra needs to be persisted on the authorization code.
    }

    // Generate authorization code: 256 bits of CSPRNG entropy. Only the
    // SHA-256 hash is persisted — the plaintext exists solely in the
    // redirect back to the client (see utils/hash-code.ts).
    const code = generateAuthorizationCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Store authorization code (hashed) with PKCE data and optional tenant scope
    await this.prisma.authorizationCode.create({
      data: {
        codeHash: hashAuthorizationCode(code),
        redirectUri: params.redirectUri,
        scope: params.scope || 'openid profile email',
        state: params.state,
        nonce: params.nonce,
        codeChallenge: params.codeChallenge,
        codeChallengeMethod: params.codeChallengeMethod
          ? (params.codeChallengeMethod.toUpperCase() as CodeChallengeMethod)
          : null,
        expiresAt,
        userId,
        applicationClientId: app.id,
        tenantId: params.tenantId,
        tenantSubdomain: params.tenantSubdomain,
        // Session-level amr: how the authorizing idp_session authenticated.
        amr: sessionAmr?.length ? sessionAmr : ['pwd'],
      },
    });

    return code;
  }

  /**
   * Issue a short-lived resume token for the MFA enrollment interrupt flow.
   *
   * After the user finishes enrolling (Phase 2 frontend), this token lets the
   * authorize request be replayed exactly as originally issued. Follows the
   * same signed-JWT pattern as AuthService.issueMfaChallengeToken.
   */
  async issueMfaEnrollmentResumeToken(
    userId: string,
    params: AuthorizeParams,
  ): Promise<string> {
    return this.keyService.signJwt(
      {
        type: 'mfa_enrollment_resume',
        userType: 'user',
        // Single-use guarantee: redemption atomically records this jti in the
        // ConsumedJti ledger (see MfaEnrollmentService.consumeResumeJti).
        jti: crypto.randomUUID(),
        tenant_id: params.tenantId,
        authorize_params: this.sanitizeAuthorizeParams(params),
      },
      {
        subject: userId,
        issuer: this.issuer,
        expiresIn: 5 * 60, // 5 minutes - short lived
      },
    );
  }

  /**
   * Whitelist the AuthorizeParams fields that may round-trip through the
   * resume token. Anything else (headers, cookies, future fields) is dropped.
   */
  private sanitizeAuthorizeParams(params: AuthorizeParams): AuthorizeParams {
    return {
      clientId: params.clientId,
      redirectUri: params.redirectUri,
      responseType: params.responseType,
      scope: params.scope,
      state: params.state,
      nonce: params.nonce,
      codeChallenge: params.codeChallenge,
      codeChallengeMethod: params.codeChallengeMethod,
      tenantId: params.tenantId,
      tenantSubdomain: params.tenantSubdomain,
    };
  }

  // ===========================================================================
  // TOKEN ENDPOINT (delegated)
  // ===========================================================================

  /**
   * Exchange authorization code for tokens
   */
  async token(params: TokenParams): Promise<TokenResponse> {
    return this.tokenService.token(params);
  }

  // ===========================================================================
  // SESSION MANAGEMENT (delegated)
  // ===========================================================================

  /**
   * Revoke a specific session by ID
   */
  async revokeSession(sessionId: string) {
    return this.sessionService.revokeSession(sessionId);
  }

  /**
   * Revoke all sessions for a user
   */
  async revokeAllUserSessions(userId: string, applicationId?: string) {
    return this.sessionService.revokeAllUserSessions(userId, applicationId);
  }

  /**
   * Get active sessions for a user
   */
  async getUserSessions(userId: string, applicationId?: string) {
    return this.sessionService.getUserSessions(userId, applicationId);
  }

  /**
   * Revoke a token
   */
  async revokeToken(token: string, tokenTypeHint?: string) {
    return this.sessionService.revokeToken(token, tokenTypeHint);
  }

  /**
   * Verify refresh token JWT
   */
  async verifyRefreshTokenJwt(token: string) {
    return this.sessionService.verifyRefreshTokenJwt(token);
  }

  // ===========================================================================
  // TOKEN INTROSPECTION & VALIDATION (delegated)
  // ===========================================================================

  /**
   * Validate JWT token
   */
  async validateJwt(token: string) {
    return this.introspectionService.validateJwt(token);
  }

  /**
   * Validate OAuth access token
   */
  async validateAccessToken(token: string) {
    return this.introspectionService.validateAccessToken(token);
  }

  /**
   * Introspect a token (RFC 7662)
   */
  async introspect(token: string, tokenTypeHint?: string) {
    return this.introspectionService.introspect(token, tokenTypeHint);
  }

  /**
   * Get user info (OIDC UserInfo endpoint)
   */
  async getUserInfo(userId: string) {
    return this.introspectionService.getUserInfo(userId);
  }

  /**
   * Get user's tenants
   */
  async getTenants(userId: string) {
    return this.introspectionService.getTenants(userId);
  }

  // ===========================================================================
  // APPLICATION MANAGEMENT
  // ===========================================================================

  /**
   * Get application by client_id
   */
  async getApplicationByClientId(clientId: string) {
    // clientId now lives on ApplicationClient; flatten the container fields plus
    // the credential fields so existing callers keep the same shape.
    const client = await this.prisma.applicationClient.findUnique({
      where: { clientId },
      include: { application: true },
    });

    if (!client) {
      return null;
    }

    return {
      ...client.application,
      type: client.type,
      clientId: client.clientId,
      redirectUris: client.redirectUris,
      postLogoutRedirectUris: client.postLogoutRedirectUris,
      allowedWebOrigins: client.allowedWebOrigins,
      initiateLoginUri: client.initiateLoginUri,
    };
  }

  /**
   * Validate redirect_uri against application's allowed redirect URIs
   */
  async validateRedirectUri(
    clientId: string,
    redirectUri: string,
  ): Promise<{ valid: boolean; reason?: string }> {
    const app = await this.prisma.applicationClient.findUnique({
      where: { clientId },
      select: { redirectUris: true },
    });

    if (!app || !app.redirectUris || app.redirectUris.length === 0) {
      return {
        valid: false,
        reason: 'Application not found or no redirect URIs configured',
      };
    }

    return this.redirectUriValidator.validateRedirectUri(
      redirectUri,
      app.redirectUris,
    );
  }

  /**
   * Get application for branding
   */
  async getApplicationForBranding(clientId: string) {
    // Branding lives on the container, initiateLoginUri on the credential.
    const client = await this.prisma.applicationClient.findUnique({
      where: { clientId },
      select: {
        clientId: true,
        initiateLoginUri: true,
        application: {
          select: {
            id: true,
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
          },
        },
      },
    });

    if (!client) {
      return null;
    }

    return {
      ...client.application,
      clientId: client.clientId,
      initiateLoginUri: client.initiateLoginUri,
    };
  }
}
