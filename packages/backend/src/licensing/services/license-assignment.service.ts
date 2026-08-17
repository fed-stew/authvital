import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessType, Prisma } from '@prisma/client';
import { AppAccessService } from '../../authorization';
import { LicensePoolService } from './license-pool.service';
import { SyncEventService, SYNC_EVENT_TYPES } from '../../sync';
import { AuditService } from '../../audit/audit.service';
import { AUDIT_ACTIONS, AUDIT_TARGET_TYPES } from '../../audit/audit-actions';
import {
  GrantLicenseInput,
  RevokeLicenseInput,
  ChangeLicenseTypeInput,
  LicenseAssignmentInternal,
  NoSeatsAvailableError,
  UserAlreadyHasLicenseError,
  LicenseTypeFeatures,
  MemberWithLicensesInternal,
} from '../types';

/**
 * LicenseAssignmentService - The Gatekeeper 🔐
 *
 * Manages the explicit assignment of licenses to users.
 * Bulk operations are in LicenseAssignmentBulkService.
 */
@Injectable()
export class LicenseAssignmentService {
  private readonly logger = new Logger(LicenseAssignmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly licensePoolService: LicensePoolService,
    private readonly appAccessService: AppAccessService,
    private readonly syncEventService: SyncEventService,
    private readonly auditService: AuditService,
  ) {}

  async grantLicense(input: GrantLicenseInput): Promise<LicenseAssignmentInternal> {
    const { tenantId, userId, applicationId, licenseTypeId, assignedById } = input;

    const existingLicense = await this.prisma.licenseAssignment.findUnique({
      where: { tenantId_userId_applicationId: { tenantId, userId, applicationId } },
      include: { subscription: { include: { licenseType: true } } },
    });

    if (existingLicense) {
      throw new UserAlreadyHasLicenseError(
        tenantId, userId, applicationId, existingLicense.subscription.licenseType.slug,
      );
    }

    const subscription = await this.prisma.appSubscription.findUnique({
      where: { tenantId_applicationId_licenseTypeId: { tenantId, applicationId, licenseTypeId } },
      include: { licenseType: true },
    });

    if (!subscription) {
      throw new NotFoundException('No subscription found for this app/license type.');
    }

    const availableSeats = subscription.quantityPurchased - subscription.quantityAssigned;
    if (availableSeats <= 0) {
      throw new NoSeatsAvailableError(
        tenantId, applicationId, licenseTypeId,
        subscription.quantityPurchased, subscription.quantityAssigned,
      );
    }

    let grantShouldDispatch = false;
    const assignment = await this.prisma.$transaction(async (tx) => {
      const currentAssigned = subscription.quantityAssigned;

      const updateResult = await tx.appSubscription.updateMany({
        where: {
          id: subscription.id,
          quantityAssigned: currentAssigned,
          quantityPurchased: { gt: currentAssigned },
        },
        data: { quantityAssigned: { increment: 1 } },
      });

      if (updateResult.count === 0) {
        throw new NoSeatsAvailableError(
          tenantId, applicationId, licenseTypeId,
          subscription.quantityPurchased, subscription.quantityAssigned,
        );
      }

      let created;
      try {
        created = await tx.licenseAssignment.create({
          data: {
            userId, tenantId, applicationId,
            subscriptionId: subscription.id,
            licenseTypeId: subscription.licenseTypeId,
            licenseTypeName: subscription.licenseType.name,
            assignedById,
          },
          include: { subscription: { include: { licenseType: true } } },
        });
      } catch (err) {
        // Lost a concurrent race for the same (tenant, user, app) seat: the
        // pre-check passed but the unique constraint fired. Surface a clean 409
        // instead of leaking a raw Prisma P2002 as a 500.
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          throw new UserAlreadyHasLicenseError(
            tenantId, userId, applicationId, subscription.licenseType.slug,
          );
        }
        throw err;
      }

      // Fold the entitlement write into the SAME txn: either both the seat and
      // the AppAccess row commit, or neither does. No more half-granted state.
      const grant = await this.appAccessService.grantAccessTx(tx, {
        tenantId, userId, applicationId,
        accessType: AccessType.GRANTED,
        grantedById: assignedById,
        licenseAssignmentId: created.id,
      });
      grantShouldDispatch = grant.shouldDispatch;

      return created;
    });

    // Fetch once; reused by the identity-sync emits below.
    const grantedUser = await this.prisma.user.findUnique({ where: { id: userId } });

    // Emit events ONLY after the txn is durable (never on a rollback).
    if (grantShouldDispatch) {
      this.appAccessService
        .dispatchAccessGrantedEvent({
          tenantId, userId, applicationId,
          accessType: AccessType.GRANTED,
          grantedById: assignedById,
          licenseAssignmentId: assignment.id,
        })
        .catch((err) => this.logger.warn(`Failed to dispatch tenant.app.granted: ${err.message}`));

      // Identity-sync: also emit app_access.granted so consumers that provision
      // users off app_access.* pick up grants made via the Licenses portal, not
      // just via the app's members page. Mirrors revokeLicense's
      // app_access.revoked below (fixes the grant/revoke asymmetry). A portal
      // seat grant carries no app role, so role_* are empty; license_type_* is
      // included for context (same shape as the revoke event).
      this.syncEventService
        .emit(SYNC_EVENT_TYPES.APP_ACCESS_GRANTED, tenantId, applicationId, {
          sub: userId,
          email: grantedUser?.email,
          given_name: grantedUser?.givenName,
          family_name: grantedUser?.familyName,
          role_id: '',
          role_name: '',
          role_slug: '',
          license_type_id: subscription.licenseTypeId,
          license_type_name: subscription.licenseType.name,
        })
        .catch((err) => this.logger.warn(`Failed to emit app_access.granted: ${err.message}`));
    }

    await this.createAuditLog('GRANTED', assignment, subscription, assignedById);

    // Also record in the unified tenant audit trail (the license-specific
    // LicenseAuditLog above is retained for the licensing UI).
    await this.auditService.log({
      tenantId,
      actorUserId: assignedById,
      action: AUDIT_ACTIONS.LICENSE_GRANTED,
      targetType: AUDIT_TARGET_TYPES.LICENSE_ASSIGNMENT,
      targetId: assignment.id,
      metadata: {
        userId,
        applicationId,
        licenseTypeId,
        licenseTypeName: subscription.licenseType.name,
      },
    });

    // Notify downstream apps that a paid seat was consumed. This is distinct
    // from tenant.app.granted (system webhook) / app_access.granted: license.*
    // is the per-app identity-sync signal for seat/billing reconciliation.
    this.syncEventService
      .emit(SYNC_EVENT_TYPES.LICENSE_ASSIGNED, tenantId, applicationId, {
        assignment_id: assignment.id,
        sub: userId,
        email: grantedUser?.email,
        license_type_id: subscription.licenseTypeId,
        license_type_name: subscription.licenseType.name,
      })
      .catch((err) => this.logger.warn(`Failed to emit license.assigned: ${err.message}`));

    return this.toAssignmentInfo(assignment);
  }

  async revokeLicense(input: RevokeLicenseInput): Promise<void> {
    const { tenantId, userId, applicationId } = input;

    const assignment = await this.prisma.licenseAssignment.findUnique({
      where: { tenantId_userId_applicationId: { tenantId, userId, applicationId } },
    });

    if (!assignment) {
      throw new NotFoundException('User does not have a license for this application');
    }

    let revokeShouldDispatch = false;
    await this.prisma.$transaction(async (tx) => {
      await tx.licenseAssignment.delete({ where: { id: assignment.id } });
      await tx.appSubscription.updateMany({
        where: { id: assignment.subscriptionId, quantityAssigned: { gt: 0 } },
        data: { quantityAssigned: { decrement: 1 } },
      });
      // Revoke the entitlement in the SAME txn as the seat release.
      const revoke = await this.appAccessService.revokeAccessTx(tx, { tenantId, userId, applicationId });
      revokeShouldDispatch = revoke.shouldDispatch;
    });

    if (revokeShouldDispatch) {
      this.appAccessService
        .dispatchAccessRevokedEvent({ tenantId, userId, applicationId })
        .catch((err) => this.logger.warn(`Failed to dispatch tenant.app.revoked: ${err.message}`));
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    this.syncEventService
      .emit(SYNC_EVENT_TYPES.APP_ACCESS_REVOKED, tenantId, applicationId, {
        sub: userId,
        email: user?.email,
        given_name: user?.givenName,
        family_name: user?.familyName,
        license_type_id: assignment.licenseTypeId,
        license_type_name: assignment.licenseTypeName,
      })
      .catch((err) => this.logger.warn(`Failed to emit app_access.revoked: ${err.message}`));

    this.syncEventService
      .emit(SYNC_EVENT_TYPES.LICENSE_REVOKED, tenantId, applicationId, {
        assignment_id: assignment.id,
        sub: userId,
        email: user?.email,
      })
      .catch((err) => this.logger.warn(`Failed to emit license.revoked: ${err.message}`));

    await this.createRevokeAuditLog(tenantId, userId, applicationId, assignment);

    await this.auditService.log({
      tenantId,
      action: AUDIT_ACTIONS.LICENSE_REVOKED,
      targetType: AUDIT_TARGET_TYPES.LICENSE_ASSIGNMENT,
      targetId: assignment.id,
      metadata: {
        userId,
        applicationId,
        licenseTypeId: assignment.licenseTypeId,
        licenseTypeName: assignment.licenseTypeName,
      },
    });
  }

  async changeLicenseType(input: ChangeLicenseTypeInput): Promise<LicenseAssignmentInternal> {
    const { tenantId, userId, applicationId, newLicenseTypeId, assignedById } = input;

    const currentAssignment = await this.prisma.licenseAssignment.findUnique({
      where: { tenantId_userId_applicationId: { tenantId, userId, applicationId } },
      include: { subscription: { include: { licenseType: true } } },
    });

    if (!currentAssignment) {
      throw new NotFoundException('User does not have a license to change');
    }

    if (currentAssignment.subscription.licenseTypeId === newLicenseTypeId) {
      throw new BadRequestException('User is already on this license type');
    }

    const newSubscription = await this.prisma.appSubscription.findUnique({
      where: { tenantId_applicationId_licenseTypeId: { tenantId, applicationId, licenseTypeId: newLicenseTypeId } },
      include: { licenseType: true },
    });

    if (!newSubscription) {
      throw new NotFoundException('Tenant doesn\'t have a subscription for the new license type.');
    }

    if (newSubscription.quantityAssigned >= newSubscription.quantityPurchased) {
      throw new NoSeatsAvailableError(
        tenantId, applicationId, newLicenseTypeId,
        newSubscription.quantityPurchased, newSubscription.quantityAssigned,
      );
    }

    const newAssignment = await this.prisma.$transaction(async (tx) => {
      await tx.appSubscription.updateMany({
        where: { id: currentAssignment.subscriptionId, quantityAssigned: { gt: 0 } },
        data: { quantityAssigned: { decrement: 1 } },
      });

      const currentNewAssigned = newSubscription.quantityAssigned;
      const updateResult = await tx.appSubscription.updateMany({
        where: {
          id: newSubscription.id,
          quantityAssigned: currentNewAssigned,
          quantityPurchased: { gt: currentNewAssigned },
        },
        data: { quantityAssigned: { increment: 1 } },
      });

      if (updateResult.count === 0) {
        throw new NoSeatsAvailableError(
          tenantId, applicationId, newLicenseTypeId,
          newSubscription.quantityPurchased, newSubscription.quantityAssigned,
        );
      }

      return tx.licenseAssignment.update({
        where: { id: currentAssignment.id },
        data: {
          subscriptionId: newSubscription.id,
          licenseTypeId: newSubscription.licenseTypeId,
          licenseTypeName: newSubscription.licenseType.name,
          assignedById,
          assignedAt: new Date(),
        },
        include: { subscription: { include: { licenseType: true } } },
      });
    });

    // Notify downstream apps that the user's tier/features changed. Without
    // this, apps gating on features go stale until their next license check.
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    this.syncEventService
      .emit(SYNC_EVENT_TYPES.LICENSE_CHANGED, tenantId, applicationId, {
        assignment_id: newAssignment.id,
        sub: userId,
        email: user?.email,
        license_type_id: newSubscription.licenseTypeId,
        license_type_name: newSubscription.licenseType.name,
        previous_license_type_id: currentAssignment.subscription.licenseTypeId,
        previous_license_type_name: currentAssignment.subscription.licenseType.name,
      })
      .catch((err) => this.logger.warn(`Failed to emit license.changed: ${err.message}`));

    await this.createChangeAuditLog(newAssignment, newSubscription, currentAssignment, assignedById);

    await this.auditService.log({
      tenantId,
      actorUserId: assignedById,
      action: AUDIT_ACTIONS.LICENSE_CHANGED,
      targetType: AUDIT_TARGET_TYPES.LICENSE_ASSIGNMENT,
      targetId: newAssignment.id,
      metadata: {
        userId,
        applicationId,
        newLicenseTypeId: newSubscription.licenseTypeId,
        newLicenseTypeName: newSubscription.licenseType.name,
        previousLicenseTypeName: currentAssignment.subscription.licenseType.name,
      },
    });

    return this.toAssignmentInfo(newAssignment);
  }

  // ===========================================================================
  // QUERY OPERATIONS
  // ===========================================================================

  async getUserLicenses(tenantId: string, userId: string): Promise<LicenseAssignmentInternal[]> {
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

  async getSubscriptionAssignments(subscriptionId: string): Promise<LicenseAssignmentInternal[]> {
    const assignments = await this.prisma.licenseAssignment.findMany({
      where: { subscriptionId },
      include: { subscription: { include: { licenseType: true } } },
      orderBy: { assignedAt: 'desc' },
    });
    return assignments.map(this.toAssignmentInfo);
  }

  async getAppLicenseHolders(tenantId: string, applicationId: string): Promise<LicenseAssignmentInternal[]> {
    const assignments = await this.prisma.licenseAssignment.findMany({
      where: { tenantId, applicationId },
      include: { subscription: { include: { licenseType: true } } },
      orderBy: { assignedAt: 'desc' },
    });
    return assignments.map(this.toAssignmentInfo);
  }

  async getTenantMembersWithLicenses(tenantId: string): Promise<MemberWithLicensesInternal[]> {
    const memberships = await this.prisma.membership.findMany({
      where: { tenantId },
      include: {
        user: { select: { id: true, email: true, givenName: true, familyName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const assignments = await this.prisma.licenseAssignment.findMany({
      where: { tenantId },
      include: { subscription: { include: { licenseType: true, application: true } } },
      orderBy: { assignedAt: 'desc' },
    });

    const assignmentsByUser = new Map<string, typeof assignments>();
    for (const assignment of assignments) {
      const userAssignments = assignmentsByUser.get(assignment.userId) ?? [];
      userAssignments.push(assignment);
      assignmentsByUser.set(assignment.userId, userAssignments);
    }

    return memberships.map((membership) => {
      const userAssignments = assignmentsByUser.get(membership.userId) || [];
      return {
        user: membership.user,
        membership: { id: membership.id, status: membership.status as 'ACTIVE' | 'INVITED' | 'SUSPENDED' },
        licenses: userAssignments.map((a) => ({
          id: a.id,
          applicationId: a.applicationId,
          applicationName: a.subscription.application.name,
          licenseTypeId: a.licenseTypeId,
          licenseTypeName: a.subscription.licenseType.name,
          licenseTypeSlug: a.subscription.licenseType.slug,
          assignedAt: a.assignedAt,
        })),
      };
    });
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  private toAssignmentInfo(assignment: {
    id: string;
    userId: string;
    applicationId: string;
    assignedAt: Date;
    assignedById: string | null;
    subscription: { licenseTypeId: string; licenseType: { name: string; slug: string; features: unknown } };
  }): LicenseAssignmentInternal {
    return {
      id: assignment.id,
      userId: assignment.userId,
      applicationId: assignment.applicationId,
      licenseTypeId: assignment.subscription.licenseTypeId,
      licenseTypeName: assignment.subscription.licenseType.name,
      licenseTypeSlug: assignment.subscription.licenseType.slug,
      features: (assignment.subscription.licenseType.features as LicenseTypeFeatures) || {},
      assignedAt: assignment.assignedAt,
      assignedById: assignment.assignedById ?? undefined,
    };
  }

  private async createAuditLog(action: 'GRANTED' | 'REVOKED' | 'CHANGED', assignment: any, subscription: any, assignedById?: string) {
    try {
      const [user, application, assignedBy] = await Promise.all([
        this.prisma.user.findUnique({ where: { id: assignment.userId } }),
        this.prisma.application.findUnique({ where: { id: assignment.applicationId } }),
        assignedById ? this.prisma.user.findUnique({ where: { id: assignedById } }) : null,
      ]);

      await this.prisma.licenseAuditLog.create({
        data: {
          tenantId: assignment.tenantId,
          userId: assignment.userId,
          userEmail: user?.email || '',
          userName: user?.givenName && user?.familyName ? `${user.givenName} ${user.familyName}` : undefined,
          applicationId: assignment.applicationId,
          applicationName: application?.name || '',
          licenseTypeId: subscription.licenseTypeId,
          licenseTypeName: subscription.licenseType.name,
          action,
          performedBy: assignedById || '',
          performedByEmail: assignedBy?.email || '',
          performedByName: assignedBy?.givenName && assignedBy?.familyName
            ? `${assignedBy.givenName} ${assignedBy.familyName}` : undefined,
        },
      });
    } catch (err) {
      console.error('Failed to create audit log:', err);
    }
  }

  private async createRevokeAuditLog(tenantId: string, userId: string, applicationId: string, assignment: any) {
    try {
      const [user, application] = await Promise.all([
        this.prisma.user.findUnique({ where: { id: userId } }),
        this.prisma.application.findUnique({ where: { id: applicationId } }),
      ]);

      await this.prisma.licenseAuditLog.create({
        data: {
          tenantId, userId, applicationId,
          userEmail: user?.email || '',
          userName: user?.givenName && user?.familyName ? `${user.givenName} ${user.familyName}` : undefined,
          applicationName: application?.name || '',
          licenseTypeId: assignment.licenseTypeId,
          licenseTypeName: assignment.licenseTypeName,
          action: 'REVOKED',
          performedBy: '',
          performedByEmail: '',
        },
      });
    } catch (err) {
      console.error('Failed to create revoke audit log:', err);
    }
  }

  private async createChangeAuditLog(newAssignment: any, newSubscription: any, currentAssignment: any, assignedById?: string) {
    try {
      const [user, application, assignedBy] = await Promise.all([
        this.prisma.user.findUnique({ where: { id: newAssignment.userId } }),
        this.prisma.application.findUnique({ where: { id: newAssignment.applicationId } }),
        assignedById ? this.prisma.user.findUnique({ where: { id: assignedById } }) : null,
      ]);

      await this.prisma.licenseAuditLog.create({
        data: {
          tenantId: newAssignment.tenantId,
          userId: newAssignment.userId,
          userEmail: user?.email || '',
          userName: user?.givenName && user?.familyName ? `${user.givenName} ${user.familyName}` : undefined,
          applicationId: newAssignment.applicationId,
          applicationName: application?.name || '',
          licenseTypeId: newSubscription.licenseTypeId,
          licenseTypeName: newSubscription.licenseType.name,
          previousLicenseTypeName: currentAssignment.licenseTypeName,
          action: 'CHANGED',
          performedBy: assignedById || '',
          performedByEmail: assignedBy?.email || '',
          performedByName: assignedBy?.givenName && assignedBy?.familyName
            ? `${assignedBy.givenName} ${assignedBy.familyName}` : undefined,
        },
      });
    } catch (err) {
      console.error('Failed to create change audit log:', err);
    }
  }
}
