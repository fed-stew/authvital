import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SystemWebhookService } from '../../webhooks/system-webhook.service';
import { LicenseCapacityService } from './license-capacity.service';
import { SubscriptionStatus, LicenseTypeStatus, AccessMode } from '@prisma/client';
import {
  CreateSubscriptionInput,
  SubscriptionSummaryInternal,
  TenantLicenseOverviewInternal,
  LicenseTypeFeatures,
  AvailableLicenseTypeInternal,
  MemberAccessResult,
} from '../types';

/**
 * LicensePoolService - The Wallet Manager 💰
 *
 * Manages the tenant's "wallet" of purchased licenses (inventory).
 * Delegates capacity checks to LicenseCapacityService.
 */
@Injectable()
export class LicensePoolService {
  private readonly logger = new Logger(LicensePoolService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly systemWebhookService: SystemWebhookService,
    private readonly capacityService: LicenseCapacityService,
  ) {}

  // ===========================================================================
  // SUBSCRIPTION MANAGEMENT
  // ===========================================================================

  async provisionSubscription(input: CreateSubscriptionInput) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: input.tenantId },
      select: { id: true },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant ${input.tenantId} not found`);
    }

    const application = await this.prisma.application.findUnique({
      where: { id: input.applicationId },
      select: { id: true, name: true, accessMode: true },
    });

    if (!application) {
      throw new NotFoundException(`Application ${input.applicationId} not found`);
    }

    if (application.accessMode === AccessMode.DISABLED) {
      throw new ForbiddenException(
        `New subscriptions are disabled for application "${application.name}"`,
      );
    }

    const existingSubscription = await this.prisma.appSubscription.findFirst({
      where: { tenantId: input.tenantId, applicationId: input.applicationId },
    });

    const licenseType = await this.prisma.licenseType.findFirst({
      where: { id: input.licenseTypeId, applicationId: input.applicationId },
    });

    if (!licenseType) {
      throw new NotFoundException(
        `License type ${input.licenseTypeId} not found for application ${input.applicationId}`,
      );
    }

    const periodEnd = input.currentPeriodEnd || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

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
        canceledAt: null,
      },
      include: {
        licenseType: true,
        application: { select: { id: true, name: true, slug: true } },
      },
    });

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
        .catch((err) => this.logger.warn(`Failed to dispatch tenant.app.granted: ${err.message}`));
    }

    return subscription;
  }

  async updateQuantity(subscriptionId: string, quantityPurchased: number) {
    const subscription = await this.prisma.appSubscription.findUnique({
      where: { id: subscriptionId },
    });

    if (!subscription) {
      throw new NotFoundException(`Subscription ${subscriptionId} not found`);
    }

    if (quantityPurchased < subscription.quantityAssigned) {
      throw new BadRequestException(
        `Cannot reduce quantity below assigned count. Assigned: ${subscription.quantityAssigned}, Requested: ${quantityPurchased}`,
      );
    }

    return this.prisma.appSubscription.update({
      where: { id: subscriptionId },
      data: { quantityPurchased },
    });
  }

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

  async getTenantSubscriptions(tenantId: string): Promise<SubscriptionSummaryInternal[]> {
    const subscriptions = await this.prisma.appSubscription.findMany({
      where: {
        tenantId,
        status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE', 'CANCELED'] },
      },
      include: {
        licenseType: true,
        application: { select: { id: true, name: true, slug: true, licensingMode: true } },
      },
      orderBy: [{ applicationId: 'asc' }, { licenseType: { displayOrder: 'desc' } }],
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

  async getTenantLicenseOverview(tenantId: string): Promise<TenantLicenseOverviewInternal> {
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

    return { tenantId, subscriptions, totalSeatsOwned, totalSeatsAssigned };
  }

  async getAvailableLicenseTypesForTenant(tenantId: string): Promise<AvailableLicenseTypeInternal[]> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant ${tenantId} not found`);
    }

    const licenseTypes = await this.prisma.licenseType.findMany({
      where: { status: LicenseTypeStatus.ACTIVE },
      include: { application: { select: { id: true, name: true } } },
      orderBy: [{ applicationId: 'asc' }, { displayOrder: 'desc' }, { name: 'asc' }],
    });

    const subscriptions = await this.prisma.appSubscription.findMany({
      where: { tenantId },
      select: { id: true, licenseTypeId: true, quantityPurchased: true, quantityAssigned: true },
    });

    const subscriptionMap = new Map(
      subscriptions.map((sub) => [
        sub.licenseTypeId,
        { id: sub.id, quantityPurchased: sub.quantityPurchased, quantityAssigned: sub.quantityAssigned },
      ]),
    );

    return licenseTypes.map((lt) => {
      const existing = subscriptionMap.get(lt.id);
      return {
        id: lt.id,
        name: lt.name,
        slug: lt.slug,
        description: lt.description,
        applicationId: lt.applicationId,
        applicationName: lt.application.name,
        features: (lt.features as LicenseTypeFeatures) || {},
        displayOrder: lt.displayOrder,
        hasSubscription: !!existing,
        existingSubscription: existing,
      };
    });
  }

  // ===========================================================================
  // CAPACITY CHECKS (Delegated)
  // ===========================================================================

  async checkMemberAccess(tenantId: string, applicationId: string): Promise<MemberAccessResult> {
    return this.capacityService.checkMemberAccess(tenantId, applicationId);
  }

  async hasAvailableSeats(subscriptionId: string, count = 1): Promise<boolean> {
    return this.capacityService.hasAvailableSeats(subscriptionId, count);
  }

  async getAvailableCapacity(tenantId: string, applicationId: string, licenseTypeId: string) {
    return this.capacityService.getAvailableCapacity(tenantId, applicationId, licenseTypeId);
  }

  async incrementAssignedCount(subscriptionId: string): Promise<void> {
    return this.capacityService.incrementAssignedCount(subscriptionId);
  }

  async decrementAssignedCount(subscriptionId: string): Promise<void> {
    return this.capacityService.decrementAssignedCount(subscriptionId);
  }

  async reconcileAssignedCount(subscriptionId: string): Promise<number> {
    return this.capacityService.reconcileAssignedCount(subscriptionId);
  }

  // ===========================================================================
  // SUBSCRIPTION LIFECYCLE
  // ===========================================================================

  async cancelSubscription(subscriptionId: string) {
    return this.prisma.appSubscription.update({
      where: { id: subscriptionId },
      data: { status: SubscriptionStatus.CANCELED, autoRenew: false, canceledAt: new Date() },
    });
  }

  async expireSubscription(subscriptionId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.licenseAssignment.deleteMany({ where: { subscriptionId } });
      return tx.appSubscription.update({
        where: { id: subscriptionId },
        data: { status: SubscriptionStatus.EXPIRED, quantityAssigned: 0 },
      });
    });
  }

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

  /**
   * Get all subscriptions for an application across all tenants
   */
  async getApplicationSubscriptions(applicationId: string) {
    const subscriptions = await this.prisma.appSubscription.findMany({
      where: { applicationId },
      include: {
        tenant: { select: { id: true, name: true, slug: true } },
        licenseType: { select: { id: true, name: true, slug: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      applicationId,
      subscriptions: subscriptions.map((s) => ({
        id: s.id,
        tenant: s.tenant,
        licenseType: s.licenseType,
        quantityPurchased: s.quantityPurchased,
        quantityAssigned: s.quantityAssigned,
        status: s.status,
        createdAt: s.createdAt,
      })),
      totalPurchased: subscriptions.reduce((sum, s) => sum + s.quantityPurchased, 0),
      totalAssigned: subscriptions.reduce((sum, s) => sum + s.quantityAssigned, 0),
    };
  }
}
