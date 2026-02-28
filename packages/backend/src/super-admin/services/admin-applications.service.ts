import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminRolesService } from './admin-roles.service';
import { AccessMode } from '@prisma/client';

// ===========================================================================
// URI VALIDATION HELPERS
// ===========================================================================

/**
 * Validate a redirect URI for security
 * Supports:
 * - Exact matches
 * - Wildcards only in subdomain position (e.g., http://*.example.com/callback)
 * - Tenant placeholder only in subdomain position (e.g., https://{tenant}.example.com/callback)
 */
function validateRedirectUri(uri: string): { valid: boolean; error?: string } {
  if (!uri.match(/^https?:\/\//)) {
    return { valid: false, error: `Invalid URI "${uri}": Must start with http:// or https://` };
  }

  if (uri.includes('*')) {
    const wildcardPattern = /^https?:\/\/\*\.([a-zA-Z0-9-]+\.)*[a-zA-Z0-9-]+(:\d+)?(\/.*)?$/;

    if (!wildcardPattern.test(uri)) {
      return {
        valid: false,
        error: `Invalid wildcard in "${uri}": Wildcards are only allowed in subdomain position (e.g., http://*.example.com/callback)`,
      };
    }

    const hostMatch = uri.match(/^https?:\/\/\*\.([^/]+)/);
    if (hostMatch) {
      const domainPart = hostMatch[1];
      if (!domainPart.includes('.') && !domainPart.match(/^localhost(:\d+)?$/)) {
        return {
          valid: false,
          error: `Invalid wildcard in "${uri}": Must have a valid domain after *. (e.g., *.example.com or *.localhost:3000)`,
        };
      }
    }
  }

  if (uri.includes('{tenant}')) {
    const tenantPattern = /^https?:\/\/{tenant}\.([a-zA-Z0-9-]+\.)*[a-zA-Z0-9-]+(:\d+)?(\/.*)?$/;

    if (!tenantPattern.test(uri)) {
      return {
        valid: false,
        error: `Invalid tenant placeholder in "${uri}": {tenant} is only allowed in subdomain position (e.g., https://{tenant}.example.com/callback)`,
      };
    }
  }

  try {
    const testUri = uri.replace('*', 'wildcard-test').replace('{tenant}', 'test-tenant');
    new URL(testUri);
  } catch {
    return { valid: false, error: `Invalid URI "${uri}": Not a valid URL format` };
  }

  return { valid: true };
}

function validateRedirectUris(uris: string[]): void {
  for (const uri of uris) {
    const result = validateRedirectUri(uri);
    if (!result.valid) {
      throw new BadRequestException(result.error);
    }
  }
}

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly rolesService: AdminRolesService,
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
      validateRedirectUris(data.redirectUris);
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
      validateRedirectUris(data.redirectUris);
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

    return this.prisma.application.update({
      where: { id: applicationId },
      data: updateData,
    });
  }

  /**
   * Delete an application
   */
  async deleteApplication(applicationId: string) {
    const app = await this.prisma.application.findUnique({
      where: { id: applicationId },
      include: { _count: { select: { roles: true } } },
    });

    if (!app) {
      throw new NotFoundException('Application not found');
    }

    if (app._count.roles > 0) {
      throw new ForbiddenException(
        `Cannot delete application with ${app._count.roles} roles. Remove all roles first.`,
      );
    }

    await this.prisma.application.delete({ where: { id: applicationId } });
    return { success: true, message: 'Application deleted' };
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
