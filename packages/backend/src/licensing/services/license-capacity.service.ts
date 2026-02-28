import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MemberAccessResult } from '../types';

/**
 * LicenseCapacityService - Capacity Checks 📊
 *
 * Handles all capacity-related checks for licensing:
 * - Seat availability checks
 * - Member limit checks
 * - Assignment count management
 */
@Injectable()
export class LicenseCapacityService {
  private readonly logger = new Logger(LicenseCapacityService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Check if a new member can be added to an application
   *
   * Handles all three licensing modes:
   * - FREE: Uses auto-provisioned tenant-wide subscription
   * - PER_SEAT: Check if seats are available
   * - TENANT_WIDE: Check if member limit is not reached
   */
  async checkMemberAccess(
    tenantId: string,
    applicationId: string,
  ): Promise<MemberAccessResult> {
    const app = await this.prisma.application.findUnique({
      where: { id: applicationId },
      select: { id: true, name: true, licensingMode: true },
    });

    if (!app) {
      return { allowed: false, reason: 'Application not found', mode: 'FREE' };
    }

    const mode = app.licensingMode;

    if (mode === 'FREE' || mode === 'TENANT_WIDE') {
      return this.checkMemberLimitAccess(tenantId, applicationId, mode);
    }

    if (mode === 'PER_SEAT') {
      return this.checkSeatAccess(tenantId, applicationId);
    }

    return { allowed: false, mode: 'FREE', reason: `Unknown licensing mode: ${mode}` };
  }

  private async checkMemberLimitAccess(
    tenantId: string,
    applicationId: string,
    mode: 'FREE' | 'TENANT_WIDE',
  ): Promise<MemberAccessResult> {
    const subscription = await this.prisma.appSubscription.findFirst({
      where: {
        tenantId,
        applicationId,
        status: { in: ['ACTIVE', 'TRIALING'] },
      },
      include: {
        licenseType: { select: { id: true, maxMembers: true, name: true } },
      },
      orderBy: { licenseType: { displayOrder: 'desc' } },
    });

    if (!subscription) {
      return { allowed: false, mode, reason: 'No active subscription for this application' };
    }

    const maxMembers = subscription.licenseType.maxMembers;

    if (!maxMembers) {
      return {
        allowed: true,
        mode,
        message: 'Unlimited members allowed',
        memberLimit: { maxMembers: null, currentMembers: 0, available: null },
      };
    }

    const currentMembers = await this.prisma.membership.count({
      where: { tenantId, status: 'ACTIVE' },
    });

    const available = maxMembers - currentMembers;

    if (available <= 0) {
      return {
        allowed: false,
        mode,
        reason: `Member limit reached (${maxMembers} members max)`,
        memberLimit: { maxMembers, currentMembers, available: 0 },
      };
    }

    return {
      allowed: true,
      mode,
      message: `${available} member slot${available > 1 ? 's' : ''} remaining`,
      memberLimit: { maxMembers, currentMembers, available },
    };
  }

  private async checkSeatAccess(
    tenantId: string,
    applicationId: string,
  ): Promise<MemberAccessResult> {
    const subscriptions = await this.prisma.appSubscription.findMany({
      where: {
        tenantId,
        applicationId,
        status: { in: ['ACTIVE', 'TRIALING'] },
      },
      include: { licenseType: { select: { id: true, name: true, slug: true } } },
    });

    if (subscriptions.length === 0) {
      return { allowed: false, mode: 'PER_SEAT', reason: 'No active subscriptions for this application' };
    }

    const totalPurchased = subscriptions.reduce((sum, sub) => sum + sub.quantityPurchased, 0);
    const totalAssigned = subscriptions.reduce((sum, sub) => sum + sub.quantityAssigned, 0);
    const totalAvailable = totalPurchased - totalAssigned;

    if (totalAvailable <= 0) {
      return {
        allowed: false,
        mode: 'PER_SEAT',
        reason: 'No seats available',
        capacity: { available: 0, purchased: totalPurchased, assigned: totalAssigned },
      };
    }

    return {
      allowed: true,
      mode: 'PER_SEAT',
      message: `${totalAvailable} seat${totalAvailable > 1 ? 's' : ''} available`,
      capacity: { available: totalAvailable, purchased: totalPurchased, assigned: totalAssigned },
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
    licenseTypeId: string,
  ): Promise<{ available: number; purchased: number; assigned: number } | null> {
    const subscription = await this.prisma.appSubscription.findUnique({
      where: {
        tenantId_applicationId_licenseTypeId: { tenantId, applicationId, licenseTypeId },
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

  /**
   * Increment the assigned count (called when granting a license)
   * Uses optimistic locking for concurrency safety
   */
  async incrementAssignedCount(subscriptionId: string): Promise<void> {
    const subscription = await this.prisma.appSubscription.findUnique({
      where: { id: subscriptionId },
      select: { quantityAssigned: true, quantityPurchased: true },
    });

    if (!subscription) {
      throw new BadRequestException('Subscription not found');
    }

    const result = await this.prisma.appSubscription.updateMany({
      where: {
        id: subscriptionId,
        quantityAssigned: subscription.quantityAssigned,
        quantityPurchased: { gt: subscription.quantityAssigned },
      },
      data: { quantityAssigned: { increment: 1 } },
    });

    if (result.count === 0) {
      throw new BadRequestException('No seats available or subscription not found');
    }
  }

  /**
   * Decrement the assigned count (called when revoking a license)
   */
  async decrementAssignedCount(subscriptionId: string): Promise<void> {
    await this.prisma.appSubscription.updateMany({
      where: { id: subscriptionId, quantityAssigned: { gt: 0 } },
      data: { quantityAssigned: { decrement: 1 } },
    });
  }

  /**
   * Reconcile assigned count with actual assignments
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
}
