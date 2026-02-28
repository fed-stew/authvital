import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionInfoInternal } from '../types';

/**
 * Handles entitlement checking for M2M integration.
 * 
 * Entitlements = Features + Seats + Subscription Status
 * Based on LICENSE POOL MODEL: Features are defined on LicenseType, checked via AppSubscription.
 */
@Injectable()
export class IntegrationEntitlementsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Check if a tenant has access to a specific feature for an application
   * LICENSE POOL MODEL: Features are defined on LicenseType, checked via AppSubscription
   */
  async checkFeature(
    tenantId: string,
    feature: string,
    applicationId?: string,
  ): Promise<{
    hasAccess: boolean;
    licenseType: string | null;
    reason?: string;
  }> {
    // Find active subscriptions for this tenant (optionally filtered by app)
    const subscriptions = await this.prisma.appSubscription.findMany({
      where: {
        tenantId,
        status: { in: ['ACTIVE', 'TRIALING'] },
        currentPeriodEnd: { gte: new Date() },
        ...(applicationId ? { applicationId } : {}),
      },
      include: {
        licenseType: true,
      },
    });

    if (subscriptions.length === 0) {
      return {
        hasAccess: false,
        licenseType: null,
        reason: 'No active subscriptions',
      };
    }

    // Check if any subscription's license type has this feature enabled
    for (const sub of subscriptions) {
      const features = (sub.licenseType.features as Record<string, boolean>) || {};
      if (features[feature] === true) {
        return {
          hasAccess: true,
          licenseType: sub.licenseType.slug,
        };
      }
    }

    return {
      hasAccess: false,
      licenseType: subscriptions[0]?.licenseType.slug || null,
      reason: `Feature '${feature}' not included in your current plan`,
    };
  }

  /**
   * Get subscription status for a tenant
   * LICENSE POOL MODEL: Returns all app subscriptions (the tenant's "wallet")
   */
  async getSubscriptionStatus(
    tenantId: string,
    applicationId?: string,
  ): Promise<{
    hasActiveSubscription: boolean;
    subscriptions: SubscriptionInfoInternal[];
  }> {
    const appSubscriptions = await this.prisma.appSubscription.findMany({
      where: {
        tenantId,
        ...(applicationId ? { applicationId } : {}),
      },
      include: {
        licenseType: true,
        application: { select: { name: true } },
      },
    });

    const now = new Date();
    const activeSubscriptions = appSubscriptions.filter(
      (s) => (s.status === 'ACTIVE' || s.status === 'TRIALING') && s.currentPeriodEnd >= now,
    );

    return {
      hasActiveSubscription: activeSubscriptions.length > 0,
      subscriptions: appSubscriptions.map((sub) => ({
        id: sub.id,
        applicationId: sub.applicationId,
        licenseType: sub.licenseType.slug,
        licenseTypeName: sub.licenseType.name,
        status: sub.status,
        quantityPurchased: sub.quantityPurchased,
        quantityAssigned: sub.quantityAssigned,
        quantityAvailable: sub.quantityPurchased - sub.quantityAssigned,
        currentPeriodEnd: sub.currentPeriodEnd,
        autoRenew: sub.autoRenew,
      })),
    };
  }

  /**
   * Check seat/license availability for a tenant
   * LICENSE POOL MODEL: Seats are tracked per app subscription
   */
  async checkSeats(
    tenantId: string,
    clientId?: string,
  ): Promise<{
    memberCount: number;
    totalSeatsOwned: number;
    totalSeatsAssigned: number;
    totalSeatsAvailable: number;
    licensingMode: string;
    unlimited: boolean;
    subscriptions: Array<{
      applicationId: string;
      licenseType: string;
      seatsOwned: number;
      seatsAssigned: number;
      seatsAvailable: number;
    }>;
  }> {
    // Count active members (for reference)
    const memberCount = await this.prisma.membership.count({
      where: {
        tenantId,
        status: 'ACTIVE',
        user: { isMachine: false },
      },
    });

    // If clientId is provided, check the application's licensing mode
    let applicationLicensingMode: string | null = null;
    let resolvedApplicationId: string | undefined;
    if (clientId) {
      const application = await this.prisma.application.findUnique({
        where: { clientId },
        select: { id: true, licensingMode: true },
      });

      if (!application) {
        throw new NotFoundException(`Application with clientId ${clientId} not found`);
      }

      applicationLicensingMode = application.licensingMode;
      resolvedApplicationId = application.id;
    }

    // Get all active subscriptions
    const subscriptions = await this.prisma.appSubscription.findMany({
      where: {
        tenantId,
        status: { in: ['ACTIVE', 'TRIALING'] },
        ...(resolvedApplicationId ? { applicationId: resolvedApplicationId } : {}),
      },
      include: {
        licenseType: { select: { slug: true } },
      },
    });

    const totalSeatsOwned = subscriptions.reduce((sum, s) => sum + s.quantityPurchased, 0);
    const totalSeatsAssigned = subscriptions.reduce((sum, s) => sum + s.quantityAssigned, 0);

    return {
      memberCount,
      totalSeatsOwned,
      totalSeatsAssigned,
      totalSeatsAvailable: totalSeatsOwned - totalSeatsAssigned,
      licensingMode: applicationLicensingMode ?? 'UNKNOWN',
      unlimited: false,
      subscriptions: subscriptions.map((s) => ({
        applicationId: s.applicationId,
        licenseType: s.licenseType.slug,
        seatsOwned: s.quantityPurchased,
        seatsAssigned: s.quantityAssigned,
        seatsAvailable: s.quantityPurchased - s.quantityAssigned,
      })),
    };
  }
}
