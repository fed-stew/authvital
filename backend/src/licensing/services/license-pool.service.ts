import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SystemWebhookService } from '../../webhooks/system-webhook.service';
import { SubscriptionStatus, LicenseTypeStatus, AccessMode } from '@prisma/client';
import {
  CreateSubscriptionInput,
  SubscriptionSummary,
  TenantLicenseOverview,
  LicenseTypeFeatures,
  AvailableLicenseType,
  MemberAccessResult,
} from '../types';

/**
 * LicensePoolService - The Wallet Manager 💰
 * 
 * Manages the tenant's "wallet" of purchased licenses (inventory).
 * This is where seats are purchased and tracked.
 */
@Injectable()
export class LicensePoolService {
  private readonly logger = new Logger(LicensePoolService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly systemWebhookService: SystemWebhookService,
  ) {}

  // ===========================================================================
  // SUBSCRIPTION MANAGEMENT (The Inventory)
  // ===========================================================================

  /**
   * Create or update a subscription (purchase seats)
   * Called after successful payment or for manual provisioning
   */
  async provisionSubscription(input: CreateSubscriptionInput) {
    // Verify tenant exists
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: input.tenantId },
      select: { id: true },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant ${input.tenantId} not found`);
    }

    // Verify application exists and check accessMode
    const application = await this.prisma.application.findUnique({
      where: { id: input.applicationId },
      select: { id: true, name: true, accessMode: true },
    });

    if (!application) {
      throw new NotFoundException(`Application ${input.applicationId} not found`);
    }

    // Check if new subscriptions are allowed
    if (application.accessMode === AccessMode.DISABLED) {
      throw new ForbiddenException(
        `New subscriptions are disabled for application "${application.name}"`
      );
    }

    // Check if this is a NEW subscription (not an update)
    const existingSubscription = await this.prisma.appSubscription.findFirst({
      where: {
        tenantId: input.tenantId,
        applicationId: input.applicationId,
      },
    });

    // Verify license type exists and belongs to this application
    const licenseType = await this.prisma.licenseType.findFirst({
      where: {
        id: input.licenseTypeId,
        applicationId: input.applicationId,
      },
    });

    if (!licenseType) {
      throw new NotFoundException(
        `License type ${input.licenseTypeId} not found for application ${input.applicationId}`
      );
    }

    // Default to 1 year if not provided
    const periodEnd = input.currentPeriodEnd || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

    // Upsert the subscription
    const subscription = await this.prisma.appSubscription.upsert({
      where: {
        tenantId_applicationId_licenseTypeId: {
          tenantId: input.tenantId,
          applicationId: input.applicationId,
          licenseTypeId: input.licenseTypeId,
        },
      },
      create: {
        tenantId: input.tenantId,
        applicationId: input.applicationId,
        licenseTypeId: input.licenseTypeId,
        quantityPurchased: input.quantityPurchased,
        quantityAssigned: 0,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodEnd: periodEnd,
      },
      update: {
        quantityPurchased: input.quantityPurchased,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodEnd: periodEnd,
        canceledAt: null, // Reactivate if was canceled
      },
      include: {
        licenseType: true,
        application: { select: { id: true, name: true, slug: true } },
      },
    });

    // Fire event if this is a new subscription (not an update)
    if (!existingSubscription) {
      this.systemWebhookService
        .dispatch('tenant.app.granted', {
          subscription_id: subscription.id,
          tenant_id: input.tenantId,
          application_id: input.applicationId,
          application_name: subscription.application.name,
          license_type_id: input.licenseTypeId,
          license_type_name: subscription.licenseType.name,
          quantity_purchased: input.quantityPurchased,
          status: subscription.status,
        })
        .catch((err) => {
          this.logger.warn(`Failed to dispatch tenant.app.granted event: ${err.message}`);
        });
    }

    return subscription;
  }

  /**
   * Update quantity purchased
   */
  async updateQuantity(subscriptionId: string, quantityPurchased: number) {
    const subscription = await this.prisma.appSubscription.findUnique({
      where: { id: subscriptionId },
    });

    if (!subscription) {
      throw new NotFoundException(`Subscription ${subscriptionId} not found`);
    }

    if (quantityPurchased < subscription.quantityAssigned) {
      throw new BadRequestException(
        `Cannot reduce quantity below assigned count. ` +
        `Assigned: ${subscription.quantityAssigned}, Requested: ${quantityPurchased}`
      );
    }

    return this.prisma.appSubscription.update({
      where: { id: subscriptionId },
      data: { quantityPurchased },
    });
  }

  /**
   * Get a subscription by ID
   */
  async findById(subscriptionId: string) {
    const subscription = await this.prisma.appSubscription.findUnique({
      where: { id: subscriptionId },
      include: {
        licenseType: true,
        application: { select: { id: true, name: true, slug: true } },
        tenant: { select: { id: true, name: true, slug: true } },
      },
    });

    if (!subscription) {
      throw new NotFoundException(`Subscription ${subscriptionId} not found`);
    }

    return subscription;
  }

  /**
   * Get all subscriptions for a tenant (their "wallet")
   */
  async getTenantSubscriptions(tenantId: string): Promise<SubscriptionSummary[]> {
    const subscriptions = await this.prisma.appSubscription.findMany({
      where: {
        tenantId,
        status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE', 'CANCELED'] },
      },
      include: {
        licenseType: true,
        application: { select: { id: true, name: true, slug: true, licensingMode: true } },
      },
      orderBy: [
        { applicationId: 'asc' },
        { licenseType: { displayOrder: 'desc' } },
      ],
    });

    return subscriptions.map((sub) => ({
      id: sub.id,
      applicationId: sub.applicationId,
      applicationName: sub.application.name,
      licenseTypeId: sub.licenseTypeId,
      licenseTypeName: sub.licenseType.name,
      licenseTypeSlug: sub.licenseType.slug,
      quantityPurchased: sub.quantityPurchased,
      quantityAssigned: sub.quantityAssigned,
      quantityAvailable: sub.quantityPurchased - sub.quantityAssigned,
      status: sub.status,
      currentPeriodEnd: sub.currentPeriodEnd,
      features: (sub.licenseType.features as LicenseTypeFeatures) || {},
      licensingMode: sub.application.licensingMode as 'FREE' | 'PER_SEAT' | 'TENANT_WIDE',
      maxMembers: sub.licenseType.maxMembers,
    }));
  }

  /**
   * Get full license overview for a tenant
   */
  async getTenantLicenseOverview(tenantId: string): Promise<TenantLicenseOverview> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant ${tenantId} not found`);
    }

    const subscriptions = await this.getTenantSubscriptions(tenantId);

    const totalSeatsOwned = subscriptions.reduce((sum, s) => sum + s.quantityPurchased, 0);
    const totalSeatsAssigned = subscriptions.reduce((sum, s) => sum + s.quantityAssigned, 0);

    return {
      tenantId,
      subscriptions,
      totalSeatsOwned,
      totalSeatsAssigned,
    };
  }

  /**
   * Get all available license types for a tenant
   * 
   * Returns all ACTIVE license types across all applications that the tenant
   * could purchase/provision. Includes subscription info for types the tenant
   * already has a subscription for.
   */
  async getAvailableLicenseTypesForTenant(tenantId: string): Promise<AvailableLicenseType[]> {
    // Verify tenant exists
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant ${tenantId} not found`);
    }

    // Get all ACTIVE license types with their application info
    const licenseTypes = await this.prisma.licenseType.findMany({
      where: {
        status: LicenseTypeStatus.ACTIVE,
      },
      include: {
        application: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: [
        { applicationId: 'asc' },
        { displayOrder: 'desc' },
        { name: 'asc' },
      ],
    });

    // Get all subscriptions for the tenant
    const subscriptions = await this.prisma.appSubscription.findMany({
      where: {
        tenantId,
      },
      select: {
        id: true,
        licenseTypeId: true,
        quantityPurchased: true,
        quantityAssigned: true,
      },
    });

    // Build a map of licenseTypeId -> subscription info
    const subscriptionMap = new Map<
      string,
      { id: string; quantityPurchased: number; quantityAssigned: number }
    >();
    for (const sub of subscriptions) {
      subscriptionMap.set(sub.licenseTypeId, {
        id: sub.id,
        quantityPurchased: sub.quantityPurchased,
        quantityAssigned: sub.quantityAssigned,
      });
    }

    // Combine license types with subscription info
    const result: AvailableLicenseType[] = licenseTypes.map((licenseType) => {
      const existingSubscription = subscriptionMap.get(licenseType.id);

      return {
        id: licenseType.id,
        name: licenseType.name,
        slug: licenseType.slug,
        description: licenseType.description,
        applicationId: licenseType.applicationId,
        applicationName: licenseType.application.name,
        features: (licenseType.features as LicenseTypeFeatures) || {},
        displayOrder: licenseType.displayOrder,
        hasSubscription: !!existingSubscription,
        existingSubscription: existingSubscription
          ? {
              id: existingSubscription.id,
              quantityPurchased: existingSubscription.quantityPurchased,
              quantityAssigned: existingSubscription.quantityAssigned,
            }
          : undefined,
      };
    });

    return result;
  }

  /**
   * Get subscription statistics for an application across all tenants
   * Returns aggregated stats per license type
   */
  async getApplicationSubscriptionStats(applicationId: string): Promise<{
    applicationId: string;
    licenseTypes: Array<{
      licenseTypeId: string;
      licenseTypeName: string;
      licenseTypeSlug: string;
      totalSubscriptions: number;
      totalSeatsPurchased: number;
      totalSeatsAssigned: number;
      totalSeatsAvailable: number;
      tenants: Array<{
        tenantId: string;
        tenantName: string;
        quantityPurchased: number;
        quantityAssigned: number;
        status: string;
      }>;
    }>;
    totals: {
      totalSubscriptions: number;
      totalSeatsPurchased: number;
      totalSeatsAssigned: number;
    };
  }> {
    // Verify application exists
    const application = await this.prisma.application.findUnique({
      where: { id: applicationId },
      select: { id: true, name: true },
    });

    if (!application) {
      throw new NotFoundException(`Application ${applicationId} not found`);
    }

    // Get all subscriptions for this application with related data
    const subscriptions = await this.prisma.appSubscription.findMany({
      where: {
        applicationId,
        status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE', 'CANCELED'] },
      },
      include: {
        licenseType: {
          select: { id: true, name: true, slug: true },
        },
        tenant: {
          select: { id: true, name: true },
        },
      },
      orderBy: [
        { licenseTypeId: 'asc' },
        { tenant: { name: 'asc' } },
      ],
    });

    // Group by license type
    const licenseTypeMap = new Map<string, {
      licenseTypeId: string;
      licenseTypeName: string;
      licenseTypeSlug: string;
      totalSubscriptions: number;
      totalSeatsPurchased: number;
      totalSeatsAssigned: number;
      totalSeatsAvailable: number;
      tenants: Array<{
        tenantId: string;
        tenantName: string;
        quantityPurchased: number;
        quantityAssigned: number;
        status: string;
      }>;
    }>();

    let grandTotalSubscriptions = 0;
    let grandTotalPurchased = 0;
    let grandTotalAssigned = 0;

    for (const sub of subscriptions) {
      const key = sub.licenseTypeId;
      
      if (!licenseTypeMap.has(key)) {
        licenseTypeMap.set(key, {
          licenseTypeId: sub.licenseType.id,
          licenseTypeName: sub.licenseType.name,
          licenseTypeSlug: sub.licenseType.slug,
          totalSubscriptions: 0,
          totalSeatsPurchased: 0,
          totalSeatsAssigned: 0,
          totalSeatsAvailable: 0,
          tenants: [],
        });
      }

      const entry = licenseTypeMap.get(key)!;
      entry.totalSubscriptions++;
      entry.totalSeatsPurchased += sub.quantityPurchased;
      entry.totalSeatsAssigned += sub.quantityAssigned;
      entry.totalSeatsAvailable += (sub.quantityPurchased - sub.quantityAssigned);
      entry.tenants.push({
        tenantId: sub.tenant.id,
        tenantName: sub.tenant.name,
        quantityPurchased: sub.quantityPurchased,
        quantityAssigned: sub.quantityAssigned,
        status: sub.status,
      });

      grandTotalSubscriptions++;
      grandTotalPurchased += sub.quantityPurchased;
      grandTotalAssigned += sub.quantityAssigned;
    }

    return {
      applicationId,
      licenseTypes: Array.from(licenseTypeMap.values()),
      totals: {
        totalSubscriptions: grandTotalSubscriptions,
        totalSeatsPurchased: grandTotalPurchased,
        totalSeatsAssigned: grandTotalAssigned,
      },
    };
  }

  // ===========================================================================
  // CAPACITY CHECKS
  // ===========================================================================

  /**
   * Check if a new member can be added to an application
   * 
   * Handles all three licensing modes:
   * - FREE: Uses auto-provisioned tenant-wide subscription
   * - PER_SEAT: Check if seats are available
   * - TENANT_WIDE: Check if member limit is not reached
   * 
   * @param tenantId - The tenant adding the member
   * @param applicationId - The application to check
   * @returns Member access result with details
   */
  async checkMemberAccess(
    tenantId: string,
    applicationId: string,
  ): Promise<MemberAccessResult> {
    // Get the application with its licensing mode
    const app = await this.prisma.application.findUnique({
      where: { id: applicationId },
      select: { id: true, name: true, licensingMode: true },
    });

    if (!app) {
      return {
        allowed: false,
        reason: 'Application not found',
        mode: 'FREE', // placeholder
      };
    }

    const mode = app.licensingMode;

    // ==========================================================================
    // FREE & TENANT_WIDE MODE: Check member limits
    // ==========================================================================
    // FREE uses auto-provisioned tenant-wide subscription, same path as TENANT_WIDE
    if (mode === 'FREE' || mode === 'TENANT_WIDE') {
      // Get the tenant's subscription for this app
      const subscription = await this.prisma.appSubscription.findFirst({
        where: {
          tenantId,
          applicationId,
          status: { in: ['ACTIVE', 'TRIALING'] },
        },
        include: {
          licenseType: {
            select: { id: true, maxMembers: true, name: true },
          },
        },
        orderBy: { licenseType: { displayOrder: 'desc' } }, // Best tier first
      });

      if (!subscription) {
        return {
          allowed: false,
          mode: mode,
          reason: 'No active subscription for this application',
        };
      }

      const maxMembers = subscription.licenseType.maxMembers;

      // If maxMembers is null, unlimited access
      if (!maxMembers) {
        return {
          allowed: true,
          mode: mode,
          message: 'Unlimited members allowed',
          memberLimit: {
            maxMembers: null,  // unlimited
            currentMembers: 0,  // optional to compute
            available: null,    // unlimited
          },
        };
      }

      // Check current member count
      const currentMembers = await this.prisma.membership.count({
        where: {
          tenantId,
          status: 'ACTIVE',
        },
      });

      const available = maxMembers - currentMembers;

      if (available <= 0) {
        return {
          allowed: false,
          mode: mode,
          reason: `Member limit reached (${maxMembers} members max)`,
          memberLimit: {
            maxMembers,
            currentMembers,
            available: 0,
          },
        };
      }

      return {
        allowed: true,
        mode: mode,
        message: `${available} member slot${available > 1 ? 's' : ''} remaining`,
        memberLimit: {
          maxMembers,
          currentMembers,
          available,
        },
      };
    }

    // ==========================================================================
    // PER_SEAT MODE: Check seat availability
    // ==========================================================================
    if (mode === 'PER_SEAT') {
      // Get all subscriptions for this app
      const subscriptions = await this.prisma.appSubscription.findMany({
        where: {
          tenantId,
          applicationId,
          status: { in: ['ACTIVE', 'TRIALING'] },
        },
        include: {
          licenseType: {
            select: { id: true, name: true, slug: true },
          },
        },
      });

      if (subscriptions.length === 0) {
        return {
          allowed: false,
          mode: 'PER_SEAT',
          reason: 'No active subscriptions for this application',
        };
      }

      // Calculate total capacity across all license types
      const totalPurchased = subscriptions.reduce(
        (sum, sub) => sum + sub.quantityPurchased,
        0
      );
      const totalAssigned = subscriptions.reduce(
        (sum, sub) => sum + sub.quantityAssigned,
        0
      );
      const totalAvailable = totalPurchased - totalAssigned;

      if (totalAvailable <= 0) {
        return {
          allowed: false,
          mode: 'PER_SEAT',
          reason: 'No seats available',
          capacity: {
            available: 0,
            purchased: totalPurchased,
            assigned: totalAssigned,
          },
        };
      }

      return {
        allowed: true,
        mode: 'PER_SEAT',
        message: `${totalAvailable} seat${totalAvailable > 1 ? 's' : ''} available`,
        capacity: {
          available: totalAvailable,
          purchased: totalPurchased,
          assigned: totalAssigned,
        },
      };
    }

    return {
      allowed: false,
      mode: 'FREE', // placeholder
      reason: `Unknown licensing mode: ${mode}`,
    };
  }

  /**
   * Check if a subscription has available seats
   */
  async hasAvailableSeats(subscriptionId: string, count = 1): Promise<boolean> {
    const subscription = await this.prisma.appSubscription.findUnique({
      where: { id: subscriptionId },
      select: { quantityPurchased: true, quantityAssigned: true },
    });

    if (!subscription) return false;

    return subscription.quantityAssigned + count <= subscription.quantityPurchased;
  }

  /**
   * Get available capacity for a tenant's app+license type subscription
   */
  async getAvailableCapacity(
    tenantId: string,
    applicationId: string,
    licenseTypeId: string
  ): Promise<{ available: number; purchased: number; assigned: number } | null> {
    const subscription = await this.prisma.appSubscription.findUnique({
      where: {
        tenantId_applicationId_licenseTypeId: {
          tenantId,
          applicationId,
          licenseTypeId,
        },
      },
      select: { quantityPurchased: true, quantityAssigned: true },
    });

    if (!subscription) return null;

    return {
      purchased: subscription.quantityPurchased,
      assigned: subscription.quantityAssigned,
      available: subscription.quantityPurchased - subscription.quantityAssigned,
    };
  }

  // ===========================================================================
  // INTERNAL: Assignment Count Management
  // ===========================================================================

  /**
   * Increment the assigned count (called when granting a license)
   * Uses optimistic locking for concurrency safety
   */
  async incrementAssignedCount(subscriptionId: string): Promise<void> {
    // First, get current values for optimistic locking
    const subscription = await this.prisma.appSubscription.findUnique({
      where: { id: subscriptionId },
      select: { quantityAssigned: true, quantityPurchased: true },
    });

    if (!subscription) {
      throw new BadRequestException('Subscription not found');
    }

    const currentAssigned = subscription.quantityAssigned;

    // Atomic increment with optimistic locking
    const result = await this.prisma.appSubscription.updateMany({
      where: {
        id: subscriptionId,
        // Optimistic lock: only update if value hasn't changed AND there's capacity
        quantityAssigned: currentAssigned,
        quantityPurchased: { gt: currentAssigned },
      },
      data: {
        quantityAssigned: { increment: 1 },
      },
    });

    if (result.count === 0) {
      throw new BadRequestException('No seats available or subscription not found');
    }
  }

  /**
   * Decrement the assigned count (called when revoking a license)
   */
  async decrementAssignedCount(subscriptionId: string): Promise<void> {
    // Decrement with floor of 0 using where clause
    await this.prisma.appSubscription.updateMany({
      where: {
        id: subscriptionId,
        quantityAssigned: { gt: 0 },
      },
      data: {
        quantityAssigned: { decrement: 1 },
      },
    });
  }

  /**
   * Reconcile assigned count with actual assignments
   * (For fixing any count drift)
   */
  async reconcileAssignedCount(subscriptionId: string): Promise<number> {
    const actualCount = await this.prisma.licenseAssignment.count({
      where: { subscriptionId },
    });

    await this.prisma.appSubscription.update({
      where: { id: subscriptionId },
      data: { quantityAssigned: actualCount },
    });

    return actualCount;
  }

  // ===========================================================================
  // SUBSCRIPTION LIFECYCLE
  // ===========================================================================

  /**
   * Cancel a subscription (access continues until period end)
   */
  async cancelSubscription(subscriptionId: string) {
    return this.prisma.appSubscription.update({
      where: { id: subscriptionId },
      data: {
        status: SubscriptionStatus.CANCELED,
        autoRenew: false,
        canceledAt: new Date(),
      },
    });
  }

  /**
   * Expire a subscription (immediate, no more access)
   * Also cleans up all license assignments
   */
  async expireSubscription(subscriptionId: string) {
    return this.prisma.$transaction(async (tx) => {
      // Delete all license assignments
      await tx.licenseAssignment.deleteMany({
        where: { subscriptionId },
      });

      // Mark subscription as expired
      return tx.appSubscription.update({
        where: { id: subscriptionId },
        data: {
          status: SubscriptionStatus.EXPIRED,
          quantityAssigned: 0,
        },
      });
    });
  }

  /**
   * Handle subscription renewal
   */
  async renewSubscription(subscriptionId: string, newPeriodEnd: Date) {
    return this.prisma.appSubscription.update({
      where: { id: subscriptionId },
      data: {
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: new Date(),
        currentPeriodEnd: newPeriodEnd,
        canceledAt: null,
      },
    });
  }
}
