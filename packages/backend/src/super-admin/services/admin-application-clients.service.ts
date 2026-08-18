import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { ApplicationClient, ApplicationType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { INTERNAL_APP_SLUG } from '../../auth/internal-client';
import {
  validateRedirectUriPatterns,
  validateSafeUrl,
  validateSafeUrls,
} from '../../common/utils/url-validation.utils';

const SECRET_SALT_ROUNDS = 12;

/** Public (safe) view of a credential — never includes the hashed secret. */
export interface PublicApplicationClient {
  id: string;
  clientId: string;
  type: ApplicationType;
  redirectUris: string[];
  postLogoutRedirectUris: string[];
  allowedWebOrigins: string[];
  initiateLoginUri: string | null;
  accessTokenTtl: number;
  refreshTokenTtl: number;
  rotationReuseIntervalSeconds: number;
  hasClientSecret: boolean;
  m2mTrustedAllTenants: boolean;
  m2mAllowedScopes: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Discriminated credential-creation input (mirrors AddClientInput in contracts). */
export type CreateClientInput =
  | {
      type: 'SPA';
      redirectUris: string[];
      postLogoutRedirectUris?: string[];
      allowedWebOrigins?: string[];
      initiateLoginUri?: string;
      accessTokenTtl?: number;
      refreshTokenTtl?: number;
      rotationReuseIntervalSeconds?: number;
    }
  | {
      type: 'MACHINE';
      m2mTrustedAllTenants?: boolean;
      m2mAllowedScopes?: string[];
      accessTokenTtl?: number;
      refreshTokenTtl?: number;
    };

export interface UpdateClientInput {
  redirectUris?: string[];
  postLogoutRedirectUris?: string[];
  allowedWebOrigins?: string[];
  initiateLoginUri?: string | null;
  accessTokenTtl?: number;
  refreshTokenTtl?: number;
  rotationReuseIntervalSeconds?: number;
  m2mTrustedAllTenants?: boolean;
  m2mAllowedScopes?: string[];
  isActive?: boolean;
}

/**
 * Manages OAuth credentials (ApplicationClient rows) that hang off an
 * Application container after the app-client-split. Enforces the invariants:
 *   - <= 1 SPA + <= 1 MACHINE per app (service layer, on top of the DB index)
 *   - SPA  => clientSecret null AND >= 1 redirect URI; no M2M authz
 *   - MACHINE => hashed secret; no redirect/origin URIs
 *   - plaintext secret is returned exactly once (create / rotate)
 *
 * Extracted from AdminApplicationsService to keep each file cohesive and under
 * the size budget.
 */
@Injectable()
export class AdminApplicationClientsService {
  private readonly logger = new Logger(AdminApplicationClientsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  // ===========================================================================
  // MAPPING
  // ===========================================================================

  /** Project a credential row to its public shape (drops the secret hash). */
  toPublicClient(client: ApplicationClient): PublicApplicationClient {
    return {
      id: client.id,
      clientId: client.clientId,
      type: client.type,
      redirectUris: client.redirectUris,
      postLogoutRedirectUris: client.postLogoutRedirectUris,
      allowedWebOrigins: client.allowedWebOrigins,
      initiateLoginUri: client.initiateLoginUri,
      accessTokenTtl: client.accessTokenTtl,
      refreshTokenTtl: client.refreshTokenTtl,
      rotationReuseIntervalSeconds: client.rotationReuseIntervalSeconds ?? 0,
      hasClientSecret: !!client.clientSecret,
      m2mTrustedAllTenants: client.m2mTrustedAllTenants,
      m2mAllowedScopes: client.m2mAllowedScopes,
      isActive: client.isActive,
      createdAt: client.createdAt,
      updatedAt: client.updatedAt,
    };
  }

  // ===========================================================================
  // CREATE
  // ===========================================================================

  /**
   * Create a credential for an app, enforcing the <=1-per-type invariant at the
   * service layer. Returns the public client plus, for MACHINE, the one-time
   * plaintext secret.
   */
  async addClient(
    applicationId: string,
    input: CreateClientInput,
  ): Promise<{ client: PublicApplicationClient; clientSecret?: string }> {
    await this.getAppOrThrow(applicationId);
    await this.assertTypeSlotFree(applicationId, input.type);
    const { client, plaintextSecret } = await this.createClientRow(applicationId, input);
    return { client: this.toPublicClient(client), clientSecret: plaintextSecret };
  }

  /**
   * Low-level credential creation shared by addClient and the app-create flow.
   * Validates type-appropriate fields and mints a MACHINE secret. Callers are
   * responsible for the <=1-per-type check (assertTypeSlotFree) when relevant.
   */
  async createClientRow(
    applicationId: string,
    input: CreateClientInput,
    clientIdOverride?: string,
  ): Promise<{ client: ApplicationClient; plaintextSecret?: string }> {
    if (input.type === 'SPA') {
      this.validateSpaFields(input);
      const client = await this.prisma.applicationClient.create({
        data: {
          applicationId,
          type: ApplicationType.SPA,
          ...(clientIdOverride ? { clientId: clientIdOverride } : {}),
          // SPA never carries a secret.
          clientSecret: null,
          redirectUris: input.redirectUris,
          postLogoutRedirectUris: input.postLogoutRedirectUris ?? [],
          allowedWebOrigins: input.allowedWebOrigins ?? [],
          initiateLoginUri: input.initiateLoginUri,
          ...(input.accessTokenTtl !== undefined && { accessTokenTtl: input.accessTokenTtl }),
          ...(input.refreshTokenTtl !== undefined && { refreshTokenTtl: input.refreshTokenTtl }),
          ...(input.rotationReuseIntervalSeconds !== undefined && {
            rotationReuseIntervalSeconds: this.validatedRotationReuseInterval(
              input.rotationReuseIntervalSeconds,
            ),
          }),
        },
      });
      return { client };
    }

    // MACHINE: mint a one-time secret; redirect/origin URIs are not applicable.
    const plaintextSecret = crypto.randomBytes(32).toString('hex');
    const hashedSecret = await bcrypt.hash(plaintextSecret, SECRET_SALT_ROUNDS);
    const client = await this.prisma.applicationClient.create({
      data: {
        applicationId,
        type: ApplicationType.MACHINE,
        ...(clientIdOverride ? { clientId: clientIdOverride } : {}),
        clientSecret: hashedSecret,
        redirectUris: [],
        postLogoutRedirectUris: [],
        allowedWebOrigins: [],
        m2mTrustedAllTenants: input.m2mTrustedAllTenants ?? false,
        m2mAllowedScopes: input.m2mAllowedScopes ?? [],
        ...(input.accessTokenTtl !== undefined && { accessTokenTtl: input.accessTokenTtl }),
        ...(input.refreshTokenTtl !== undefined && { refreshTokenTtl: input.refreshTokenTtl }),
      },
    });
    return { client, plaintextSecret };
  }

  // ===========================================================================
  // UPDATE
  // ===========================================================================

  async updateClient(
    applicationId: string,
    clientId: string,
    input: UpdateClientInput,
  ): Promise<PublicApplicationClient> {
    const client = await this.getClientForApp(applicationId, clientId);

    const data: Prisma.ApplicationClientUpdateInput = {};

    if (client.type === ApplicationType.SPA) {
      if (input.m2mTrustedAllTenants !== undefined || input.m2mAllowedScopes !== undefined) {
        throw new BadRequestException(
          'M2M authorization settings are only valid for MACHINE credentials.',
        );
      }
      if (input.redirectUris !== undefined) {
        if (input.redirectUris.length === 0) {
          throw new BadRequestException('A SPA credential requires at least one redirect URI.');
        }
        const result = validateRedirectUriPatterns(input.redirectUris);
        if (!result.valid) throw new BadRequestException(result.error);
        data.redirectUris = input.redirectUris;
      }
      if (input.postLogoutRedirectUris !== undefined) {
        if (input.postLogoutRedirectUris.length) {
          const result = validateRedirectUriPatterns(input.postLogoutRedirectUris);
          if (!result.valid) throw new BadRequestException(result.error);
        }
        data.postLogoutRedirectUris = input.postLogoutRedirectUris;
      }
      if (input.allowedWebOrigins !== undefined) {
        if (input.allowedWebOrigins.length) {
          const result = validateSafeUrls(input.allowedWebOrigins, {
            allowWildcards: false,
            allowTenantPlaceholder: true,
          });
          if (!result.valid) throw new BadRequestException(result.error);
        }
        data.allowedWebOrigins = input.allowedWebOrigins;
      }
      if (input.initiateLoginUri !== undefined) {
        if (input.initiateLoginUri) {
          const result = validateSafeUrl(input.initiateLoginUri, {
            allowTenantPlaceholder: true,
          });
          if (!result.valid) throw new BadRequestException(result.error);
          this.assertInitiateLoginUriNotIdpHost(input.initiateLoginUri);
        } else if (client.initiateLoginUri) {
          // Clearing a previously-set URI: blocked while the application still
          // participates in signup — post-signup users would have no app to
          // land in (see SignupFlowController.initiateSignup).
          await this.assertSignupNotEnabled(applicationId);
        }
        data.initiateLoginUri = input.initiateLoginUri;
      }
    } else {
      // MACHINE — redirect/origin URIs are never valid here.
      if (
        input.redirectUris !== undefined ||
        input.postLogoutRedirectUris !== undefined ||
        input.allowedWebOrigins !== undefined ||
        input.initiateLoginUri !== undefined
      ) {
        throw new BadRequestException(
          'Redirect / web-origin URIs are not valid for MACHINE credentials.',
        );
      }
      if (input.m2mTrustedAllTenants !== undefined) {
        data.m2mTrustedAllTenants = input.m2mTrustedAllTenants;
      }
      if (input.m2mAllowedScopes !== undefined) {
        data.m2mAllowedScopes = input.m2mAllowedScopes;
      }
    }

    if (input.accessTokenTtl !== undefined) data.accessTokenTtl = input.accessTokenTtl;
    if (input.refreshTokenTtl !== undefined) data.refreshTokenTtl = input.refreshTokenTtl;
    if (input.rotationReuseIntervalSeconds !== undefined) {
      data.rotationReuseIntervalSeconds = this.validatedRotationReuseInterval(
        input.rotationReuseIntervalSeconds,
      );
    }
    if (input.isActive !== undefined) data.isActive = input.isActive;

    const updated = await this.prisma.applicationClient.update({
      where: { id: client.id },
      data,
    });
    return this.toPublicClient(updated);
  }

  // ===========================================================================
  // DELETE
  // ===========================================================================

  /** Remove a credential. Codes/refresh tokens/grants cascade via the schema. */
  async deleteClient(applicationId: string, clientId: string): Promise<{ success: true }> {
    const client = await this.getClientForApp(applicationId, clientId);
    await this.prisma.applicationClient.delete({ where: { id: client.id } });
    this.logger.log(
      `Credential ${client.clientId} (${client.type}) removed from application ${applicationId}`,
    );
    return { success: true };
  }

  // ===========================================================================
  // SECRET MANAGEMENT (MACHINE only)
  // ===========================================================================

  /** Rotate a MACHINE credential secret. Returns the new plaintext once. */
  async rotateSecret(applicationId: string, clientId: string): Promise<string> {
    const client = await this.getMachineClientForApp(applicationId, clientId);
    const secret = crypto.randomBytes(32).toString('hex');
    const hashedSecret = await bcrypt.hash(secret, SECRET_SALT_ROUNDS);
    await this.prisma.applicationClient.update({
      where: { id: client.id },
      data: { clientSecret: hashedSecret },
    });
    return secret;
  }

  // ===========================================================================
  // M2M TENANT GRANTS (target a specific MACHINE credential)
  // ===========================================================================

  async listTenantGrants(applicationId: string, clientId: string) {
    const client = await this.getMachineClientForApp(applicationId, clientId);
    const grants = await this.prisma.m2mTenantGrant.findMany({
      where: { applicationClientId: client.id },
      include: { tenant: { select: { id: true, name: true, slug: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return grants.map((grant) => this.mapGrant(grant, applicationId, client.clientId));
  }

  async addTenantGrant(applicationId: string, clientId: string, tenantId: string) {
    const client = await this.getMachineClientForApp(applicationId, clientId);

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant not found');

    const grant = await this.prisma.m2mTenantGrant.upsert({
      where: {
        applicationClientId_tenantId: { applicationClientId: client.id, tenantId },
      },
      create: { applicationClientId: client.id, tenantId },
      update: {},
      include: { tenant: { select: { id: true, name: true, slug: true } } },
    });
    return this.mapGrant(grant, applicationId, client.clientId);
  }

  async removeTenantGrant(applicationId: string, clientId: string, tenantId: string) {
    const client = await this.getMachineClientForApp(applicationId, clientId);
    await this.prisma.m2mTenantGrant.deleteMany({
      where: { applicationClientId: client.id, tenantId },
    });
    return { success: true as const };
  }

  // ===========================================================================
  // INTERNAL HELPERS
  // ===========================================================================

  /** Enforce the <=1-per-type invariant with a friendly error. */
  async assertTypeSlotFree(applicationId: string, type: 'SPA' | 'MACHINE'): Promise<void> {
    const existing = await this.prisma.applicationClient.findUnique({
      where: { applicationId_type: { applicationId, type: type as ApplicationType } },
    });
    if (existing) {
      throw new ConflictException(
        `This application already has a ${type} credential. ` +
          'Each application allows at most one SPA and one MACHINE credential.',
      );
    }
  }

  /** Grace window bounds: 0 (strict) .. 300 seconds. */
  private validatedRotationReuseInterval(value: number): number {
    if (!Number.isInteger(value) || value < 0 || value > 300) {
      throw new BadRequestException(
        'rotationReuseIntervalSeconds must be an integer between 0 and 300.',
      );
    }
    return value;
  }

  private validateSpaFields(input: Extract<CreateClientInput, { type: 'SPA' }>): void {
    if (!input.redirectUris?.length) {
      throw new BadRequestException('A SPA credential requires at least one redirect URI.');
    }
    const redirect = validateRedirectUriPatterns(input.redirectUris);
    if (!redirect.valid) throw new BadRequestException(redirect.error);

    if (input.postLogoutRedirectUris?.length) {
      const result = validateRedirectUriPatterns(input.postLogoutRedirectUris);
      if (!result.valid) throw new BadRequestException(result.error);
    }
    if (input.allowedWebOrigins?.length) {
      const result = validateSafeUrls(input.allowedWebOrigins, {
        allowWildcards: false,
        allowTenantPlaceholder: true,
      });
      if (!result.valid) throw new BadRequestException(result.error);
    }
    if (input.initiateLoginUri) {
      const result = validateSafeUrl(input.initiateLoginUri, { allowTenantPlaceholder: true });
      if (!result.valid) throw new BadRequestException(result.error);
      this.assertInitiateLoginUriNotIdpHost(input.initiateLoginUri);
    }
  }

  /**
   * Reject an initiateLoginUri that points at THIS AuthVital instance: the
   * hint-less login flow 302s browsers to it, and the IdP has no GET routes
   * to receive them (only the SPA + JSON APIs), so the user dead-ends in a 404.
   * Exact hostname match only — apps legitimately live on sibling/sub domains
   * of the IdP host, so subdomains are NOT rejected.
   */
  private assertInitiateLoginUriNotIdpHost(initiateLoginUri: string): void {
    const baseUrl = this.configService.get<string>('BASE_URL');
    if (!baseUrl) return;

    let idpHostname: string;
    let uriHostname: string;
    try {
      idpHostname = new URL(baseUrl).hostname;
      // '{tenant}' is a supported placeholder but not URL-parseable; swap in a
      // syntactically valid dummy label. A placeholder host can never equal the
      // (literal) IdP hostname anyway.
      uriHostname = new URL(initiateLoginUri.replace(/\{tenant\}/g, 'tenant-placeholder')).hostname;
    } catch {
      // Syntax is validateSafeUrl's job — never double-report from here.
      return;
    }

    if (uriHostname.toLowerCase() === idpHostname.toLowerCase()) {
      throw new BadRequestException(
        "initiateLoginUri must point to your application's host, not the AuthVital instance itself",
      );
    }
  }

  /** Guard for clearing initiateLoginUri while the app participates in signup. */
  private async assertSignupNotEnabled(applicationId: string): Promise<void> {
    const app = await this.prisma.application.findUnique({
      where: { id: applicationId },
      select: { autoProvisionOnSignup: true },
    });
    if (app?.autoProvisionOnSignup) {
      throw new BadRequestException(
        'This application has signup enabled; its SPA credential must keep an Initiate Login URI. ' +
          'Disable signup participation first.',
      );
    }
  }

  private async getAppOrThrow(applicationId: string) {
    const app = await this.prisma.application.findUnique({ where: { id: applicationId } });
    // The reserved internal container is not a customer app — hide it.
    if (!app || app.slug === INTERNAL_APP_SLUG) {
      throw new NotFoundException('Application not found');
    }
    return app;
  }

  private async getClientForApp(
    applicationId: string,
    clientId: string,
  ): Promise<ApplicationClient> {
    const client = await this.prisma.applicationClient.findUnique({ where: { clientId } });
    if (!client || client.applicationId !== applicationId) {
      throw new NotFoundException('Credential not found for this application');
    }
    return client;
  }

  private async getMachineClientForApp(
    applicationId: string,
    clientId: string,
  ): Promise<ApplicationClient> {
    const client = await this.getClientForApp(applicationId, clientId);
    if (client.type !== ApplicationType.MACHINE) {
      throw new BadRequestException('This operation is only valid for MACHINE credentials.');
    }
    return client;
  }

  private mapGrant(
    grant: {
      id: string;
      tenantId: string;
      tenant: { id: string; name: string; slug: string };
      createdAt: Date;
    },
    applicationId: string,
    clientId: string,
  ) {
    return {
      id: grant.id,
      applicationId,
      clientId,
      tenantId: grant.tenantId,
      tenant: grant.tenant,
      createdAt: grant.createdAt.toISOString(),
    };
  }
}
