import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LicensePoolService } from './license-pool.service';
import { LicenseAssignmentService } from './license-assignment.service';
import { AppAccessService } from '../../authorization';
import { LicensingMode, AccessType } from '@prisma/client';

/**
 * LicenseProvisioningService - The Onboarding Fairy 🧚
 * 
 * Handles automatic license provisioning when tenants sign up.
 * Creates subscriptions and optionally grants licenses based on app configuration.
 */
@Injectable()
export class LicenseProvisioningService {
  private readonly logger = new Logger(LicenseProvisioningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly licensePoolService: LicensePoolService,
    private readonly licenseAssignmentService: LicenseAssignmentService,
    private readonly appAccessService: AppAccessService,
  ) {}

  /**
   * Provision licenses for a newly created tenant
   * Called after tenant creation during signup flow
   * 
   * @param tenantId - The newly created tenant ID
   * @param ownerId - The tenant owner's user ID
   * @param selectedLicenseTypeId - User's selected license type
   * @param applicationId - The application context for provisioning
   */
  async provisionForNewTenant(
    tenantId: string,
    ownerId: string,
    selectedLicenseTypeId: string,
    applicationId: string,
  ): Promise<void> {
    this.logger.log(`Provisioning selected license type for app ${applicationId}`);

    // Fetch the application
    const app = await this.prisma.application.findUnique({
      where: { id: applicationId, isActive: true },
      include: { defaultLicenseType: true },
    });

    if (!app) {
      throw new Error(`Application ${applicationId} not found`);
    }

    // Verify the selected license type exists for this app
    const licenseType = await this.prisma.licenseType.findFirst({
      where: {
        id: selectedLicenseTypeId,
        applicationId,
        status: 'ACTIVE',
      },
    });

    if (!licenseType) {
      throw new Error(`License type ${selectedLicenseTypeId} not found for app ${applicationId}`);
    }

    await this.provisionAppForTenant(
      { ...app, defaultLicenseTypeId: selectedLicenseTypeId },
      tenantId,
      ownerId,
    );
  }

  /**
   * Provision a specific app for a tenant
   */
  private async provisionAppForTenant(
    app: {
      id: string;
      name: string;
      licensingMode: LicensingMode;
      defaultLicenseTypeId: string | null;
      defaultSeatCount: number;
      autoGrantToOwner: boolean;
    },
    tenantId: string,
    ownerId: string,
  ): Promise<void> {
    if (!app.defaultLicenseTypeId) {
      this.logger.warn(`App ${app.name} has no default license type, skipping`);
      return;
    }

    this.logger.log(`Provisioning ${app.name} (${app.licensingMode}) for tenant ${tenantId}`);

    // Determine quantity based on licensing mode
    // For FREE/TENANT_WIDE: quantity represents member limit (or 1 if no limit)
    // For PER_SEAT: quantity is defaultSeatCount
    const quantity = (app.licensingMode === 'FREE' || app.licensingMode === 'TENANT_WIDE') ? 1 : app.defaultSeatCount;

    // Create subscription (far future expiry for free tiers)
    const subscription = await this.licensePoolService.provisionSubscription({
      tenantId,
      applicationId: app.id,
      licenseTypeId: app.defaultLicenseTypeId,
      quantityPurchased: quantity,
      currentPeriodEnd: this.getDefaultPeriodEnd(),
    });

    this.logger.log(`Created subscription ${subscription.id} for ${app.name}`);

    // Grant access to owner for FREE/TENANT_WIDE apps
    // (PER_SEAT is handled by licenseAssignmentService.grantLicense which creates AppAccess)
    if (app.licensingMode === 'FREE' || app.licensingMode === 'TENANT_WIDE') {
      try {
        await this.appAccessService.grantAccess({
          tenantId,
          userId: ownerId,
          applicationId: app.id,
          accessType: AccessType.AUTO_OWNER, // Owner access is special
        });
        this.logger.log(`Granted ${app.licensingMode} access to owner ${ownerId} for ${app.name}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(`Failed to grant access to owner: ${errorMessage}`);
      }
    }

    // For PER_SEAT mode with autoGrantToOwner, assign a seat to the owner
    if (app.licensingMode === 'PER_SEAT' && app.autoGrantToOwner) {
      try {
        await this.licenseAssignmentService.grantLicense({
          tenantId,
          userId: ownerId,
          applicationId: app.id,
          licenseTypeId: app.defaultLicenseTypeId,
        });
        this.logger.log(`Granted license to owner ${ownerId} for ${app.name}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(`Failed to grant license to owner: ${errorMessage}`);
      }
    }
    // For TENANT_WIDE mode, no individual assignment needed - all members have access
  }

  /**
   * Get default subscription period end (100 years for free tiers)
   */
  private getDefaultPeriodEnd(): Date {
    const date = new Date();
    date.setFullYear(date.getFullYear() + 100);
    return date;
  }

  /**
   * Check if a tenant can add more members based on their license limits
   * Returns the limit info or throws if limit exceeded
   */
  async checkMemberLimit(tenantId: string, applicationId?: string): Promise<{
    allowed: boolean;
    currentCount: number;
    maxAllowed: number | null;
    reason?: string;
  }> {
    // Get current member count
    const currentCount = await this.prisma.membership.count({
      where: { tenantId, status: { in: ['ACTIVE', 'INVITED'] } },
    });

    // If applicationId is provided, verify it exists
    if (applicationId) {
      const application = await this.prisma.application.findUnique({
        where: { id: applicationId },
        select: { licensingMode: true },
      });

      if (!application) {
        throw new NotFoundException(`Application ${applicationId} not found`);
      }
    }

    // Get the most permissive member limit from active subscriptions
    const subscriptions = await this.prisma.appSubscription.findMany({
      where: { 
        tenantId, 
        status: { in: ['ACTIVE', 'TRIALING'] },
      },
      include: { 
        licenseType: { select: { maxMembers: true } },
        application: { select: { licensingMode: true } },
      },
    });

    // Find the highest maxMembers across all FREE/TENANT_WIDE subscriptions
    // (PER_SEAT apps don't limit total members, just licensed users)
    let maxAllowed: number | null = null;

    for (const sub of subscriptions) {
      if (sub.application.licensingMode === 'FREE' || sub.application.licensingMode === 'TENANT_WIDE') {
        const limit = sub.licenseType.maxMembers;
        if (limit === null) {
          // Unlimited - no restriction
          maxAllowed = null;
          break;
        }
        if (maxAllowed === null || limit > maxAllowed) {
          maxAllowed = limit;
        }
      }
    }

    // If no TENANT_WIDE subscriptions, no limit
    if (maxAllowed === null) {
      return { allowed: true, currentCount, maxAllowed: null };
    }

    const allowed = currentCount < maxAllowed;

    return {
      allowed,
      currentCount,
      maxAllowed,
      reason: allowed 
        ? undefined 
        : `Member limit reached (${maxAllowed}). Upgrade your plan to add more members.`,
    };
  }
}
