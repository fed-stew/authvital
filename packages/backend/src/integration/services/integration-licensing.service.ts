import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LicenseInfo, LicenseHolderInfo } from '../types';

/**
 * Handles license management operations for M2M integration.
 * 
 * License Pool Model:
 * - Tenants purchase subscriptions (AppSubscription) for specific license types
 * - Subscriptions have a quantity (seat count)
 * - Individual users are assigned licenses (LicenseAssignment) from the pool
 */
@Injectable()
export class IntegrationLicensingService {
  private readonly logger = new Logger(IntegrationLicensingService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Grant a license to a user
   */
  async grantLicense(dto: {
    tenantId: string;
    userId: string;
    applicationId: string;
    licenseTypeId: string;
  }): Promise<{ assignmentId: string; message: string }> {
    // Check that tenant exists
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: dto.tenantId },
    });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    // Check that user exists
    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check if user is member of tenant
    const membership = await this.prisma.membership.findFirst({
      where: {
        userId: dto.userId,
        tenantId: dto.tenantId,
      },
    });
    if (!membership) {
      throw new BadRequestException('User is not a member of this tenant');
    }

    // Check that application exists
    const application = await this.prisma.application.findUnique({
      where: { id: dto.applicationId },
    });
    if (!application) {
      throw new NotFoundException('Application not found');
    }

    // Check that license type exists
    const licenseType = await this.prisma.licenseType.findUnique({
      where: { id: dto.licenseTypeId },
    });
    if (!licenseType) {
      throw new NotFoundException('License type not found');
    }

    // Check for active subscription with available seats
    const subscription = await this.prisma.appSubscription.findFirst({
      where: {
        tenantId: dto.tenantId,
        applicationId: dto.applicationId,
        licenseTypeId: dto.licenseTypeId,
        status: 'ACTIVE',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!subscription) {
      throw new BadRequestException(
        `No active subscription found for license type "${licenseType.name}". Please purchase a subscription first.`,
      );
    }

    if (subscription.quantityAssigned >= subscription.quantityPurchased) {
      throw new BadRequestException(
        `No available seats for license type "${licenseType.name}". All ${subscription.quantityPurchased} seats are assigned. Please purchase more seats.`,
      );
    }

    // Check if user already has this license
    const existing = await this.prisma.licenseAssignment.findFirst({
      where: {
        userId: dto.userId,
        tenantId: dto.tenantId,
        applicationId: dto.applicationId,
      },
    });
    if (existing) {
      throw new BadRequestException(
        `User already has a license for this application (type: ${existing.licenseTypeName})`,
      );
    }

    // Create license assignment
    const assignment = await this.prisma.licenseAssignment.create({
      data: {
        userId: dto.userId,
        tenantId: dto.tenantId,
        applicationId: dto.applicationId,
        licenseTypeId: dto.licenseTypeId,
        licenseTypeName: licenseType.name,
        subscriptionId: subscription.id,
        assignedAt: new Date(),
      },
    });

    // Update subscription assigned count
    await this.prisma.appSubscription.update({
      where: { id: subscription.id },
      data: { quantityAssigned: { increment: 1 } },
    });

    // Create audit log entry
    await this.createAuditLog({
      action: 'GRANTED',
      tenantId: dto.tenantId,
      userId: dto.userId,
      userEmail: user.email || '',
      userName: this.formatUserName(user),
      applicationId: dto.applicationId,
      applicationName: application.name,
      licenseTypeId: dto.licenseTypeId,
      licenseTypeName: licenseType.name,
    });

    return {
      assignmentId: assignment.id,
      message: `License "${licenseType.name}" granted successfully to ${user.email}`,
    };
  }

  /**
   * Revoke a license from a user
   */
  async revokeLicense(dto: {
    tenantId: string;
    userId: string;
    applicationId: string;
  }): Promise<{ message: string }> {
    // Find the license assignment
    const assignment = await this.prisma.licenseAssignment.findFirst({
      where: {
        userId: dto.userId,
        tenantId: dto.tenantId,
        applicationId: dto.applicationId,
      },
      include: { subscription: true },
    });

    if (!assignment) {
      throw new NotFoundException('License assignment not found for this user, tenant, and application');
    }

    // Delete the assignment
    await this.prisma.licenseAssignment.delete({
      where: { id: assignment.id },
    });

    // Update subscription assigned count if linked to a subscription
    if (assignment.subscriptionId) {
      await this.prisma.appSubscription.update({
        where: { id: assignment.subscriptionId },
        data: { quantityAssigned: { decrement: 1 } },
      });
    }

    // Create audit log entry
    const user = await this.prisma.user.findUnique({ where: { id: dto.userId } });
    const application = await this.prisma.application.findUnique({ where: { id: dto.applicationId } });

    await this.createAuditLog({
      action: 'REVOKED',
      tenantId: dto.tenantId,
      userId: dto.userId,
      userEmail: user?.email || '',
      userName: user ? this.formatUserName(user) : undefined,
      applicationId: dto.applicationId,
      applicationName: application?.name || '',
      licenseTypeId: assignment.licenseTypeId,
      licenseTypeName: assignment.licenseTypeName,
    });

    return { message: `License revoked successfully` };
  }

  /**
   * Change a user's license type
   */
  async changeLicenseType(dto: {
    tenantId: string;
    userId: string;
    applicationId: string;
    newLicenseTypeId: string;
  }): Promise<{ message: string }> {
    // Find existing assignment
    const existing = await this.prisma.licenseAssignment.findFirst({
      where: {
        userId: dto.userId,
        tenantId: dto.tenantId,
        applicationId: dto.applicationId,
      },
      include: { subscription: true },
    });

    if (!existing) {
      throw new NotFoundException('User does not have a license for this application');
    }

    // Check that new license type exists
    const newLicenseType = await this.prisma.licenseType.findUnique({
      where: { id: dto.newLicenseTypeId },
    });
    if (!newLicenseType) {
      throw new NotFoundException('New license type not found');
    }

    // Check for active subscription with available seats
    const newSubscription = await this.prisma.appSubscription.findFirst({
      where: {
        tenantId: dto.tenantId,
        applicationId: dto.applicationId,
        licenseTypeId: dto.newLicenseTypeId,
        status: 'ACTIVE',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!newSubscription) {
      throw new BadRequestException(
        `No active subscription found for license type "${newLicenseType.name}"`,
      );
    }

    const isDifferentSubscription = newSubscription.id !== existing.subscriptionId;
    if (newSubscription.quantityAssigned >= newSubscription.quantityPurchased && isDifferentSubscription) {
      throw new BadRequestException(
        `No available seats for license type "${newLicenseType.name}"`,
      );
    }

    // Update the assignment
    await this.prisma.licenseAssignment.update({
      where: { id: existing.id },
      data: {
        licenseTypeId: dto.newLicenseTypeId,
        licenseTypeName: newLicenseType.name,
        subscriptionId: newSubscription.id,
      },
    });

    // Update subscription counts
    if (existing.subscriptionId) {
      await this.prisma.appSubscription.update({
        where: { id: existing.subscriptionId },
        data: { quantityAssigned: { decrement: 1 } },
      });
    }

    if (isDifferentSubscription) {
      await this.prisma.appSubscription.update({
        where: { id: newSubscription.id },
        data: { quantityAssigned: { increment: 1 } },
      });
    }

    // Create audit log entry
    const user = await this.prisma.user.findUnique({ where: { id: dto.userId } });
    const application = await this.prisma.application.findUnique({ where: { id: dto.applicationId } });

    await this.createAuditLog({
      action: 'CHANGED',
      tenantId: dto.tenantId,
      userId: dto.userId,
      userEmail: user?.email || '',
      userName: user ? this.formatUserName(user) : undefined,
      applicationId: dto.applicationId,
      applicationName: application?.name || '',
      licenseTypeId: dto.newLicenseTypeId,
      licenseTypeName: newLicenseType.name,
      previousLicenseTypeName: existing.licenseTypeName,
    });

    return {
      message: `License type changed to "${newLicenseType.name}" successfully`,
    };
  }

  /**
   * Get all licenses for a user in a tenant
   */
  async getUserLicenses(tenantId: string, userId: string): Promise<LicenseInfo[]> {
    const assignments = await this.prisma.licenseAssignment.findMany({
      where: {
        tenantId,
        userId,
      },
    });

    // Fetch applications and license types in parallel
    const applicationIds = [...new Set(assignments.map((a) => a.applicationId))];
    const licenseTypeIds = [...new Set(assignments.map((a) => a.licenseTypeId))];

    const [applications, licenseTypes] = await Promise.all([
      this.prisma.application.findMany({
        where: { id: { in: applicationIds } },
      }),
      this.prisma.licenseType.findMany({
        where: { id: { in: licenseTypeIds } },
      }),
    ]);

    const applicationMap = new Map(applications.map((a) => [a.id, a]));
    const licenseTypeMap = new Map(licenseTypes.map((lt) => [lt.id, lt]));

    return assignments.map((a) => {
      const application = applicationMap.get(a.applicationId);
      const licenseType = licenseTypeMap.get(a.licenseTypeId);
      return {
        id: a.id,
        licenseTypeId: a.licenseTypeId,
        licenseTypeName: a.licenseTypeName,
        licenseTypeSlug: licenseType?.slug || '',
        applicationId: a.applicationId,
        applicationName: application?.name || '',
        assignedAt: a.assignedAt.toISOString(),
      };
    });
  }

  /**
   * Get all license holders for an application in a tenant
   */
  async getLicenseHolders(
    tenantId: string,
    applicationId: string,
  ): Promise<LicenseHolderInfo[]> {
    const assignments = await this.prisma.licenseAssignment.findMany({
      where: {
        tenantId,
        applicationId,
      },
    });

    // Fetch users
    const userIds = [...new Set(assignments.map((a) => a.userId))];
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
    });

    const userMap = new Map(users.map((u) => [u.id, u]));

    return assignments.map((a) => {
      const user = userMap.get(a.userId);
      return {
        userId: a.userId,
        userEmail: user?.email || '',
        userName: user ? this.formatUserName(user) : undefined,
        licenseTypeId: a.licenseTypeId,
        licenseTypeName: a.licenseTypeName,
        assignedAt: a.assignedAt.toISOString(),
      };
    });
  }

  /**
   * Get license audit log for a tenant
   */
  async getLicenseAuditLog(
    tenantId: string,
    options: {
      userId?: string;
      applicationId?: string;
      limit?: number;
      offset?: number;
    },
  ) {
    const where: any = { tenantId };

    if (options.userId) {
      where.userId = options.userId;
    }

    if (options.applicationId) {
      where.applicationId = options.applicationId;
    }

    const [entries, total] = await Promise.all([
      this.prisma.licenseAuditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: options.limit || 50,
        skip: options.offset || 0,
      }),
      this.prisma.licenseAuditLog.count({ where }),
    ]);

    return {
      entries,
      total,
      limit: options.limit || 50,
      offset: options.offset || 0,
    };
  }

  /**
   * Get usage overview for a tenant
   */
  async getUsageOverview(tenantId: string) {
    const subscriptions = await this.prisma.appSubscription.findMany({
      where: {
        tenantId,
        status: 'ACTIVE',
      },
      include: {
        application: true,
        licenseType: true,
      },
    });

    let totalSeats = 0;
    let totalAssigned = 0;
    const overageApplications: string[] = [];

    const applications = subscriptions.map((sub) => {
      const seatsAvailable = sub.quantityPurchased - sub.quantityAssigned;
      totalSeats += sub.quantityPurchased;
      totalAssigned += sub.quantityAssigned;

      if (seatsAvailable < 0) {
        overageApplications.push(sub.application.name);
      }

      return {
        applicationId: sub.applicationId,
        applicationName: sub.application.name,
        licenseTypeName: sub.licenseType.name,
        totalSeats: sub.quantityPurchased,
        seatsAssigned: sub.quantityAssigned,
        seatsAvailable,
        utilizationPercentage: sub.quantityPurchased > 0
          ? (sub.quantityAssigned / sub.quantityPurchased) * 100
          : 0,
      };
    });

    return {
      tenantId,
      applications,
      totalSeatsAcrossAllApps: totalSeats,
      totalSeatsAssigned: totalAssigned,
      overallUtilization: totalSeats > 0 ? (totalAssigned / totalSeats) * 100 : 0,
      hasOverage: overageApplications.length > 0,
      overageApplications,
    };
  }

  /**
   * Get usage trends for a tenant
   * Returns daily usage data for the last N days
   */
  async getUsageTrends(tenantId: string, days: number) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get assignment history
    const assignments = await this.prisma.licenseAssignment.findMany({
      where: {
        tenantId,
        assignedAt: { gte: startDate },
      },
      select: {
        assignedAt: true,
        userId: true,
      },
    });

    // Group by date
    const dailyData = new Map<string, { assigned: number; newUsers: Set<string> }>();

    for (let i = 0; i < days; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      const dateKey = date.toISOString().split('T')[0];
      dailyData.set(dateKey, { assigned: 0, newUsers: new Set() });
    }

    for (const assignment of assignments) {
      const dateKey = assignment.assignedAt.toISOString().split('T')[0];
      const dayData = dailyData.get(dateKey);
      if (dayData) {
        dayData.assigned++;
      }
    }

    // Get total assignments to calculate available seats
    const currentAssignments = await this.prisma.licenseAssignment.groupBy({
      by: ['applicationId'],
      where: { tenantId },
      _count: true,
    });

    const totalAvailable = currentAssignments.reduce(
      (sum, group) => sum + group._count,
      0,
    );

    return Array.from(dailyData.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, data]) => ({
        date,
        seatsAssigned: data.assigned,
        seatsAvailable: totalAvailable,
        utilizationPercentage: totalAvailable > 0
          ? (data.assigned / totalAvailable) * 100
          : 0,
      }));
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  private formatUserName(user: { givenName: string | null; familyName: string | null }): string | undefined {
    if (user.givenName && user.familyName) {
      return `${user.givenName} ${user.familyName}`;
    }
    return user.givenName || undefined;
  }

  private async createAuditLog(data: {
    action: 'GRANTED' | 'REVOKED' | 'CHANGED';
    tenantId: string;
    userId: string;
    userEmail: string;
    userName?: string;
    applicationId: string;
    applicationName: string;
    licenseTypeId: string;
    licenseTypeName: string;
    previousLicenseTypeName?: string;
  }): Promise<void> {
    try {
      await this.prisma.licenseAuditLog.create({
        data: {
          tenantId: data.tenantId,
          userId: data.userId,
          userEmail: data.userEmail,
          userName: data.userName,
          applicationId: data.applicationId,
          applicationName: data.applicationName,
          licenseTypeId: data.licenseTypeId,
          licenseTypeName: data.licenseTypeName,
          previousLicenseTypeName: data.previousLicenseTypeName,
          action: data.action,
          performedBy: '',
          performedByEmail: '',
        },
      });
    } catch (err) {
      // Log error but don't fail the operation
      this.logger.error(`Failed to create license ${data.action.toLowerCase()} audit log:`, err);
    }
  }
}
