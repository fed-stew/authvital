import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { KeyService } from './key.service';
import { OAuthSessionService } from './oauth-session.service';
import { OAuthTokenService, TokenParams, TokenResponse } from './oauth-token.service';
import { OAuthIntrospectionService } from './oauth-introspection.service';
import { RedirectUriValidatorService } from './redirect-uri-validator.service';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
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

  constructor(
    private readonly prisma: PrismaService,
    private readonly keyService: KeyService,
    private readonly configService: ConfigService,
    private readonly sessionService: OAuthSessionService,
    private readonly tokenService: OAuthTokenService,
    private readonly introspectionService: OAuthIntrospectionService,
    private readonly redirectUriValidator: RedirectUriValidatorService,
  ) {}

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
        'User session is invalid. Please login again.',
      );
    }

    // Validate response_type
    if (params.responseType !== 'code') {
      throw new BadRequestException(
        'Invalid response_type. Only "code" is supported.',
      );
    }

    // Find application by client_id
    const app = await this.prisma.application.findUnique({
      where: { clientId: params.clientId },
    });

    if (!app || !app.isActive) {
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

    // Generate authorization code
    const code = uuidv4();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Store authorization code with PKCE data and optional tenant scope
    await this.prisma.authorizationCode.create({
      data: {
        code,
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
        applicationId: app.id,
        tenantId: params.tenantId,
        tenantSubdomain: params.tenantSubdomain,
      },
    });

    return code;
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
    return this.prisma.application.findUnique({
      where: { clientId },
    });
  }

  /**
   * Validate redirect_uri against application's allowed redirect URIs
   */
  async validateRedirectUri(
    clientId: string,
    redirectUri: string,
  ): Promise<{ valid: boolean; reason?: string }> {
    const app = await this.prisma.application.findUnique({
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
   */
  async generateClientSecret(applicationId: string): Promise<string> {
    const app = await this.prisma.application.findUnique({
      where: { id: applicationId },
    });

    if (!app) {
      throw new NotFoundException('Application not found');
    }

    const secret = crypto.randomBytes(32).toString('hex');
    const hashedSecret = await bcrypt.hash(secret, 12);

    await this.prisma.application.update({
      where: { id: applicationId },
      data: { clientSecret: hashedSecret },
    });

    return secret;
  }

  /**
   * Revoke (delete) the client secret for an application
   */
  async revokeClientSecret(applicationId: string): Promise<void> {
    const app = await this.prisma.application.findUnique({
      where: { id: applicationId },
    });

    if (!app) {
      throw new NotFoundException('Application not found');
    }

    await this.prisma.application.update({
      where: { id: applicationId },
      data: { clientSecret: null },
    });
  }
}
