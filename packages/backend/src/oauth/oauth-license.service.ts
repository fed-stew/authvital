import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface LicenseInfo {
  type: string;
  name: string;
  features: string[];
}

interface ApplicationConfig {
  id: string;
  licensingMode?: string | null;
}

/**
 * Handles license information retrieval for OAuth tokens.
 *
 * Supports multiple licensing modes:
 * - FREE: No license restrictions
 * - TENANT_WIDE: License applies to entire tenant
 * - PER_SEAT: License assigned per user
 */
@Injectable()
export class OAuthLicenseService {
  private readonly logger = new Logger(OAuthLicenseService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Fetch license information for a user/tenant/application
   */
  async fetchLicenseInfo(
    userId: string,
    tenantId: string,
    application: ApplicationConfig,
  ): Promise<LicenseInfo | null> {
    try {
      if (
        application.licensingMode === 'FREE' ||
        application.licensingMode === 'TENANT_WIDE'
      ) {
        return this.fetchTenantWideLicense(tenantId, application.id);
      } else if (application.licensingMode === 'PER_SEAT') {
        return this.fetchPerSeatLicense(userId, tenantId, application.id);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to fetch license info for JWT: ${errorMessage}`);
    }

    return null;
  }

  /**
   * Fetch tenant-wide license (FREE or TENANT_WIDE mode)
   */
  private async fetchTenantWideLicense(
    tenantId: string,
    applicationId: string,
  ): Promise<LicenseInfo | null> {
    const subscription = await this.prisma.appSubscription.findFirst({
      where: {
        tenantId,
        applicationId,
        status: { in: ['ACTIVE', 'TRIALING'] },
      },
      include: { licenseType: true },
      orderBy: { licenseType: { displayOrder: 'desc' } },
    });

    if (!subscription) {
      return null;
    }

    return this.extractLicenseInfo(subscription.licenseType);
  }

  /**
   * Fetch per-seat license (PER_SEAT mode)
   */
  private async fetchPerSeatLicense(
    userId: string,
    tenantId: string,
    applicationId: string,
  ): Promise<LicenseInfo | null> {
    const licenseAssignment = await this.prisma.licenseAssignment.findUnique({
      where: {
        tenantId_userId_applicationId: {
          tenantId,
          userId,
          applicationId,
        },
      },
      include: {
        subscription: {
          include: { licenseType: true },
        },
      },
    });

    if (
      !licenseAssignment ||
      !['ACTIVE', 'TRIALING'].includes(licenseAssignment.subscription.status)
    ) {
      return null;
    }

    return this.extractLicenseInfo(licenseAssignment.subscription.licenseType);
  }

  /**
   * Extract license info from a license type record
   */
  private extractLicenseInfo(licenseType: {
    slug: string;
    name: string;
    features: unknown;
  }): LicenseInfo {
    const features = Object.entries(
      licenseType.features as Record<string, boolean>,
    )
      .filter(([_, enabled]) => enabled === true)
      .map(([key]) => key);

    return {
      type: licenseType.slug,
      name: licenseType.name,
      features,
    };
  }
}
