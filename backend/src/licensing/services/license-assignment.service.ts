import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AccessType } from "@prisma/client";
import { AppAccessService } from "../../authorization";
import { LicensePoolService } from "./license-pool.service";
import { SyncEventService, SYNC_EVENT_TYPES } from "../../sync";
import {
  GrantLicenseInput,
  RevokeLicenseInput,
  ChangeLicenseTypeInput,
  LicenseAssignmentInfo,
  NoSeatsAvailableError,
  UserAlreadyHasLicenseError,
  LicenseTypeFeatures,
  MemberWithLicenses,
} from "../types";

/**
 * LicenseAssignmentService - The Gatekeeper 🔐
 *
 * Manages the explicit assignment of licenses to users.
 * This is where "Alice gets a Pro seat" happens.
 *
 * Key invariant: A user can only have ONE license per app per tenant.
 */
@Injectable()
export class LicenseAssignmentService {
  private readonly logger = new Logger(LicenseAssignmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly licensePoolService: LicensePoolService,
    private readonly appAccessService: AppAccessService,
    private readonly syncEventService: SyncEventService,
  ) {}

  // ===========================================================================
  // GRANT LICENSE (Workflow B from PRD)
  // ===========================================================================

  /**
   * Grant a license to a user
   *
   * This is the core "assign seat" operation:
   * 1. Lock the subscription row
   * 2. Check capacity (assigned < purchased)
   * 3. If no capacity and elastic mode: auto-purchase (TODO)
   * 4. Insert assignment + increment count atomically
   */
  async grantLicense(input: GrantLicenseInput): Promise<LicenseAssignmentInfo> {
    const { tenantId, userId, applicationId, licenseTypeId, assignedById } =
      input;

    // Check if user already has a license for this app in this tenant
    const existingLicense = await this.prisma.licenseAssignment.findUnique({
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

    if (existingLicense) {
      throw new UserAlreadyHasLicenseError(
        tenantId,
        userId,
        applicationId,
        existingLicense.subscription.licenseType.slug,
      );
    }

    // Find the subscription (tenant's inventory for this app+license type)
    const subscription = await this.prisma.appSubscription.findUnique({
      where: {
        tenantId_applicationId_licenseTypeId: {
          tenantId,
          applicationId,
          licenseTypeId,
        },
      },
      include: {
        licenseType: true,
      },
    });

    if (!subscription) {
      throw new NotFoundException(
        `No subscription found for this app/license type. Tenant needs to purchase seats first.`,
      );
    }

    // Check capacity
    const availableSeats =
      subscription.quantityPurchased - subscription.quantityAssigned;

    if (availableSeats <= 0) {
      throw new NoSeatsAvailableError(
        tenantId,
        applicationId,
        licenseTypeId,
        subscription.quantityPurchased,
        subscription.quantityAssigned,
      );
    }

    // Transaction: Create assignment + increment count atomically
    const assignment = await this.prisma.$transaction(async (tx) => {
      // Capture current value for optimistic locking
      const currentAssigned = subscription.quantityAssigned;

      // Try to increment (will fail if no capacity due to race condition)
      const updateResult = await tx.appSubscription.updateMany({
        where: {
          id: subscription.id,
          // Optimistic lock: only update if value hasn't changed AND there's capacity
          quantityAssigned: currentAssigned,
          quantityPurchased: { gt: currentAssigned },
        },
        data: {
          quantityAssigned: { increment: 1 },
        },
      });

      if (updateResult.count === 0) {
        throw new NoSeatsAvailableError(
          tenantId,
          applicationId,
          licenseTypeId,
          subscription.quantityPurchased,
          subscription.quantityAssigned,
        );
      }

      // Create the assignment
      return tx.licenseAssignment.create({
        data: {
          userId,
          tenantId,
          applicationId,
          subscriptionId: subscription.id,
          licenseTypeId: subscription.licenseTypeId,
          licenseTypeName: subscription.licenseType.name,
          assignedById,
        },
        include: {
          subscription: {
            include: { licenseType: true },
          },
        },
      });
    });

    // Create/link AppAccess record
    await this.appAccessService.grantAccess({
      tenantId,
      userId,
      applicationId,
      accessType: AccessType.GRANTED,
      grantedById: assignedById,
      licenseAssignmentId: assignment.id,
    });

    // Create audit log entry
    try {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      const application = await this.prisma.application.findUnique({
        where: { id: applicationId },
      });
      const assignedBy = assignedById
        ? await this.prisma.user.findUnique({ where: { id: assignedById } })
        : null;

      await this.prisma.licenseAuditLog.create({
        data: {
          tenantId,
          userId,
          userEmail: user?.email || "",
          userName:
            user?.givenName && user?.familyName
              ? `${user.givenName} ${user.familyName}`
              : undefined,
          applicationId,
          applicationName: application?.name || "",
          licenseTypeId: subscription.licenseTypeId,
          licenseTypeName: subscription.licenseType.name,
          action: "GRANTED",
          performedBy: assignedById || "",
          performedByEmail: assignedBy?.email || "",
          performedByName:
            assignedBy?.givenName && assignedBy?.familyName
              ? `${assignedBy.givenName} ${assignedBy.familyName}`
              : undefined,
        },
      });
    } catch (err) {
      // Log error but don't fail the grant operation
      console.error("Failed to create license assignment audit log:", err);
    }

    return this.toAssignmentInfo(assignment);
  }

  // ===========================================================================
  // REVOKE LICENSE
  // ===========================================================================

  /**
   * Revoke a license from a user
   * The seat goes back to the pool (shelfware until reassigned)
   */
  async revokeLicense(input: RevokeLicenseInput): Promise<void> {
    const { tenantId, userId, applicationId } = input;

    const assignment = await this.prisma.licenseAssignment.findUnique({
      where: {
        tenantId_userId_applicationId: {
          tenantId,
          userId,
          applicationId,
        },
      },
    });

    if (!assignment) {
      throw new NotFoundException(
        `User does not have a license for this application`,
      );
    }

    // Transaction: Delete assignment + decrement count
    await this.prisma.$transaction(async (tx) => {
      await tx.licenseAssignment.delete({
        where: { id: assignment.id },
      });

      // Decrement with floor of 0 using optimistic locking
      await tx.appSubscription.updateMany({
        where: {
          id: assignment.subscriptionId,
          quantityAssigned: { gt: 0 },
        },
        data: {
          quantityAssigned: { decrement: 1 },
        },
      });
    });

    // Also revoke AppAccess
    await this.appAccessService.revokeAccess({
      tenantId,
      userId,
      applicationId,
    });

    // Get user info for audit log and webhook
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const application = await this.prisma.application.findUnique({
      where: { id: applicationId },
    });

    // Emit app_access.revoked webhook event
    this.syncEventService
      .emit(SYNC_EVENT_TYPES.APP_ACCESS_REVOKED, tenantId, applicationId, {
        sub: userId,
        email: user?.email,
        given_name: user?.givenName,
        family_name: user?.familyName,
        license_type_id: assignment.licenseTypeId,
        license_type_name: assignment.licenseTypeName,
      })
      .catch((err) =>
        this.logger.warn(`Failed to emit app_access.revoked: ${err.message}`),
      );

    // Create audit log entry
    try {
      await this.prisma.licenseAuditLog.create({
        data: {
          tenantId,
          userId,
          userEmail: user?.email || "",
          userName:
            user?.givenName && user?.familyName
              ? `${user.givenName} ${user.familyName}`
              : undefined,
          applicationId,
          applicationName: application?.name || "",
          licenseTypeId: assignment.licenseTypeId,
          licenseTypeName: assignment.licenseTypeName,
          action: "REVOKED",
          performedBy: "",
          performedByEmail: "",
        },
      });
    } catch (err) {
      // Log error but don't fail the revoke operation
      console.error("Failed to create license revocation audit log:", err);
    }
  }

  // ===========================================================================
  // CHANGE LICENSE TYPE (Upgrade/Downgrade)
  // ===========================================================================

  /**
   * Change a user's license type for an application
   * e.g., Move Alice from Standard to Pro
   *
   * This is a revoke + grant in one transaction
   */
  async changeLicenseType(
    input: ChangeLicenseTypeInput,
  ): Promise<LicenseAssignmentInfo> {
    const { tenantId, userId, applicationId, newLicenseTypeId, assignedById } =
      input;

    // Get current assignment
    const currentAssignment = await this.prisma.licenseAssignment.findUnique({
      where: {
        tenantId_userId_applicationId: {
          tenantId,
          userId,
          applicationId,
        },
      },
      include: {
        subscription: { include: { licenseType: true } },
      },
    });

    if (!currentAssignment) {
      throw new NotFoundException(`User does not have a license to change`);
    }

    // Check if trying to "change" to same license type
    if (currentAssignment.subscription.licenseTypeId === newLicenseTypeId) {
      throw new BadRequestException(`User is already on this license type`);
    }

    // Find the new license type's subscription
    const newSubscription = await this.prisma.appSubscription.findUnique({
      where: {
        tenantId_applicationId_licenseTypeId: {
          tenantId,
          applicationId,
          licenseTypeId: newLicenseTypeId,
        },
      },
      include: { licenseType: true },
    });

    if (!newSubscription) {
      throw new NotFoundException(
        `Tenant doesn't have a subscription for the new license type. Purchase seats first.`,
      );
    }

    // Check capacity in new license type
    if (newSubscription.quantityAssigned >= newSubscription.quantityPurchased) {
      throw new NoSeatsAvailableError(
        tenantId,
        applicationId,
        newLicenseTypeId,
        newSubscription.quantityPurchased,
        newSubscription.quantityAssigned,
      );
    }

    // Transaction: Move the assignment
    const newAssignment = await this.prisma.$transaction(async (tx) => {
      // Decrement old subscription with floor of 0
      await tx.appSubscription.updateMany({
        where: {
          id: currentAssignment.subscriptionId,
          quantityAssigned: { gt: 0 },
        },
        data: {
          quantityAssigned: { decrement: 1 },
        },
      });

      // Capture current value for optimistic locking on new subscription
      const currentNewAssigned = newSubscription.quantityAssigned;

      // Increment new subscription (with capacity check)
      const updateResult = await tx.appSubscription.updateMany({
        where: {
          id: newSubscription.id,
          // Optimistic lock: only update if value hasn't changed AND there's capacity
          quantityAssigned: currentNewAssigned,
          quantityPurchased: { gt: currentNewAssigned },
        },
        data: {
          quantityAssigned: { increment: 1 },
        },
      });

      if (updateResult.count === 0) {
        throw new NoSeatsAvailableError(
          tenantId,
          applicationId,
          newLicenseTypeId,
          newSubscription.quantityPurchased,
          newSubscription.quantityAssigned,
        );
      }

      // Update the assignment to point to new subscription
      return tx.licenseAssignment.update({
        where: { id: currentAssignment.id },
        data: {
          subscriptionId: newSubscription.id,
          licenseTypeId: newSubscription.licenseTypeId,
          licenseTypeName: newSubscription.licenseType.name,
          assignedById,
          assignedAt: new Date(), // Record license type change time
        },
        include: {
          subscription: { include: { licenseType: true } },
        },
      });
    });

    // Create audit log entry
    try {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      const application = await this.prisma.application.findUnique({
        where: { id: applicationId },
      });
      const assignedBy = assignedById
        ? await this.prisma.user.findUnique({ where: { id: assignedById } })
        : null;

      await this.prisma.licenseAuditLog.create({
        data: {
          tenantId,
          userId,
          userEmail: user?.email || "",
          userName:
            user?.givenName && user?.familyName
              ? `${user.givenName} ${user.familyName}`
              : undefined,
          applicationId,
          applicationName: application?.name || "",
          licenseTypeId: newSubscription.licenseTypeId,
          licenseTypeName: newSubscription.licenseType.name,
          previousLicenseTypeName: currentAssignment.licenseTypeName,
          action: "CHANGED",
          performedBy: assignedById || "",
          performedByEmail: assignedBy?.email || "",
          performedByName:
            assignedBy?.givenName && assignedBy?.familyName
              ? `${assignedBy.givenName} ${assignedBy.familyName}`
              : undefined,
        },
      });
    } catch (err) {
      // Log error but don't fail the change operation
      console.error("Failed to create license change audit log:", err);
    }

    return this.toAssignmentInfo(newAssignment);
  }

  // ===========================================================================
  // QUERY OPERATIONS
  // ===========================================================================

  /**
   * Get all licenses for a user within a tenant
   */
  async getUserLicenses(
    tenantId: string,
    userId: string,
  ): Promise<LicenseAssignmentInfo[]> {
    const assignments = await this.prisma.licenseAssignment.findMany({
      where: { tenantId, userId },
      include: {
        subscription: {
          include: {
            licenseType: true,
            application: { select: { id: true, name: true, slug: true } },
          },
        },
      },
    });

    return assignments.map(this.toAssignmentInfo);
  }

  /**
   * Get all license assignments for a subscription
   */
  async getSubscriptionAssignments(
    subscriptionId: string,
  ): Promise<LicenseAssignmentInfo[]> {
    const assignments = await this.prisma.licenseAssignment.findMany({
      where: { subscriptionId },
      include: {
        subscription: { include: { licenseType: true } },
      },
      orderBy: { assignedAt: "desc" },
    });

    return assignments.map(this.toAssignmentInfo);
  }

  /**
   * Get all users with licenses for a specific app in a tenant
   */
  async getAppLicenseHolders(
    tenantId: string,
    applicationId: string,
  ): Promise<LicenseAssignmentInfo[]> {
    const assignments = await this.prisma.licenseAssignment.findMany({
      where: { tenantId, applicationId },
      include: {
        subscription: { include: { licenseType: true } },
      },
      orderBy: { assignedAt: "desc" },
    });

    return assignments.map(this.toAssignmentInfo);
  }

  /**
   * Get all tenant members with their license assignments
   *
   * This endpoint provides a combined view of:
   * - All tenant members (active, invited, suspended)
   * - Their membership details
   * - All licenses assigned to them
   */
  async getTenantMembersWithLicenses(
    tenantId: string,
  ): Promise<MemberWithLicenses[]> {
    // Get all memberships for the tenant with user info
    const memberships = await this.prisma.membership.findMany({
      where: { tenantId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            givenName: true,
            familyName: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // Get all license assignments for the tenant
    const assignments = await this.prisma.licenseAssignment.findMany({
      where: { tenantId },
      include: {
        subscription: {
          include: {
            licenseType: true,
            application: true,
          },
        },
      },
      orderBy: { assignedAt: "desc" },
    });

    // Build a map of userId -> assignments
    const assignmentsByUser = new Map<string, typeof assignments>();
    for (const assignment of assignments) {
      if (!assignmentsByUser.has(assignment.userId)) {
        assignmentsByUser.set(assignment.userId, []);
      }
      assignmentsByUser.get(assignment.userId)!.push(assignment);
    }

    // Combine memberships with their assignments
    const result: MemberWithLicenses[] = memberships.map((membership) => {
      const userAssignments = assignmentsByUser.get(membership.userId) || [];

      return {
        user: {
          id: membership.user.id,
          email: membership.user.email,
          givenName: membership.user.givenName,
          familyName: membership.user.familyName,
        },
        membership: {
          id: membership.id,
          status: membership.status as "ACTIVE" | "INVITED" | "SUSPENDED",
        },
        licenses: userAssignments.map((assignment) => ({
          id: assignment.id,
          applicationId: assignment.applicationId,
          applicationName: assignment.subscription.application.name,
          licenseTypeId: assignment.licenseTypeId,
          licenseTypeName: assignment.subscription.licenseType.name,
          licenseTypeSlug: assignment.subscription.licenseType.slug,
          assignedAt: assignment.assignedAt,
        })),
      };
    });

    return result;
  }

  // ===========================================================================
  // BULK OPERATIONS
  // ===========================================================================

  /**
   * Revoke all licenses for a user when they're removed from a tenant
   */
  async revokeAllUserLicenses(
    tenantId: string,
    userId: string,
  ): Promise<number> {
    const assignments = await this.prisma.licenseAssignment.findMany({
      where: { tenantId, userId },
      select: { id: true, subscriptionId: true },
    });

    if (assignments.length === 0) return 0;

    await this.prisma.$transaction(async (tx) => {
      // Delete all assignments
      await tx.licenseAssignment.deleteMany({
        where: { tenantId, userId },
      });

      // Decrement each subscription's count
      for (const assignment of assignments) {
        await tx.appSubscription.updateMany({
          where: {
            id: assignment.subscriptionId,
            quantityAssigned: { gt: 0 },
          },
          data: {
            quantityAssigned: { decrement: 1 },
          },
        });
      }
    });

    // Also revoke all AppAccess records for this user in this tenant
    const userAccesses = await this.prisma.appAccess.findMany({
      where: { tenantId, userId },
      select: { applicationId: true },
    });

    // Get user info for webhook events
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    for (const access of userAccesses) {
      await this.appAccessService.revokeAccess({
        tenantId,
        userId,
        applicationId: access.applicationId,
      });

      // Emit app_access.revoked webhook event for each app
      this.syncEventService
        .emit(
          SYNC_EVENT_TYPES.APP_ACCESS_REVOKED,
          tenantId,
          access.applicationId,
          {
            sub: userId,
            email: user?.email,
            given_name: user?.givenName,
            family_name: user?.familyName,
          },
        )
        .catch((err) =>
          this.logger.warn(
            `Failed to emit app_access.revoked for app ${access.applicationId}: ${err.message}`,
          ),
        );
    }

    return assignments.length;
  }

  /**
   * Grant licenses to multiple users in bulk
   *
   * Returns an array of results indicating success or failure for each assignment.
   * Partial success is possible - some assignments may fail while others succeed.
   */
  async grantLicensesBulk(
    assignments: GrantLicenseInput[],
  ): Promise<
    Array<{
      userId: string;
      applicationId: string;
      success: boolean;
      error?: string;
    }>
  > {
    const results = await Promise.allSettled(
      assignments.map(async (assignment) => {
        try {
          await this.grantLicense(assignment);
          return {
            userId: assignment.userId,
            applicationId: assignment.applicationId,
            success: true,
          };
        } catch (error) {
          return {
            userId: assignment.userId,
            applicationId: assignment.applicationId,
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          };
        }
      }),
    );

    return results.map((result, index) => {
      if (result.status === "fulfilled") {
        return result.value;
      } else {
        // Handle rejected promise - shouldn't happen since we catch errors, but just in case
        return {
          userId: assignments[index].userId,
          applicationId: assignments[index].applicationId,
          success: false,
          error: "Unknown error",
        };
      }
    });
  }

  /**
   * Revoke licenses from multiple users in bulk
   *
   * Returns the count of successfully revoked licenses.
   * Partial success is possible - some revocations may fail while others succeed.
   */
  async revokeLicensesBulk(
    revocations: RevokeLicenseInput[],
  ): Promise<{
    revokedCount: number;
    failures: Array<{ userId: string; applicationId: string; error: string }>;
  }> {
    const failures: Array<{
      userId: string;
      applicationId: string;
      error: string;
    }> = [];
    let revokedCount = 0;

    for (const revocation of revocations) {
      try {
        await this.revokeLicense(revocation);
        revokedCount++;
      } catch (error) {
        failures.push({
          userId: revocation.userId,
          applicationId: revocation.applicationId,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return { revokedCount, failures };
  }

  // ===========================================================================
  // HELPERS
  // ===========================================================================

  private toAssignmentInfo(assignment: {
    id: string;
    userId: string;
    applicationId: string;
    assignedAt: Date;
    assignedById: string | null;
    subscription: {
      licenseTypeId: string;
      licenseType: {
        name: string;
        slug: string;
        features: unknown;
      };
    };
  }): LicenseAssignmentInfo {
    return {
      id: assignment.id,
      userId: assignment.userId,
      applicationId: assignment.applicationId,
      licenseTypeId: assignment.subscription.licenseTypeId,
      licenseTypeName: assignment.subscription.licenseType.name,
      licenseTypeSlug: assignment.subscription.licenseType.slug,
      features:
        (assignment.subscription.licenseType.features as LicenseTypeFeatures) ||
        {},
      assignedAt: assignment.assignedAt,
      assignedById: assignment.assignedById ?? undefined,
    };
  }
}
