import {
  Controller,
  Get,
  Param,
  Query,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InstanceService } from '../instance/instance.service';

/**
 * Signup Configuration Controller
 * Public endpoints for signup-related configuration queries
 */
@Controller('signup')
export class SignupConfigController {
  private readonly logger = new Logger(SignupConfigController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly instanceService: InstanceService,
  ) {}

  /**
   * Get public instance configuration for signup/login forms
   * PUBLIC - No authentication required
   */
  @Get('config')
  async getInstanceConfig() {
    const config = await this.instanceService.getSignupConfig();
    const branding = await this.instanceService.getBrandingConfig();

    return {
      name: branding.name,
      allowSignUp: config.allowSignUp,
      requiredUserFields: config.requiredUserFields,
      allowGenericDomains: config.allowGenericDomains,
      singleTenantMode: config.singleTenantMode,
      branding: {
        name: branding.name,
        logoUrl: branding.logoUrl,
        primaryColor: branding.primaryColor,
      },
    };
  }

  /**
   * Check if a slug is available for a new tenant
   */
  @Get('check-slug')
  async checkSlug(@Query('slug') slug: string) {
    if (!slug) {
      throw new BadRequestException('slug is required');
    }

    const normalizedSlug = slug.toLowerCase().replace(/[^a-z0-9-]/g, '');

    if (normalizedSlug.length < 2) {
      return {
        available: false,
        slug: normalizedSlug,
        reason: 'Slug must be at least 2 characters',
      };
    }

    const reserved = ['admin', 'api', 'www', 'app', 'id', 'auth', 'login', 'signup', 'register'];
    if (reserved.includes(normalizedSlug)) {
      return {
        available: false,
        slug: normalizedSlug,
        reason: 'This URL is reserved',
      };
    }

    const existingTenant = await this.prisma.tenant.findUnique({
      where: { slug: normalizedSlug },
    });

    if (existingTenant) {
      return {
        available: false,
        slug: normalizedSlug,
        reason: 'This URL is already taken',
      };
    }

    return { available: true, slug: normalizedSlug };
  }

  /**
   * Get available license types for signup (by application)
   */
  @Get('license-types/:applicationId')
  async getLicenseTypesForSignup(@Param('applicationId') applicationId: string) {
    const app = await this.prisma.application.findUnique({
      where: { id: applicationId, isActive: true },
      select: { id: true, name: true, licensingMode: true },
    });

    if (!app) {
      throw new NotFoundException('Application not found');
    }

    const licenseTypes = await this.prisma.licenseType.findMany({
      where: { applicationId, status: 'ACTIVE' },
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        features: true,
        maxMembers: true,
        displayPrice: true,
        displayOrder: true,
      },
    });

    return {
      application: { id: app.id, name: app.name, licensingMode: app.licensingMode },
      licenseTypes,
    };
  }

  /**
   * Look up application by clientId
   */
  @Get('application/:clientId')
  async getApplicationByClientId(@Param('clientId') clientId: string) {
    const app = await this.prisma.application.findUnique({
      where: { clientId, isActive: true },
      select: { id: true, clientId: true, name: true, licensingMode: true },
    });

    if (!app) {
      throw new NotFoundException('Application not found');
    }

    return { id: app.id, clientId: app.clientId, name: app.name, licensingMode: app.licensingMode };
  }

  /**
   * Get pending signup info by verification token
   */
  @Get('pending/:token')
  async getPendingSignupByToken(@Param('token') token: string) {
    const genericError = 'This link is invalid or has expired.';

    const pending = await this.prisma.pendingSignup.findUnique({
      where: { verificationToken: token },
    });

    if (!pending) {
      throw new BadRequestException(genericError);
    }

    if (pending.expiresAt && new Date() > pending.expiresAt) {
      throw new BadRequestException(genericError);
    }

    let application = null;
    if (pending.applicationId) {
      const app = await this.prisma.application.findUnique({
        where: { id: pending.applicationId, isActive: true },
        select: { id: true, name: true, clientId: true, licensingMode: true },
      });
      if (app) {
        application = app;
      }
    }

    return {
      email: pending.email,
      givenName: pending.givenName,
      familyName: pending.familyName,
      selectedLicenseTypeId: pending.selectedLicenseTypeId,
      application,
      status: pending.status,
      expiresAt: pending.expiresAt,
    };
  }

  /**
   * Get pending signups (admin endpoint)
   */
  @Get('pending-signups')
  async getPendingSignups() {
    const pendingSignups = await this.prisma.pendingSignup.findMany({
      where: { status: { in: ['PENDING', 'VERIFIED'] } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        givenName: true,
        familyName: true,
        tenantName: true,
        status: true,
        expiresAt: true,
        verifiedAt: true,
        createdAt: true,
      },
    });

    return pendingSignups;
  }
}
