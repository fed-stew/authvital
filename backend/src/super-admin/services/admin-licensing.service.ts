import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LicensePoolService } from '../../licensing/services/license-pool.service';

/**
 * Handles licensing management operations for super admins.
 * Focused on: License types, subscriptions, and license assignments.
 *
 * Note: Most heavy lifting is done by the dedicated licensing module.
 * This service provides a super-admin-specific facade.
 */
@Injectable()
export class AdminLicensingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly licensePoolService: LicensePoolService,
  ) {}

  // ===========================================================================
  // LICENSE TYPES
  // ===========================================================================

  /**
   * Get all license types across all applications
   */
  async getLicenseTypes(opts: { applicationId?: string; status?: string } = {}) {
    const where: Record<string, unknown> = {};

    if (opts.applicationId) {
      where.applicationId = opts.applicationId;
    }

    if (opts.status) {
      where.status = opts.status;
    }

    const licenseTypes = await this.prisma.licenseType.findMany({
      where,
      include: {
        application: {
          select: { id: true, name: true, slug: true },
        },
        _count: {
          select: { appSubscriptions: true },
        },
      },
      orderBy: [{ application: { name: 'asc' } }, { displayOrder: 'asc' }],
    });

    return licenseTypes.map((lt) => ({
      id: lt.id,
      name: lt.name,
      slug: lt.slug,
      description: lt.description,
      status: lt.status,
      features: lt.features as Record<string, boolean>,
      maxMembers: lt.maxMembers,
      displayOrder: lt.displayOrder,
      application: lt.application,
      subscriptionCount: lt._count.appSubscriptions,
      createdAt: lt.createdAt,
    }));
  }

  /**
   * Get a single license type by ID
   */
  async getLicenseType(licenseTypeId: string) {
    const licenseType = await this.prisma.licenseType.findUnique({
      where: { id: licenseTypeId },
      include: {
        application: true,
        appSubscriptions: {
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: {
            tenant: {
              select: { id: true, name: true, slug: true },
            },
          },
        },
      },
    });

    if (!licenseType) {
      throw new NotFoundException('License type not found');
    }

    return licenseType;
  }

  /**
   * Create a new license type for an application
   */
  async createLicenseType(data: {
    applicationId: string;
    name: string;
    slug: string;
    description?: string;
    features?: Record<string, boolean>;
    maxMembers?: number;
    displayOrder?: number;
  }) {
    const app = await this.prisma.application.findUnique({
      where: { id: data.applicationId },
    });

    if (!app) {
      throw new NotFoundException('Application not found');
    }

    // Check slug uniqueness within application
    const existing = await this.prisma.licenseType.findFirst({
      where: {
        applicationId: data.applicationId,
        slug: data.slug,
      },
    });

    if (existing) {
      throw new BadRequestException(
        `License type with slug '${data.slug}' already exists for this application`,
      );
    }

    // Get next display order if not provided
    let displayOrder = data.displayOrder;
    if (displayOrder === undefined) {
      const maxOrder = await this.prisma.licenseType.aggregate({
        where: { applicationId: data.applicationId },
        _max: { displayOrder: true },
      });
      displayOrder = (maxOrder._max.displayOrder || 0) + 1;
    }

    return this.prisma.licenseType.create({
      data: {
        applicationId: data.applicationId,
        name: data.name,
        slug: data.slug,
        description: data.description,
        features: data.features || {},
        maxMembers: data.maxMembers,
        displayOrder,
        status: 'ACTIVE',
      },
    });
  }

  /**
   * Update a license type
   */
  async updateLicenseType(
    licenseTypeId: string,
    data: {
      name?: string;
      description?: string;
      features?: Record<string, boolean>;
      maxMembers?: number | null;
      displayOrder?: number;
      status?: 'ACTIVE' | 'ARCHIVED';
    },
  ) {
    const licenseType = await this.prisma.licenseType.findUnique({
      where: { id: licenseTypeId },
    });

    if (!licenseType) {
      throw new NotFoundException('License type not found');
    }

    return this.prisma.licenseType.update({
      where: { id: licenseTypeId },
      data,
    });
  }

  /**
   * Delete a license type (only if no subscriptions)
   */
  async deleteLicenseType(licenseTypeId: string) {
    const licenseType = await this.prisma.licenseType.findUnique({
      where: { id: licenseTypeId },
      include: {
        _count: { select: { appSubscriptions: true } },
      },
    });

    if (!licenseType) {
      throw new NotFoundException('License type not found');
    }

    if (licenseType._count.appSubscriptions > 0) {
      throw new BadRequestException(
        `Cannot delete license type with ${licenseType._count.appSubscriptions} active subscription(s). Archive it instead.`,
      );
    }

    await this.prisma.licenseType.delete({
      where: { id: licenseTypeId },
    });

    return { success: true, message: 'License type deleted' };
  }

  // ===========================================================================
  // SUBSCRIPTIONS
  // ===========================================================================

  /**
   * Get all subscriptions with optional filters
   */
  async getSubscriptions(opts: {
    tenantId?: string;
    applicationId?: string;
    status?: string;
    limit?: number;
    offset?: number;
  } = {}) {
    const { limit = 50, offset = 0 } = opts;
    const where: Record<string, unknown> = {};

    if (opts.tenantId) {
      where.tenantId = opts.tenantId;
    }

    if (opts.applicationId) {
      where.applicationId = opts.applicationId;
    }

    if (opts.status) {
      where.status = opts.status;
    }

    const [subscriptions, total] = await Promise.all([
      this.prisma.appSubscription.findMany({
        where,
        take: limit,
        skip: offset,
        include: {
          tenant: {
            select: { id: true, name: true, slug: true },
          },
          application: {
            select: { id: true, name: true, slug: true },
          },
          licenseType: {
            select: { id: true, name: true, slug: true, features: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.appSubscription.count({ where }),
    ]);

    return {
      subscriptions: subscriptions.map((sub) => ({
        id: sub.id,
        tenant: sub.tenant,
        application: sub.application,
        licenseType: sub.licenseType,
        status: sub.status,
        quantityPurchased: sub.quantityPurchased,
        quantityAssigned: sub.quantityAssigned,
        quantityAvailable: sub.quantityPurchased - sub.quantityAssigned,
        currentPeriodStart: sub.currentPeriodStart,
        currentPeriodEnd: sub.currentPeriodEnd,
        autoRenew: sub.autoRenew,
        createdAt: sub.createdAt,
      })),
      total,
      limit,
      offset,
    };
  }

  /**
   * Create a subscription for a tenant
   * Delegates to LicensePoolService to ensure events are fired
   */
  async createSubscription(data: {
    tenantId: string;
    applicationId: string;
    licenseTypeId: string;
    quantityPurchased: number;
    currentPeriodEnd?: Date;
    autoRenew?: boolean;
  }) {
    // Check for existing active subscription first
    const existing = await this.prisma.appSubscription.findFirst({
      where: {
        tenantId: data.tenantId,
        applicationId: data.applicationId,
        status: { in: ['ACTIVE', 'TRIALING'] },
      },
    });

    if (existing) {
      throw new BadRequestException(
        'Tenant already has an active subscription for this application',
      );
    }

    // Delegate to core service (which fires events and handles validation)
    const subscription = await this.licensePoolService.provisionSubscription({
      tenantId: data.tenantId,
      applicationId: data.applicationId,
      licenseTypeId: data.licenseTypeId,
      quantityPurchased: data.quantityPurchased,
      currentPeriodEnd: data.currentPeriodEnd,
    });

    // Return with includes for admin UI
    return this.prisma.appSubscription.findUnique({
      where: { id: subscription.id },
      include: {
        tenant: { select: { id: true, name: true } },
        application: { select: { id: true, name: true } },
        licenseType: { select: { id: true, name: true } },
      },
    });
  }

  /**
   * Update a subscription
   */
  async updateSubscription(
    subscriptionId: string,
    data: {
      quantityPurchased?: number;
      status?: 'ACTIVE' | 'TRIALING' | 'PAST_DUE' | 'CANCELED' | 'EXPIRED';
      currentPeriodEnd?: Date;
      autoRenew?: boolean;
    },
  ) {
    const subscription = await this.prisma.appSubscription.findUnique({
      where: { id: subscriptionId },
    });

    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    // Validate quantity if changing
    if (data.quantityPurchased !== undefined) {
      if (data.quantityPurchased < subscription.quantityAssigned) {
        throw new BadRequestException(
          `Cannot reduce quantity below assigned count (${subscription.quantityAssigned})`,
        );
      }
    }

    return this.prisma.appSubscription.update({
      where: { id: subscriptionId },
      data,
      include: {
        tenant: { select: { id: true, name: true } },
        application: { select: { id: true, name: true } },
        licenseType: { select: { id: true, name: true } },
      },
    });
  }

  // ===========================================================================
  // LICENSE ASSIGNMENTS
  // ===========================================================================

  /**
   * Get license assignments for a subscription
   */
  async getLicenseAssignments(subscriptionId: string) {
    const subscription = await this.prisma.appSubscription.findUnique({
      where: { id: subscriptionId },
      include: {
        licenseAssignments: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                givenName: true,
                familyName: true,
                displayName: true,
              },
            },
          },
          orderBy: { assignedAt: 'desc' },
        },
      },
    });

    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    return subscription.licenseAssignments.map((la) => ({
      id: la.id,
      user: la.user,
      userId: la.userId,
      assignedAt: la.assignedAt,
      assignedById: la.assignedById,
      licenseTypeId: la.licenseTypeId,
      licenseTypeName: la.licenseTypeName,
    }));
  }
}
