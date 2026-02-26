import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessStatus } from '@prisma/client';
import {
  LicenseCheckResult,
  BulkLicenseCheckResult,
  LicenseTypeFeatures,
} from '../types/index';

/**
 * LicenseCheckService - The SDK Gateway
 *
 * This service checks if a user has access AND what their license tier is.
 *
 * Flow:
 * 1. Check AppAccess - if no active access, deny immediately
 * 2. If has access, determine license type/features from subscription
 */
@Injectable()
export class LicenseCheckService {
  constructor(private readonly prisma: PrismaService) {}

  // ===========================================================================
  // PRIMARY CHECK
  // ===========================================================================

  /**
   * Check if a user has a license for an application
   *
   * This is THE function that apps call to gate access:
   * - First checks AppAccess record (the entitlement)
   * - Then determines license tier/features from subscription
   */
  async checkLicense(
    tenantId: string,
    userId: string,
    applicationId: string,
  ): Promise<LicenseCheckResult> {
    // Step 1: Check AppAccess (the entitlement gate)
    const access = await this.prisma.appAccess.findUnique({
      where: {
        userId_tenantId_applicationId: { userId, tenantId, applicationId },
      },
      select: { status: true, accessType: true },
    });

    if (!access) {
      return {
        hasLicense: false,
        reason: 'No access granted. Contact your administrator.',
      };
    }

    if (access.status !== AccessStatus.ACTIVE) {
      return {
        hasLicense: false,
        reason:
          access.status === AccessStatus.REVOKED
            ? 'Access has been revoked.'
            : 'Access is suspended.',
      };
    }

    // Step 2: Get app licensing mode
    const app = await this.prisma.application.findUnique({
      where: { id: applicationId },
      select: { id: true, name: true, licensingMode: true },
    });

    if (!app) {
      return {
        hasLicense: false,
        reason: 'Application not found',
      };
    }

    // Step 3: Get license tier/features based on mode
    switch (app.licensingMode) {
      case 'FREE':
      case 'TENANT_WIDE':
        // For FREE/TENANT_WIDE: get subscription to know the tier
        return this.getLicenseFromSubscription(tenantId, applicationId);

      case 'PER_SEAT':
        // For PER_SEAT: get from the user's license assignment
        return this.getLicenseFromAssignment(tenantId, userId, applicationId);

      default:
        return {
          hasLicense: false,
          reason: 'Unknown licensing mode',
        };
    }
  }

  // ===========================================================================
  // BULK CHECK
  // ===========================================================================

  /**
   * Check licenses for multiple applications at once
   * Useful for dashboards that show access to multiple apps
   */
  async checkLicensesBulk(
    tenantId: string,
    userId: string,
    applicationIds: string[],
  ): Promise<BulkLicenseCheckResult> {
    const result: BulkLicenseCheckResult = {};

    // Initialize all as no access
    for (const appId of applicationIds) {
      result[appId] = {
        hasLicense: false,
        reason: 'No access granted. Contact your administrator.',
      };
    }

    // Step 1: Get all AppAccess records for this user
    const accesses = await this.prisma.appAccess.findMany({
      where: {
        tenantId,
        userId,
        applicationId: { in: applicationIds },
      },
      select: { applicationId: true, status: true },
    });

    const accessMap = new Map(accesses.map((a) => [a.applicationId, a]));

    // Filter to apps with active access
    const activeAppIds = applicationIds.filter((appId) => {
      const access = accessMap.get(appId);
      if (!access) return false;
      if (access.status !== AccessStatus.ACTIVE) {
        result[appId] = {
          hasLicense: false,
          reason:
            access.status === AccessStatus.REVOKED
              ? 'Access has been revoked.'
              : 'Access is suspended.',
        };
        return false;
      }
      return true;
    });

    if (activeAppIds.length === 0) return result;

    // Step 2: Get app licensing modes
    const apps = await this.prisma.application.findMany({
      where: { id: { in: activeAppIds } },
      select: { id: true, licensingMode: true },
    });
    const appModeMap = new Map(apps.map((a) => [a.id, a.licensingMode]));

    // Separate by mode
    const perSeatAppIds = activeAppIds.filter(
      (id) => appModeMap.get(id) === 'PER_SEAT',
    );
    const tenantWideAppIds = activeAppIds.filter((id) => {
      const mode = appModeMap.get(id);
      return mode === 'FREE' || mode === 'TENANT_WIDE';
    });

    // Step 3: Get license info for PER_SEAT apps
    if (perSeatAppIds.length > 0) {
      const assignments = await this.prisma.licenseAssignment.findMany({
        where: {
          tenantId,
          userId,
          applicationId: { in: perSeatAppIds },
        },
        include: {
          subscription: {
            include: {
              licenseType: {
                select: { slug: true, name: true, features: true },
              },
            },
          },
        },
      });

      for (const assignment of assignments) {
        const sub = assignment.subscription;
        if (!['ACTIVE', 'TRIALING'].includes(sub.status)) {
          result[assignment.applicationId] = {
            hasLicense: false,
            reason: 'Subscription is no longer active',
          };
          continue;
        }

        result[assignment.applicationId] = {
          hasLicense: true,
          licenseType: sub.licenseType.slug,
          licenseTypeName: sub.licenseType.name,
          features: (sub.licenseType.features as LicenseTypeFeatures) || {},
        };
      }
    }

    // Step 4: Get license info for FREE/TENANT_WIDE apps
    if (tenantWideAppIds.length > 0) {
      const subscriptions = await this.prisma.appSubscription.findMany({
        where: {
          tenantId,
          applicationId: { in: tenantWideAppIds },
          status: { in: ['ACTIVE', 'TRIALING'] },
        },
        include: {
          licenseType: {
            select: { slug: true, name: true, features: true },
          },
        },
        orderBy: { licenseType: { displayOrder: 'desc' } },
      });

      for (const sub of subscriptions) {
        if (!result[sub.applicationId]?.hasLicense) {
          result[sub.applicationId] = {
            hasLicense: true,
            licenseType: sub.licenseType.slug,
            licenseTypeName: sub.licenseType.name,
            features: (sub.licenseType.features as LicenseTypeFeatures) || {},
          };
        }
      }
    }

    return result;
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  /**
   * Get license info from tenant subscription (for FREE/TENANT_WIDE)
   */
  private async getLicenseFromSubscription(
    tenantId: string,
    applicationId: string,
  ): Promise<LicenseCheckResult> {
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
      return {
        hasLicense: false,
        reason:
          'Tenant does not have an active subscription for this application',
      };
    }

    return {
      hasLicense: true,
      licenseType: subscription.licenseType.slug,
      licenseTypeName: subscription.licenseType.name,
      features:
        (subscription.licenseType.features as Record<string, boolean>) || {},
    };
  }

  /**
   * Get license info from user's seat assignment (for PER_SEAT)
   */
  private async getLicenseFromAssignment(
    tenantId: string,
    userId: string,
    applicationId: string,
  ): Promise<LicenseCheckResult> {
    const assignment = await this.prisma.licenseAssignment.findUnique({
      where: {
        tenantId_userId_applicationId: { tenantId, userId, applicationId },
      },
      include: {
        subscription: {
          include: { licenseType: true },
        },
      },
    });

    if (!assignment) {
      // Has access but no seat assigned - this shouldn't happen for PER_SEAT
      // but handle gracefully
      return {
        hasLicense: false,
        reason: 'No license seat assigned. Contact your administrator.',
      };
    }

    if (!['ACTIVE', 'TRIALING'].includes(assignment.subscription.status)) {
      return {
        hasLicense: false,
        reason: 'Subscription is no longer active',
      };
    }

    return {
      hasLicense: true,
      licenseType: assignment.subscription.licenseType.slug,
      licenseTypeName: assignment.subscription.licenseType.name,
      features:
        (assignment.subscription.licenseType.features as Record<
          string,
          boolean
        >) || {},
    };
  }

  // ===========================================================================
  // FEATURE CHECKS
  // ===========================================================================

  /**
   * Check if a user has a specific feature enabled
   */
  async hasFeature(
    tenantId: string,
    userId: string,
    applicationId: string,
    featureKey: string,
  ): Promise<boolean> {
    const license = await this.checkLicense(tenantId, userId, applicationId);
    if (!license.hasLicense || !license.features) {
      return false;
    }
    return license.features[featureKey] === true;
  }

  /**
   * Get the license type a user is on for an application
   */
  async getUserLicenseType(
    tenantId: string,
    userId: string,
    applicationId: string,
  ): Promise<string | null> {
    const license = await this.checkLicense(tenantId, userId, applicationId);
    return license.hasLicense ? (license.licenseType ?? null) : null;
  }

  // ===========================================================================
  // LIST OPERATIONS (for admin dashboards)
  // ===========================================================================

  /**
   * Get all users who have access to an application
   * Now queries AppAccess instead of computing from mode
   */
  async getAppLicensedUsers(
    tenantId: string,
    applicationId: string,
  ): Promise<{ userId: string; licenseType: string; licenseTypeName: string }[]> {
    // Get all users with active access
    const accesses = await this.prisma.appAccess.findMany({
      where: {
        tenantId,
        applicationId,
        status: AccessStatus.ACTIVE,
      },
      select: { userId: true },
    });

    if (accesses.length === 0) return [];

    // Get app licensing mode to determine how to fetch license type
    const app = await this.prisma.application.findUnique({
      where: { id: applicationId },
      select: { licensingMode: true },
    });

    if (app?.licensingMode === 'PER_SEAT') {
      // For PER_SEAT: get license type from assignments
      const assignments = await this.prisma.licenseAssignment.findMany({
        where: {
          tenantId,
          applicationId,
          userId: { in: accesses.map((a) => a.userId) },
        },
        include: {
          subscription: {
            include: { licenseType: { select: { slug: true, name: true } } },
          },
        },
      });

      return assignments.map((a) => ({
        userId: a.userId,
        licenseType: a.subscription.licenseType.slug,
        licenseTypeName: a.subscription.licenseType.name,
      }));
    } else {
      // For FREE/TENANT_WIDE: all users share the subscription's license type
      const subscription = await this.prisma.appSubscription.findFirst({
        where: {
          tenantId,
          applicationId,
          status: { in: ['ACTIVE', 'TRIALING'] },
        },
        include: { licenseType: { select: { slug: true, name: true } } },
        orderBy: { licenseType: { displayOrder: 'desc' } },
      });

      if (!subscription) return [];

      return accesses.map((a) => ({
        userId: a.userId,
        licenseType: subscription.licenseType.slug,
        licenseTypeName: subscription.licenseType.name,
      }));
    }
  }

  /**
   * Count users with access to an application
   * Now simply counts AppAccess records
   */
  async countLicensedUsers(
    tenantId: string,
    applicationId: string,
  ): Promise<number> {
    return this.prisma.appAccess.count({
      where: {
        tenantId,
        applicationId,
        status: AccessStatus.ACTIVE,
      },
    });
  }
}
