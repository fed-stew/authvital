import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminRolesService } from './admin-roles.service';
import { SystemWebhookService } from '../../webhooks/system-webhook.service';
import { AccessMode } from '@prisma/client';
import {
  validateRedirectUriPattern,
  validateRedirectUriPatterns,
  validateSafeUrl,
} from '../../common/utils/url-validation.utils';

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
    private readonly systemWebhookService: SystemWebhookService,
  ) {}

  // ===========================================================================
  // APPLICATION CRUD
  // ===========================================================================

  /**
   * Get all applications in the instance
   */
  async getApplications() {
    const applications = await this.prisma.application.findMany({
      include: {
        _count: {
          select: { roles: true, licenseTypes: true },
        },
        roles: {
          select: {
            id: true,
            name: true,
            slug: true,
            description: true,
            isDefault: true,
          },
          orderBy: { name: 'asc' },
        },
        licenseTypes: {
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
            features: true,
            displayOrder: true,
          },
          orderBy: { displayOrder: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });

    return applications.map((app) => ({
      id: app.id,
      name: app.name,
      slug: app.slug,
      description: app.description,
      clientId: app.clientId,
      hasClientSecret: !!app.clientSecret,
      redirectUris: app.redirectUris,
      postLogoutRedirectUri: app.postLogoutRedirectUris[0] || undefined,
      accessTokenTtl: app.accessTokenTtl,
      refreshTokenTtl: app.refreshTokenTtl,
      isActive: app.isActive,
      createdAt: app.createdAt,
      availableFeatures: app.availableFeatures as Array<{
        key: string;
        name: string;
        description?: string;
      }>,
      allowMixedLicensing: app.allowMixedLicensing,
      brandingName: app.brandingName,
      brandingLogoUrl: app.brandingLogoUrl,
      brandingIconUrl: app.brandingIconUrl,
      brandingPrimaryColor: app.brandingPrimaryColor,
      brandingBackgroundColor: app.brandingBackgroundColor,
      brandingAccentColor: app.brandingAccentColor,
      brandingSupportUrl: app.brandingSupportUrl,
      brandingPrivacyUrl: app.brandingPrivacyUrl,
      brandingTermsUrl: app.brandingTermsUrl,
      initiateLoginUri: app.initiateLoginUri,
      licensingMode: app.licensingMode,
      accessMode: app.accessMode,
      defaultLicenseTypeId: app.defaultLicenseTypeId,
      defaultSeatCount: app.defaultSeatCount,
      autoProvisionOnSignup: app.autoProvisionOnSignup,
      autoGrantToOwner: app.autoGrantToOwner,
      webhookUrl: app.webhookUrl,
      webhookEnabled: app.webhookEnabled,
      webhookEvents: app.webhookEvents,
      licenseTypeCount: app._count.licenseTypes,
      licenseTypes: app.licenseTypes.map((licenseType) => ({
        id: licenseType.id,
        name: licenseType.name,
        slug: licenseType.slug,
        status: licenseType.status,
        features: licenseType.features as Record<string, boolean>,
        displayOrder: licenseType.displayOrder,
      })),
      roleCount: app._count.roles,
      roles: app.roles.map((r) => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        description: r.description,
        isDefault: r.isDefault,
      })),
    }));
  }

  /**
   * Get a single application by ID
   */
  async getApplication(applicationId: string) {
    const app = await this.prisma.application.findUnique({
      where: { id: applicationId },
      include: {
        roles: {
          orderBy: { name: 'asc' },
        },
        licenseTypes: {
          orderBy: { displayOrder: 'asc' },
        },
      },
    });

    if (!app) {
      throw new NotFoundException('Application not found');
    }

    return app;
  }

  /**
   * Create a new application
   */
  async createApplication(data: {
    name: string;
    clientId?: string;
    description?: string;
    redirectUris?: string[];
    postLogoutRedirectUri?: string;
    initiateLoginUri?: string;
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
  }) {
    // Validate redirect URIs for security
    if (data.redirectUris?.length) {
      const result = validateRedirectUriPatterns(data.redirectUris);
      if (!result.valid) {
        throw new BadRequestException(result.error);
      }
    }

    // Validate post-logout redirect URI for security
    if (data.postLogoutRedirectUri) {
      const result = validateRedirectUriPattern(data.postLogoutRedirectUri);
      if (!result.valid) {
        throw new BadRequestException(result.error);
      }
    }

    // Validate branding URLs for security
    const brandingUrlFields: { name: string; value: string | undefined }[] = [
      { name: 'brandingLogoUrl', value: data.brandingLogoUrl },
      { name: 'brandingIconUrl', value: data.brandingIconUrl },
      { name: 'brandingSupportUrl', value: data.brandingSupportUrl },
      { name: 'brandingPrivacyUrl', value: data.brandingPrivacyUrl },
      { name: 'brandingTermsUrl', value: data.brandingTermsUrl },
      { name: 'initiateLoginUri', value: data.initiateLoginUri },
    ];

    for (const { name, value } of brandingUrlFields) {
      if (value) {
        const result = validateSafeUrl(value);
        if (!result.valid) {
          throw new BadRequestException(result.error);
        }
      }
    }

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
        clientId: data.clientId || undefined,
        description: data.description,
        redirectUris: data.redirectUris || [],
        postLogoutRedirectUris: data.postLogoutRedirectUri ? [data.postLogoutRedirectUri] : [],
        initiateLoginUri: data.initiateLoginUri,
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
    this.systemWebhookService.dispatch('application.created' as any, {
      application_id: app.id,
      tenant_id: null,
      name: app.name,
      description: app.description,
      slug: app.slug,
      client_id: app.clientId,
      application_type: app.accessMode,
      is_active: true,
      created_at: app.createdAt.toISOString(),
      config: {
        redirect_uris: app.redirectUris,
        post_logout_redirect_uris: app.postLogoutRedirectUris,
        initiate_login_uri: app.initiateLoginUri,
        access_token_ttl_seconds: app.accessTokenTtl,
        refresh_token_ttl_seconds: app.refreshTokenTtl,
      },
      licensing: {
        mode: app.licensingMode,
        allow_mixed: app.allowMixedLicensing,
        default_seat_count: app.defaultSeatCount,
        auto_provision_on_signup: app.autoProvisionOnSignup,
        auto_grant_to_owner: app.autoGrantToOwner,
      },
    }).catch((err) => this.logger.warn(`Failed to dispatch application.created event: ${err.message}`));

    return {
      id: app.id,
      name: app.name,
      slug: app.slug,
      clientId: app.clientId,
      redirectUris: app.redirectUris,
      postLogoutRedirectUri: app.postLogoutRedirectUris[0] || undefined,
      initiateLoginUri: app.initiateLoginUri,
      licensingMode: app.licensingMode,
      defaultLicenseTypeId: app.defaultLicenseTypeId,
      defaultSeatCount: app.defaultSeatCount,
      autoProvisionOnSignup: app.autoProvisionOnSignup,
      autoGrantToOwner: app.autoGrantToOwner,
      brandingName: app.brandingName,
      brandingLogoUrl: app.brandingLogoUrl,
      brandingIconUrl: app.brandingIconUrl,
      brandingPrimaryColor: app.brandingPrimaryColor,
      brandingBackgroundColor: app.brandingBackgroundColor,
      brandingAccentColor: app.brandingAccentColor,
      brandingSupportUrl: app.brandingSupportUrl,
      brandingPrivacyUrl: app.brandingPrivacyUrl,
      brandingTermsUrl: app.brandingTermsUrl,
    };
  }

  /**
   * Update an application
   */
  async updateApplication(
    applicationId: string,
    data: {
      name?: string;
      description?: string;
      redirectUris?: string[];
      postLogoutRedirectUri?: string;
      initiateLoginUri?: string;
      accessTokenTtl?: number;
      refreshTokenTtl?: number;
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
    const app = await this.prisma.application.findUnique({
      where: { id: applicationId },
    });

    if (!app) {
      throw new NotFoundException('Application not found');
    }

    // Validate redirect URIs for security
    if (data.redirectUris?.length) {
      const result = validateRedirectUriPatterns(data.redirectUris);
      if (!result.valid) {
        throw new BadRequestException(result.error);
      }
    }

    // Validate post-logout redirect URI for security
    if (data.postLogoutRedirectUri) {
      const result = validateRedirectUriPattern(data.postLogoutRedirectUri);
      if (!result.valid) {
        throw new BadRequestException(result.error);
      }
    }

    // Validate branding URLs for security
    const brandingUrlFields: { name: string; value: string | null | undefined }[] = [
      { name: 'brandingLogoUrl', value: data.brandingLogoUrl },
      { name: 'brandingIconUrl', value: data.brandingIconUrl },
      { name: 'brandingSupportUrl', value: data.brandingSupportUrl },
      { name: 'brandingPrivacyUrl', value: data.brandingPrivacyUrl },
      { name: 'brandingTermsUrl', value: data.brandingTermsUrl },
      { name: 'initiateLoginUri', value: data.initiateLoginUri },
      { name: 'webhookUrl', value: data.webhookUrl },
    ];

    for (const { name, value } of brandingUrlFields) {
      if (value) {
        const result = validateSafeUrl(value);
        if (!result.valid) {
          throw new BadRequestException(result.error);
        }
      }
    }

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

    // Convert postLogoutRedirectUri to array for storage
    const updateData: Record<string, unknown> = { ...data };
    if (data.postLogoutRedirectUri !== undefined) {
      updateData.postLogoutRedirectUris = data.postLogoutRedirectUri
        ? [data.postLogoutRedirectUri]
        : [];
      delete updateData.postLogoutRedirectUri;
    }

    const result = await this.prisma.application.update({
      where: { id: applicationId },
      data: updateData,
    });

    // Build changed_fields and previous_values from the diff
    const changedFields: string[] = [];
    const previousValues: Record<string, unknown> = {};

    if (data.name !== undefined && data.name !== app.name) {
      changedFields.push('name');
      previousValues.name = app.name;
    }
    if (data.description !== undefined && data.description !== app.description) {
      changedFields.push('description');
      previousValues.description = app.description;
    }
    if (data.redirectUris !== undefined) {
      changedFields.push('config.redirect_uris');
      previousValues['config.redirect_uris'] = app.redirectUris;
    }
    if (data.postLogoutRedirectUri !== undefined) {
      changedFields.push('config.post_logout_redirect_uris');
      previousValues['config.post_logout_redirect_uris'] = app.postLogoutRedirectUris;
    }
    if (data.initiateLoginUri !== undefined && data.initiateLoginUri !== app.initiateLoginUri) {
      changedFields.push('config.initiate_login_uri');
      previousValues['config.initiate_login_uri'] = app.initiateLoginUri;
    }
    if (data.accessTokenTtl !== undefined && data.accessTokenTtl !== app.accessTokenTtl) {
      changedFields.push('config.access_token_ttl_seconds');
      previousValues['config.access_token_ttl_seconds'] = app.accessTokenTtl;
    }
    if (data.refreshTokenTtl !== undefined && data.refreshTokenTtl !== app.refreshTokenTtl) {
      changedFields.push('config.refresh_token_ttl_seconds');
      previousValues['config.refresh_token_ttl_seconds'] = app.refreshTokenTtl;
    }
    if (data.isActive !== undefined && data.isActive !== app.isActive) {
      changedFields.push('is_active');
      previousValues.is_active = app.isActive;
    }
    if (data.licensingMode !== undefined && data.licensingMode !== app.licensingMode) {
      changedFields.push('licensing.mode');
      previousValues['licensing.mode'] = app.licensingMode;
    }
    if (data.accessMode !== undefined && data.accessMode !== app.accessMode) {
      changedFields.push('access_mode');
      previousValues.access_mode = app.accessMode;
    }
    if (data.webhookUrl !== undefined && data.webhookUrl !== app.webhookUrl) {
      changedFields.push('webhook_url');
      previousValues.webhook_url = app.webhookUrl;
    }
    if (data.webhookEnabled !== undefined && data.webhookEnabled !== app.webhookEnabled) {
      changedFields.push('webhook_enabled');
      previousValues.webhook_enabled = app.webhookEnabled;
    }

    if (changedFields.length > 0) {
      this.systemWebhookService.dispatch('application.updated' as any, {
        application_id: applicationId,
        tenant_id: null,
        name: result.name,
        description: result.description,
        slug: result.slug,
        client_id: result.clientId,
        application_type: result.accessMode,
        is_active: result.isActive,
        changed_fields: changedFields,
        previous_values: previousValues,
        config: {
          redirect_uris: result.redirectUris,
          post_logout_redirect_uris: result.postLogoutRedirectUris,
          initiate_login_uri: result.initiateLoginUri,
          access_token_ttl_seconds: result.accessTokenTtl,
          refresh_token_ttl_seconds: result.refreshTokenTtl,
        },
        licensing: {
          mode: result.licensingMode,
          allow_mixed: result.allowMixedLicensing,
          default_seat_count: result.defaultSeatCount,
          auto_provision_on_signup: result.autoProvisionOnSignup,
          auto_grant_to_owner: result.autoGrantToOwner,
        },
      }).catch((err) => this.logger.warn(`Failed to dispatch application.updated event: ${err.message}`));
    }

    return result;
  }

  /**
   * Delete an application (must be disabled first)
   */
  async deleteApplication(applicationId: string) {
    const app = await this.prisma.application.findUnique({
      where: { id: applicationId },
    });

    if (!app) {
      throw new NotFoundException('Application not found');
    }

    if (app.isActive) {
      throw new BadRequestException(
        'Application must be disabled before it can be deleted. Disable the application first.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      // Revoke all refresh tokens
      await tx.refreshToken.updateMany({
        where: { applicationId },
        data: { revoked: true, revokedAt: new Date() },
      });

      // Delete authorization codes
      await tx.authorizationCode.deleteMany({
        where: { applicationId },
      });

      // Delete orphaned AppAccess records (no cascade relation exists)
      await tx.appAccess.deleteMany({
        where: { applicationId },
      });

      // Delete the application (Prisma cascade handles roles, license types, subscriptions)
      await tx.application.delete({ where: { id: applicationId } });
    });

    this.logger.log(`Application "${app.name}" (${applicationId}) deleted with all associated data`);

    // Dispatch application.deleted event
    this.systemWebhookService.dispatch('application.deleted' as any, {
      application_id: applicationId,
      tenant_id: null,
      name: app.name,
      slug: app.slug,
      client_id: app.clientId,
      deleted_at: new Date().toISOString(),
    }).catch((err) => this.logger.warn(`Failed to dispatch application.deleted event: ${err.message}`));

    return { success: true, message: 'Application deleted' };
  }

  /**
   * Disable an application - prevents new logins and revokes active sessions
   */
  async disableApplication(applicationId: string) {
    const app = await this.prisma.application.findUnique({
      where: { id: applicationId },
    });

    if (!app) {
      throw new NotFoundException('Application not found');
    }

    if (!app.isActive) {
      throw new BadRequestException('Application is already disabled');
    }

    const revokedCount = await this.prisma.$transaction(async (tx) => {
      // Revoke tokens FIRST (before setting isActive=false) to close TOCTOU window
      const revoked = await tx.refreshToken.updateMany({
        where: { applicationId, revoked: false },
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
    this.systemWebhookService.dispatch('application.updated' as any, {
      application_id: applicationId,
      tenant_id: null,
      name: app.name,
      description: app.description,
      slug: app.slug,
      client_id: app.clientId,
      application_type: app.accessMode,
      is_active: false,
      changed_fields: ['is_active'],
      previous_values: { is_active: true },
    }).catch((err) => this.logger.warn(`Failed to dispatch application.updated event: ${err.message}`));

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

    if (!app) {
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

    // Dispatch webhook
    this.systemWebhookService.dispatch('application.updated' as any, {
      application_id: applicationId,
      tenant_id: null,
      name: result.name,
      description: result.description,
      slug: result.slug,
      client_id: result.clientId,
      application_type: result.accessMode,
      is_active: true,
      changed_fields: ['is_active'],
      previous_values: { is_active: false },
    }).catch((err) => this.logger.warn(`Failed to dispatch application.updated event: ${err.message}`));

    return {
      success: true,
      message: `Application "${app.name}" has been re-enabled.`,
    };
  }

  // ===========================================================================
  // CLIENT SECRET MANAGEMENT
  // ===========================================================================

  /**
   * Generate or regenerate client secret for any application
   */
  async regenerateClientSecret(applicationId: string): Promise<string> {
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
   * Revoke client secret for an application
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
