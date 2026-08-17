import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminRolesService } from './admin-roles.service';
import {
  AdminApplicationClientsService,
  CreateClientInput,
} from './admin-application-clients.service';
import { SystemWebhookService } from '../../webhooks/system-webhook.service';
import { AccessMode } from '@prisma/client';
import { INTERNAL_APP_SLUG } from '../../auth/internal-client';
import {
  APP_INCLUDE,
  mapAppWithClients,
  validateBrandingUrls,
  buildApplicationCreatedPayload,
  buildApplicationUpdatedPayload,
  buildApplicationStatusChangedPayload,
  buildApplicationDeletedPayload,
} from './admin-applications.helpers';

// ===========================================================================
// APPLICATION SERVICE
// ===========================================================================

/**
 * Handles application management operations for super admins.
 * Focused on: App CRUD, branding, OAuth config, and webhooks.
 * Role management is delegated to AdminRolesService.
 */
@Injectable()
export class AdminApplicationsService {
  private readonly logger = new Logger(AdminApplicationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rolesService: AdminRolesService,
    private readonly clientsService: AdminApplicationClientsService,
    private readonly systemWebhookService: SystemWebhookService,
  ) {}

  // ===========================================================================
  // APPLICATION CRUD
  // ===========================================================================

  /**
   * Map a loaded Application (+clients/roles/licenseTypes) to the container-model
   * AppWithClients shape. Credentials are exposed EXPLICITLY as a clients[]
   * array — never flattened to a single "sole client" (app-client-split).
   */
  private toAppWithClients(app: any) {
    return mapAppWithClients(app, (c) => this.clientsService.toPublicClient(c));
  }

  /**
   * Get all applications in the instance (container + clients[]). The reserved
   * internal auth-flow container is hidden — it is not a customer application.
   */
  async getApplications() {
    const applications = await this.prisma.application.findMany({
      where: { slug: { not: INTERNAL_APP_SLUG } },
      include: APP_INCLUDE,
      orderBy: { name: 'asc' },
    });
    return applications.map((app) => this.toAppWithClients(app));
  }

  /**
   * Get a single application by ID (container + clients[]).
   */
  async getApplication(applicationId: string) {
    const app = await this.prisma.application.findUnique({
      where: { id: applicationId },
      include: APP_INCLUDE,
    });

    if (!app || app.slug === INTERNAL_APP_SLUG) {
      throw new NotFoundException('Application not found');
    }

    return this.toAppWithClients(app);
  }

  /** Reload an application in the AppWithClients shape (post-mutation helper). */
  private async loadAppWithClients(applicationId: string) {
    const app = await this.prisma.application.findUnique({
      where: { id: applicationId },
      include: APP_INCLUDE,
    });
    if (!app) throw new NotFoundException('Application not found');
    return this.toAppWithClients(app);
  }

  /**
   * A representative credential (earliest created) for webhook metadata only.
   * Not a "sole client" assumption — containers may have multiple credentials.
   */
  private firstClient(applicationId: string) {
    return this.prisma.applicationClient.findFirst({
      where: { applicationId },
      orderBy: { createdAt: 'asc' },
      select: { clientId: true },
    });
  }

  /**
   * Create a new application
   */
  async createApplication(data: {
    name: string;
    clientId?: string;
    description?: string;
    availableFeatures?: Array<{ key: string; name: string; description?: string }>;
    allowMixedLicensing?: boolean;
    licensingMode?: 'FREE' | 'PER_SEAT' | 'TENANT_WIDE';
    accessMode?: AccessMode;
    defaultLicenseTypeId?: string;
    defaultSeatCount?: number;
    autoProvisionOnSignup?: boolean;
    autoGrantToOwner?: boolean;
    brandingName?: string;
    brandingLogoUrl?: string;
    brandingIconUrl?: string;
    brandingPrimaryColor?: string;
    brandingBackgroundColor?: string;
    brandingAccentColor?: string;
    brandingSupportUrl?: string;
    brandingPrivacyUrl?: string;
    brandingTermsUrl?: string;
    // The FIRST credential to create with the container (SPA or MACHINE).
    // OPTIONAL: when omitted, only the container is created (zero credentials).
    client?: CreateClientInput;
  }) {
    // Credential (redirect/scope) validation lives in the clients service; it
    // runs when we create the first credential below.

    // Validate branding URLs for security
    validateBrandingUrls([
      { name: 'brandingLogoUrl', value: data.brandingLogoUrl },
      { name: 'brandingIconUrl', value: data.brandingIconUrl },
      { name: 'brandingSupportUrl', value: data.brandingSupportUrl },
      { name: 'brandingPrivacyUrl', value: data.brandingPrivacyUrl },
      { name: 'brandingTermsUrl', value: data.brandingTermsUrl },
    ]);

    // Validate auto-provision settings
    if (data.autoProvisionOnSignup && !data.defaultLicenseTypeId) {
      throw new BadRequestException(
        'A default license type is required when auto-provision on signup is enabled',
      );
    }

    // Validate default license type exists if provided
    if (data.defaultLicenseTypeId) {
      const licenseType = await this.prisma.licenseType.findUnique({
        where: { id: data.defaultLicenseTypeId },
      });
      if (!licenseType) {
        throw new NotFoundException(
          `Default license type with ID "${data.defaultLicenseTypeId}" not found`,
        );
      }
    }

    // Auto-generate slug from name
    let slug = data.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    // Check slug uniqueness and append number if needed
    let existing = await this.prisma.application.findUnique({
      where: { slug },
    });
    let counter = 2;
    while (existing) {
      slug = `${slug}-${counter}`;
      existing = await this.prisma.application.findUnique({
        where: { slug },
      });
      counter++;
    }

    const app = await this.prisma.application.create({
      data: {
        name: data.name,
        slug,
        description: data.description,
        availableFeatures: data.availableFeatures || [],
        allowMixedLicensing: data.allowMixedLicensing || false,
        licensingMode: data.licensingMode || 'FREE',
        accessMode: data.accessMode || AccessMode.AUTOMATIC,
        defaultLicenseTypeId: data.defaultLicenseTypeId,
        defaultSeatCount: data.defaultSeatCount || 5,
        autoProvisionOnSignup: data.autoProvisionOnSignup || false,
        autoGrantToOwner: data.autoGrantToOwner !== false,
        brandingName: data.brandingName,
        brandingLogoUrl: data.brandingLogoUrl,
        brandingIconUrl: data.brandingIconUrl,
        brandingPrimaryColor: data.brandingPrimaryColor,
        brandingBackgroundColor: data.brandingBackgroundColor,
        brandingAccentColor: data.brandingAccentColor,
        brandingSupportUrl: data.brandingSupportUrl,
        brandingPrivacyUrl: data.brandingPrivacyUrl,
        brandingTermsUrl: data.brandingTermsUrl,
      },
    });

    // Create the FIRST OAuth credential (SPA or MACHINE) chosen by the caller.
    // The clients service validates type-appropriate fields and mints the
    // one-time MACHINE secret. No <=1-per-type check needed: the app is brand new.
    // When no credential is supplied, the app is created as an EMPTY container;
    // credentials are added later on the Credentials tab.
    let client: Awaited<ReturnType<typeof this.clientsService.createClientRow>>['client'] | null = null;
    let plaintextSecret: string | undefined;
    if (data.client) {
      const created = await this.clientsService.createClientRow(
        app.id,
        data.client,
        data.clientId,
      );
      client = created.client;
      plaintextSecret = created.plaintextSecret;
    }

    // Auto-create "Free" license type for FREE-mode apps
    if ((data.licensingMode || 'FREE') === 'FREE') {
      const freeLicenseType = await this.prisma.licenseType.create({
        data: {
          name: 'Free',
          slug: 'free',
          description: 'Free tier - all members have access',
          applicationId: app.id,
          features: {},
          displayOrder: 0,
          status: 'ACTIVE',
          maxMembers: null,
        },
      });

      await this.prisma.application.update({
        where: { id: app.id },
        data: {
          defaultLicenseTypeId: freeLicenseType.id,
          autoProvisionOnSignup: true,
        },
      });
    }

    // Dispatch application.created event
    this.systemWebhookService.dispatch(
      'application.created' as any,
      buildApplicationCreatedPayload(app, client),
    ).catch((err) => this.logger.warn(`Failed to dispatch application.created event: ${err.message}`));

    // Return the container + clients[] plus the one-time MACHINE secret (if any).
    const appWithClients = await this.loadAppWithClients(app.id);
    return { ...appWithClients, clientSecret: plaintextSecret };
  }

  /**
   * Update an application
   */
  async updateApplication(
    applicationId: string,
    data: {
      name?: string;
      description?: string;
      isActive?: boolean;
      availableFeatures?: Array<{ key: string; name: string; description?: string }>;
      allowMixedLicensing?: boolean;
      licensingMode?: 'FREE' | 'PER_SEAT' | 'TENANT_WIDE';
      accessMode?: AccessMode;
      defaultLicenseTypeId?: string;
      defaultSeatCount?: number;
      autoProvisionOnSignup?: boolean;
      autoGrantToOwner?: boolean;
      brandingName?: string;
      brandingLogoUrl?: string;
      brandingIconUrl?: string;
      brandingPrimaryColor?: string;
      brandingBackgroundColor?: string;
      brandingAccentColor?: string;
      brandingSupportUrl?: string;
      brandingPrivacyUrl?: string;
      brandingTermsUrl?: string;
      webhookUrl?: string | null;
      webhookEnabled?: boolean;
      webhookEvents?: string[];
    },
  ) {
    // Container-level update ONLY. Credential fields (redirect URIs, TTLs, M2M
    // authz) are managed via the /applications/:id/clients endpoints — this is
    // the explicit multi-credential model that replaced the sole-client flatten.
    const app = await this.prisma.application.findUnique({
      where: { id: applicationId },
    });

    if (!app || app.slug === INTERNAL_APP_SLUG) {
      throw new NotFoundException('Application not found');
    }

    // Validate branding + webhook URLs for security
    validateBrandingUrls([
      { name: 'brandingLogoUrl', value: data.brandingLogoUrl },
      { name: 'brandingIconUrl', value: data.brandingIconUrl },
      { name: 'brandingSupportUrl', value: data.brandingSupportUrl },
      { name: 'brandingPrivacyUrl', value: data.brandingPrivacyUrl },
      { name: 'brandingTermsUrl', value: data.brandingTermsUrl },
      { name: 'webhookUrl', value: data.webhookUrl },
    ]);

    // Validate auto-provision settings
    const autoProvisionOnSignup = data.autoProvisionOnSignup ?? app.autoProvisionOnSignup;
    const defaultLicenseTypeId = data.defaultLicenseTypeId ?? app.defaultLicenseTypeId;

    if (autoProvisionOnSignup && !defaultLicenseTypeId) {
      throw new BadRequestException(
        'A default license type is required when auto-provision on signup is enabled',
      );
    }

    // Validate default license type exists if provided
    if (data.defaultLicenseTypeId) {
      const licenseType = await this.prisma.licenseType.findUnique({
        where: { id: data.defaultLicenseTypeId },
      });
      if (!licenseType) {
        throw new NotFoundException(
          `Default license type with ID "${data.defaultLicenseTypeId}" not found`,
        );
      }
    }

    const result = await this.prisma.application.update({
      where: { id: applicationId },
      data,
    });

    // Build changed_fields / previous_values from the container diff.
    const changedFields: string[] = [];
    const previousValues: Record<string, unknown> = {};
    const trackChange = (key: string, next: unknown, prev: unknown) => {
      if (next !== undefined && next !== prev) {
        changedFields.push(key);
        previousValues[key] = prev;
      }
    };
    trackChange('name', data.name, app.name);
    trackChange('description', data.description, app.description);
    trackChange('is_active', data.isActive, app.isActive);
    trackChange('licensing.mode', data.licensingMode, app.licensingMode);
    trackChange('access_mode', data.accessMode, app.accessMode);
    trackChange('webhook_url', data.webhookUrl, app.webhookUrl);
    trackChange('webhook_enabled', data.webhookEnabled, app.webhookEnabled);

    if (changedFields.length > 0) {
      const firstClient = await this.prisma.applicationClient.findFirst({
        where: { applicationId },
        orderBy: { createdAt: 'asc' },
        select: { clientId: true },
      });
      this.systemWebhookService.dispatch(
        'application.updated' as any,
        buildApplicationUpdatedPayload({
          applicationId,
          result,
          clientId: firstClient?.clientId,
          changedFields,
          previousValues,
        }),
      ).catch((err) => this.logger.warn(`Failed to dispatch application.updated event: ${err.message}`));
    }

    return this.loadAppWithClients(applicationId);
  }

  /**
   * Delete an application (must be disabled first)
   */
  async deleteApplication(applicationId: string) {
    const app = await this.prisma.application.findUnique({
      where: { id: applicationId },
    });

    if (!app || app.slug === INTERNAL_APP_SLUG) {
      throw new NotFoundException('Application not found');
    }

    if (app.isActive) {
      throw new BadRequestException(
        'Application must be disabled before it can be deleted. Disable the application first.',
      );
    }

    // Representative credential id for the deleted webhook (metadata only).
    const client = await this.firstClient(applicationId);

    await this.prisma.$transaction(async (tx) => {
      // Revoke all refresh tokens (scoped via the client relation)
      await tx.refreshToken.updateMany({
        where: { applicationClient: { applicationId } },
        data: { revoked: true, revokedAt: new Date() },
      });

      // Delete authorization codes
      await tx.authorizationCode.deleteMany({
        where: { applicationClient: { applicationId } },
      });

      // Delete orphaned AppAccess records (no cascade relation exists)
      await tx.appAccess.deleteMany({
        where: { applicationId },
      });

      // Delete the application (Prisma cascade handles clients, roles,
      // license types, subscriptions)
      await tx.application.delete({ where: { id: applicationId } });
    });

    this.logger.log(`Application "${app.name}" (${applicationId}) deleted with all associated data`);

    // Dispatch application.deleted event
    this.systemWebhookService.dispatch(
      'application.deleted' as any,
      buildApplicationDeletedPayload(app, applicationId, client?.clientId),
    ).catch((err) => this.logger.warn(`Failed to dispatch application.deleted event: ${err.message}`));

    return { success: true, message: 'Application deleted' };
  }

  /**
   * Disable an application - prevents new logins and revokes active sessions
   */
  async disableApplication(applicationId: string) {
    const app = await this.prisma.application.findUnique({
      where: { id: applicationId },
    });

    if (!app || app.slug === INTERNAL_APP_SLUG) {
      throw new NotFoundException('Application not found');
    }

    if (!app.isActive) {
      throw new BadRequestException('Application is already disabled');
    }

    const client = await this.firstClient(applicationId);

    const revokedCount = await this.prisma.$transaction(async (tx) => {
      // Revoke tokens FIRST (before setting isActive=false) to close TOCTOU window
      const revoked = await tx.refreshToken.updateMany({
        where: { applicationClient: { applicationId }, revoked: false },
        data: { revoked: true, revokedAt: new Date() },
      });

      // Then disable the application
      await tx.application.update({
        where: { id: applicationId },
        data: { isActive: false },
      });

      return revoked;
    });

    this.logger.log(
      `Application "${app.name}" (${applicationId}) disabled. Revoked ${revokedCount.count} active sessions.`,
    );

    // Dispatch webhook (using app loaded before transaction — only isActive changed)
    this.systemWebhookService.dispatch(
      'application.updated' as any,
      buildApplicationStatusChangedPayload(app, client?.clientId, false),
    ).catch((err) => this.logger.warn(`Failed to dispatch application.updated event: ${err.message}`));

    return {
      success: true,
      message: `Application "${app.name}" has been disabled. ${revokedCount.count} active sessions were revoked.`,
      revokedSessions: revokedCount.count,
    };
  }

  /**
   * Enable a previously disabled application
   */
  async enableApplication(applicationId: string) {
    const app = await this.prisma.application.findUnique({
      where: { id: applicationId },
    });

    if (!app || app.slug === INTERNAL_APP_SLUG) {
      throw new NotFoundException('Application not found');
    }

    if (app.isActive) {
      throw new BadRequestException('Application is already active');
    }

    const result = await this.prisma.application.update({
      where: { id: applicationId },
      data: { isActive: true },
    });

    this.logger.log(`Application "${app.name}" (${applicationId}) re-enabled.`);

    const client = await this.firstClient(applicationId);

    // Dispatch webhook
    this.systemWebhookService.dispatch(
      'application.updated' as any,
      buildApplicationStatusChangedPayload(result, client?.clientId, true),
    ).catch((err) => this.logger.warn(`Failed to dispatch application.updated event: ${err.message}`));

    return {
      success: true,
      message: `Application "${app.name}" has been re-enabled.`,
    };
  }

  // ===========================================================================
  // CREDENTIAL MANAGEMENT (Delegates to AdminApplicationClientsService)
  // ===========================================================================
  // Secret + M2M-grant management now targets a specific credential by clientId
  // rather than the app. See AdminApplicationClientsService.

  // ===========================================================================
  // ROLE MANAGEMENT (Delegates to AdminRolesService)
  // ===========================================================================

  getApplicationRoles(applicationId: string) {
    return this.rolesService.getApplicationRoles(applicationId);
  }

  createRole(
    applicationId: string,
    name: string,
    slug: string,
    description?: string,
    isDefault?: boolean,
  ) {
    return this.rolesService.createRole(applicationId, name, slug, description, isDefault);
  }

  updateRole(
    roleId: string,
    data: { name?: string; slug?: string; description?: string; isDefault?: boolean },
  ) {
    return this.rolesService.updateRole(roleId, data);
  }

  setDefaultRole(roleId: string) {
    return this.rolesService.setDefaultRole(roleId);
  }

  deleteRole(roleId: string) {
    return this.rolesService.deleteRole(roleId);
  }
}
