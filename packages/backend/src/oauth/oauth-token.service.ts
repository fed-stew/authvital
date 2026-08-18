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
import { MfaService, MfaComplianceResult } from '../auth/mfa/mfa.service';
import { resolveEffectiveTenantPermissions } from '../authorization/utils/tenant-permissions.util';
import { hashAuthorizationCode } from './utils/hash-code';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import { CodeChallengeMethod, Prisma, RevokedReason } from '@prisma/client';

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

/**
 * Credential-side config used to mint tokens. Token TTLs + clientId live on the
 * ApplicationClient; the owning Application (container) carries id + licensing.
 */
interface ApplicationClientConfig {
  id: string; // ApplicationClient PK
  clientId: string;
  accessTokenTtl: number;
  refreshTokenTtl: number;
  application: {
    id: string;
    licensingMode?: string | null;
    [key: string]: unknown;
  };
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

  /**
   * Generate session_state for OIDC Session Management
   * Format: client_id + ' ' + issuer + ' ' + browser_state + ' ' + salt
   * Hashed using SHA-256 with base64url encoding
   *
   * @see https://openid.net/specs/openid-connect-session-1_0.html
   */
  generateSessionState(clientId: string, userId: string): string {
    // Generate a random salt
    const salt = crypto.randomBytes(16).toString('base64url');

    // Browser state is derived from user session (using userId as deterministic seed)
    // In production, this could be a session cookie value or similar
    const browserState = crypto
      .createHash('sha256')
      .update(userId + this.issuer)
      .digest('base64url')
      .substring(0, 16);

    // Create the string to hash
    const toHash = `${clientId} ${this.issuer} ${browserState} ${salt}`;

    // Generate the hash
    const hash = crypto.createHash('sha256').update(toHash).digest('base64url');

    // Return as hash.salt format
    return `${hash}.${salt}`;
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly keyService: KeyService,
    private readonly configService: ConfigService,
    private readonly sessionService: OAuthSessionService,
    private readonly licenseService: OAuthLicenseService,
    private readonly mfaService: MfaService,
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

    // Codes are stored hashed at rest — look up (and log) by digest only,
    // never the plaintext (see utils/hash-code.ts).
    const codeHash = hashAuthorizationCode(params.code);

    this.logger.debug(
      `[OAuth Token] Exchanging code (sha256 ${codeHash.substring(0, 8)}...)`,
    );

    // Find authorization code by its hash
    const authCode = await this.prisma.authorizationCode.findUnique({
      where: { codeHash },
      include: {
        user: {
          include: {
            memberships: {
              where: { status: 'ACTIVE' },
              include: { tenant: true },
            },
          },
        },
        applicationClient: { include: { application: true } },
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
      // RFC 6749 §5.2: keep client-facing errors generic; details go to logs.
      this.logger.debug(
        `[OAuth Token] Authorization code expired at ${authCode.expiresAt.toISOString()}`,
      );
      throw new UnauthorizedException(
        'Invalid grant: authorization code expired',
      );
    }

    // Check if code was already used
    if (authCode.usedAt) {
      // Potential replay attack - revoke all tokens for this user/app
      await this.sessionService.revokeUserAppTokens(
        authCode.userId,
        authCode.applicationClientId,
      );
      throw new UnauthorizedException('Authorization code already used');
    }

    // Check if the owning application (container) is still active
    if (!authCode.applicationClient.application.isActive) {
      await this.prisma.authorizationCode.delete({ where: { id: authCode.id } });
      throw new UnauthorizedException('Application is disabled');
    }

    // Verify client_id matches
    if (authCode.applicationClient.clientId !== params.clientId) {
      throw new UnauthorizedException('Client ID mismatch');
    }

    // Verify redirect_uri matches exactly
    if (params.redirectUri && params.redirectUri !== authCode.redirectUri) {
      // RFC 6749 §5.2: keep client-facing errors generic; details go to logs.
      this.logger.debug(
        `[OAuth Token] Redirect URI mismatch: got "${params.redirectUri}" but expected "${authCode.redirectUri}"`,
      );
      throw new UnauthorizedException('Invalid grant: redirect_uri mismatch');
    }

    // If the client has a client secret configured, it MUST be provided
    if (authCode.applicationClient.clientSecret) {
      if (!params.clientSecret) {
        throw new UnauthorizedException(
          'Client secret is required for this application',
        );
      }
      const secretValid = await bcrypt.compare(
        params.clientSecret,
        authCode.applicationClient.clientSecret,
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

    // Atomically claim the code BEFORE minting tokens. The conditional
    // updateMany (usedAt: null) guarantees only ONE concurrent exchange wins;
    // the earlier findUnique → usedAt check alone is racy.
    const claimed = await this.prisma.authorizationCode.updateMany({
      where: { id: authCode.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    if (claimed.count !== 1) {
      // Lost the race — treat exactly like a replay: revoke everything for
      // this user/client pair.
      this.logger.warn(
        `[OAuth Token] Concurrent authorization code exchange detected for user ${authCode.userId} — revoking all sessions for this user/client`,
      );
      await this.sessionService.revokeUserAppTokens(
        authCode.userId,
        authCode.applicationClientId,
      );
      throw new UnauthorizedException('Authorization code already used');
    }

    // MFA-at-mint backstop (primary enforcement lives in the authorize path).
    // Deliberately placed AFTER the atomic claim: the code is legitimately
    // consumed either way — this is a POLICY failure, not theft, so it must
    // not look like a replay. Rejecting post-claim also means the same code
    // can't be retried to probe policy state; the client must re-run
    // /oauth/authorize, which performs the enrollment interrupt properly.
    const mfaCompliance = await this.enforceMfaPolicyAtMint(
      authCode.userId,
      authCode.tenantId,
    );

    // Generate tokens with optional tenant scope. The code row carries the
    // session-level amr persisted by the authorize endpoint.
    return this.generateTokens(
      authCode.user,
      authCode.applicationClient,
      authCode.scope || 'openid profile email',
      authCode.nonce,
      authCode.tenantId && authCode.tenantSubdomain
        ? {
            tenantId: authCode.tenantId,
            tenantSubdomain: authCode.tenantSubdomain,
          }
        : null,
      mfaCompliance,
      authCode.amr,
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
      applicationClient: { include: { application: true } },
    } satisfies Prisma.RefreshTokenInclude;

    const refreshToken = await this.prisma.refreshToken.findUnique({
      where: { id: jwtPayload.sid },
      include: refreshTokenInclude,
    });

    if (!refreshToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Step 3: Validate session state (Token Ghosting "ghost check").
    // A revoked token is normally a theft signal — but a token that was just
    // ROTATED may be replayed benignly (multi-tab BFF, parallel requests,
    // multi-instance deployments). Within the client's configured grace
    // window such a replay is forgiven and the refresh proceeds; the
    // successor chain simply continues from the replayed row.
    let graceReplay = false;
    if (refreshToken.revoked || refreshToken.revokedAt) {
      if (!this.isWithinRotationGrace(refreshToken)) {
        // Standard rotation-theft response: revoke the whole token family so
        // a thief holding ANY token from this lineage is cut off.
        this.logger.warn(
          `[Token Ghosting] Revoked refresh token ${refreshToken.id} presented — suspected token theft, revoking ALL sessions for user ${refreshToken.userId} on this client`,
        );
        await this.sessionService.revokeUserAppTokens(
          refreshToken.userId,
          refreshToken.applicationClientId,
        );
        throw new UnauthorizedException('Session has been revoked');
      }
      graceReplay = true;
      this.logger.log(
        `[Token Ghosting] Grace-window replay of ${refreshToken.id} accepted`,
      );
    }

    if (refreshToken.expiresAt < new Date()) {
      throw new UnauthorizedException('Session expired');
    }

    if (!refreshToken.applicationClient.application.isActive) {
      this.logger.warn(
        `[Token Ghosting] Refresh rejected — application ${refreshToken.applicationClient.clientId} is disabled`,
      );
      throw new UnauthorizedException('Application is disabled');
    }

    // Step 4: Atomically rotate the refresh token (revoke old, generate new).
    // The conditional updateMany (revoked: false) guarantees only ONE
    // concurrent rotation wins — losing means replay/theft is in progress.
    // Grace replays skip this: their row is already revoked (ROTATED) by the
    // rotation that consumed it.
    if (!graceReplay) {
      const rotated = await this.prisma.refreshToken.updateMany({
        where: { id: refreshToken.id, revoked: false },
        data: {
          revoked: true,
          revokedAt: new Date(),
          revokedReason: RevokedReason.ROTATED,
        },
      });

      if (rotated.count !== 1) {
        // Lost a concurrent rotation race. Re-fetch the row: if the winner
        // legitimately ROTATED it and we're inside the grace window, the
        // loser is forgiven too — otherwise keep the theft response.
        const current = await this.prisma.refreshToken.findUnique({
          where: { id: refreshToken.id },
          select: { revokedReason: true, revokedAt: true, expiresAt: true },
        });

        if (
          !current ||
          !this.isWithinRotationGrace({
            ...current,
            applicationClient: refreshToken.applicationClient,
          })
        ) {
          this.logger.warn(
            `[Token Ghosting] Concurrent rotation of refresh token ${refreshToken.id} — suspected token theft, revoking ALL sessions for user ${refreshToken.userId} on this client`,
          );
          await this.sessionService.revokeUserAppTokens(
            refreshToken.userId,
            refreshToken.applicationClientId,
          );
          throw new UnauthorizedException('Invalid refresh token');
        }

        this.logger.log(
          `[Token Ghosting] Grace-window replay of ${refreshToken.id} accepted`,
        );
      }
    }

    // MFA-at-mint backstop — e.g. the grace period expired between refreshes.
    // Runs AFTER the atomic rotation on purpose: the presented token is
    // legitimately consumed (rotated) either way, and a policy failure must
    // NOT trigger the token-family revocation above — that response is for
    // suspected theft only. With no new token issued, this session lineage
    // simply ends; the user must re-authorize and enroll in MFA.
    const mfaCompliance = await this.enforceMfaPolicyAtMint(
      refreshToken.userId,
      refreshToken.tenantId,
    );

    // Maintain tenant scope when refreshing tokens. The refresh-token row
    // carries the ORIGINAL session's amr, so refreshed tokens keep reporting
    // how the user actually logged in.
    return this.generateTokens(
      refreshToken.user,
      refreshToken.applicationClient,
      refreshToken.scope || 'openid profile email',
      null, // nonce not needed for refresh token grant
      refreshToken.tenantId && refreshToken.tenantSubdomain
        ? {
            tenantId: refreshToken.tenantId,
            tenantSubdomain: refreshToken.tenantSubdomain,
          }
        : null,
      mfaCompliance,
      refreshToken.amr,
      refreshToken.id,
    );
  }

  /**
   * Rotation-reuse grace check (Task: forgive benign replays).
   *
   * A revoked refresh token may still be refreshed IFF:
   *  - the client opted in (rotationReuseIntervalSeconds > 0), AND
   *  - the row was revoked by a normal rotation (ROTATED — never by theft
   *    response, logout, or admin action), AND
   *  - the rotation happened within the grace window, AND
   *  - the row's original expiresAt hasn't passed.
   *
   * With the default interval of 0 this always returns false — byte-for-byte
   * the strict legacy behavior.
   */
  private isWithinRotationGrace(token: {
    revokedReason: RevokedReason | null;
    revokedAt: Date | null;
    expiresAt: Date;
    applicationClient: { rotationReuseIntervalSeconds?: number };
  }): boolean {
    const intervalSeconds =
      token.applicationClient.rotationReuseIntervalSeconds ?? 0;
    if (intervalSeconds <= 0) {
      return false;
    }
    if (token.revokedReason !== RevokedReason.ROTATED || !token.revokedAt) {
      return false;
    }
    const now = Date.now();
    if (now - token.revokedAt.getTime() > intervalSeconds * 1000) {
      return false;
    }
    return token.expiresAt.getTime() > now;
  }

  /**
   * Backstop enforcement of the tenant MFA policy at token mint time.
   *
   * Returns the compliance result (used for amr / grace claims) for
   * tenant-scoped mints, or null for org-less mints (unaffected by policy).
   * Throws 401 interaction_required when policy requires MFA, the user is not
   * enrolled, and no grace period applies. NEVER revokes token families —
   * callers must invoke this only after their atomic claim/rotation succeeded.
   */
  private async enforceMfaPolicyAtMint(
    userId: string,
    tenantId: string | null | undefined,
  ): Promise<MfaComplianceResult | null> {
    if (!tenantId) {
      return null;
    }

    const compliance = await this.mfaService.checkUserMfaCompliance(
      userId,
      tenantId,
    );

    if (!compliance.compliant && !compliance.withinGrace) {
      this.logger.debug(
        `[OAuth Token] Mint blocked by tenant MFA policy for user ${userId} on tenant ${tenantId}`,
      );
      throw new UnauthorizedException({
        error: 'interaction_required',
        error_description: 'MFA enrollment required by tenant policy',
      });
    }

    return compliance;
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

    // Find the client credential by client_id (M2M lives on ApplicationClient)
    const app = await this.prisma.applicationClient.findUnique({
      where: { clientId: params.clientId },
      include: { application: true },
    });

    if (!app || !app.isActive || !app.application.isActive) {
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

    // Deny-by-default scope validation: an M2M client may only receive scopes
    // it has been explicitly granted via `m2mAllowedScopes`.
    const allowed = app.m2mAllowedScopes ?? [];
    let granted: string[];
    if (params.scope && params.scope.trim().length > 0) {
      const requested = params.scope.trim().split(/\s+/);
      const invalid = requested.filter((s) => !allowed.includes(s));
      if (invalid.length > 0) {
        throw new BadRequestException(
          `invalid_scope: requested scope(s) not permitted for this client: ${invalid.join(', ')}`,
        );
      }
      granted = requested;
    } else {
      granted = allowed;
    }

    // Generate M2M access token (no user, no refresh token)
    return this.generateM2MTokens(app, granted.join(' '));
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
   * @param mfaCompliance - Tenant MFA compliance at mint time (null for org-less mints).
   *                        Drives the mfa_grace_expires_at claim; the
   *                        compliance check itself still gates minting.
   * @param sessionAmr - AMR (RFC 8176) of the ORIGINAL IdP session, read from
   *                     the AuthorizationCode/RefreshToken row. 'otp' here
   *                     means the session truly verified a TOTP code at login.
   *                     Empty/undefined = legacy pre-amr session → ['pwd']
   *                     (every pre-amr console login was at least
   *                     password-authenticated; we claim the weakest method
   *                     rather than inventing 'otp').
   * @param predecessorSessionId - Refresh-token row this mint rotates/replaces.
   *                     Its successorId is stamped once (first rotation wins;
   *                     grace-window replays never overwrite it).
   */
  async generateTokens(
    user: UserWithMemberships,
    application: ApplicationClientConfig,
    scope: string,
    nonce?: string | null,
    tenantScope?: TenantScope | null,
    mfaCompliance?: MfaComplianceResult | null,
    sessionAmr?: string[] | null,
    predecessorSessionId?: string | null,
  ): Promise<TokenResponse> {
    const scopes = scope.split(' ');

    // AMR (Authentication Method References, RFC 8176): stamped from the
    // persisted session amr — no approximation.
    const amr = sessionAmr?.length ? [...sessionAmr] : ['pwd'];

    // Minted under grace: policy requires MFA, user not enrolled, window open.
    const mfaGraceExpiresAt =
      mfaCompliance?.withinGrace &&
      !mfaCompliance.mfaEnabled &&
      mfaCompliance.gracePeriodEndsAt
        ? Math.floor(mfaCompliance.gracePeriodEndsAt.getTime() / 1000)
        : undefined;

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

    // Fetch roles and permissions when scoped to a single tenant.
    // Roles belong to the Application container, not the client credential.
    const roleData = tenantScope
      ? await this.fetchMembershipRoles(
          user.id,
          tenantScope.tenantId,
          application.application.id,
        )
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

    accessTokenPayload.amr = amr;
    if (mfaGraceExpiresAt !== undefined) {
      accessTokenPayload.mfa_grace_expires_at = mfaGraceExpiresAt;
    }

    // Sign access token
    const accessToken = await this.keyService.signJwt(accessTokenPayload, {
      subject: user.id,
      audience: application.clientId,
      issuer: this.issuer,
      expiresIn: application.accessTokenTtl,
    });

    // Create refresh token session (Token Ghosting). Persist the session amr
    // so the refresh grant re-stamps the ORIGINAL login's methods.
    const refreshTokenRecord = await this.prisma.refreshToken.create({
      data: {
        scope,
        expiresAt: new Date(Date.now() + application.refreshTokenTtl * 1000),
        userId: user.id,
        applicationClientId: application.id,
        revoked: false,
        tenantId: tenantScope?.tenantId,
        tenantSubdomain: tenantScope?.tenantSubdomain,
        amr,
      },
    });

    // Chain the predecessor to its successor for forensics. Conditional on
    // successorId: null so the FIRST rotation wins — a grace-window replay
    // never rewrites history.
    if (predecessorSessionId) {
      await this.prisma.refreshToken.updateMany({
        where: { id: predecessorSessionId, successorId: null },
        data: { successorId: refreshTokenRecord.id },
      });
    }

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
        amr,
      };

      if (mfaGraceExpiresAt !== undefined) {
        idTokenPayload.mfa_grace_expires_at = mfaGraceExpiresAt;
      }

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
    application: ApplicationClientConfig;
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
      const appRoles = roleData.membershipRoles.map((mr) => mr.role.slug);

      // Single source of truth: owner is expanded to the full permission set
      // here exactly as the live-DB guard path does.
      accessTokenPayload.tenant_roles = tenantRoles;
      accessTokenPayload.tenant_permissions = resolveEffectiveTenantPermissions(
        roleData.membershipTenantRoles.map((mtr) => mtr.tenantRole),
      );

      if (appRoles.length > 0) {
        accessTokenPayload.app_roles = appRoles;
      }

      // Add license info if applicable (licensing lives on the container)
      const licenseInfo = await this.licenseService.fetchLicenseInfo(
        user.id,
        tenantScope.tenantId,
        application.application,
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
