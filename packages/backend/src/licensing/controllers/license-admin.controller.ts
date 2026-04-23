import { Controller, UseGuards } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { licensingContract as c } from '@authvital/contracts';
import { SuperAdminGuard } from '../../super-admin/guards/super-admin.guard';
import { LicenseTypeService } from '../services/license-type.service';
import { LicensePoolService } from '../services/license-pool.service';
import { LicenseAssignmentService } from '../services/license-assignment.service';
import { LicenseAssignmentBulkService } from '../services/license-assignment-bulk.service';

/**
 * LicenseAdminController — Admin Dashboard API for the License Pool System
 *
 * Migrated to ts-rest contracts for type-safe API communication.
 */
@Controller()
@UseGuards(SuperAdminGuard)
export class LicenseAdminController {
  constructor(
    private readonly licenseTypeService: LicenseTypeService,
    private readonly licensePoolService: LicensePoolService,
    private readonly licenseAssignmentService: LicenseAssignmentService,
    private readonly licenseAssignmentBulkService: LicenseAssignmentBulkService,
  ) {}

  // =========================================================================
  // LICENSE TYPES (Catalog)
  // =========================================================================

  @TsRestHandler(c.createLicenseType)
  async createLicenseType() {
    return tsRestHandler(c.createLicenseType, async ({ body }) => {
      const lt = await this.licenseTypeService.create(body as any);
      return { status: 201 as const, body: lt as any };
    });
  }

  @TsRestHandler(c.getLicenseType)
  async getLicenseType() {
    return tsRestHandler(c.getLicenseType, async ({ params: { id } }) => {
      const lt = await this.licenseTypeService.findById(id);
      return { status: 200 as const, body: lt as any };
    });
  }

  @TsRestHandler(c.getAllLicenseTypes)
  async getAllLicenseTypes() {
    return tsRestHandler(c.getAllLicenseTypes, async ({ query }) => {
      const types = await this.licenseTypeService.findAll(query.includeArchived ?? false);
      return { status: 200 as const, body: types as any };
    });
  }

  @TsRestHandler(c.getApplicationLicenseTypes)
  async getApplicationLicenseTypes() {
    return tsRestHandler(c.getApplicationLicenseTypes, async ({ params: { applicationId }, query }) => {
      const types = await this.licenseTypeService.findByApplication(
        applicationId,
        query.includeArchived ?? false,
      );
      return { status: 200 as const, body: types as any };
    });
  }

  @TsRestHandler(c.updateLicenseType)
  async updateLicenseType() {
    return tsRestHandler(c.updateLicenseType, async ({ params: { id }, body }) => {
      const lt = await this.licenseTypeService.update(id, body as any);
      return { status: 200 as const, body: lt as any };
    });
  }

  @TsRestHandler(c.archiveLicenseType)
  async archiveLicenseType() {
    return tsRestHandler(c.archiveLicenseType, async ({ params: { id } }) => {
      const lt = await this.licenseTypeService.archive(id);
      return { status: 200 as const, body: lt as any };
    });
  }

  @TsRestHandler(c.deleteLicenseType)
  async deleteLicenseType() {
    return tsRestHandler(c.deleteLicenseType, async ({ params: { id } }) => {
      await this.licenseTypeService.delete(id);
      return { status: 204 as const, body: undefined as any };
    });
  }

  @TsRestHandler(c.getApplicationSubscriptionStats)
  async getApplicationSubscriptionStats() {
    return tsRestHandler(c.getApplicationSubscriptionStats, async ({ params: { applicationId } }) => {
      const stats = await this.licensePoolService.getApplicationSubscriptions(applicationId);
      return { status: 200 as const, body: stats as any };
    });
  }

  // =========================================================================
  // SUBSCRIPTIONS (Inventory)
  // =========================================================================

  @TsRestHandler(c.provisionSubscription)
  async provisionSubscription() {
    return tsRestHandler(c.provisionSubscription, async ({ body }) => {
      const sub = await this.licensePoolService.provisionSubscription({
        ...body,
        currentPeriodEnd: new Date(body.currentPeriodEnd),
      } as any);
      return { status: 201 as const, body: sub as any };
    });
  }

  @TsRestHandler(c.getSubscription)
  async getSubscription() {
    return tsRestHandler(c.getSubscription, async ({ params: { id } }) => {
      const sub = await this.licensePoolService.findById(id);
      return { status: 200 as const, body: sub as any };
    });
  }

  @TsRestHandler(c.updateSubscriptionQuantity)
  async updateSubscriptionQuantity() {
    return tsRestHandler(c.updateSubscriptionQuantity, async ({ params: { id }, body }) => {
      const sub = await this.licensePoolService.updateQuantity(id, body.quantityPurchased);
      return { status: 200 as const, body: sub as any };
    });
  }

  @TsRestHandler(c.cancelSubscription)
  async cancelSubscription() {
    return tsRestHandler(c.cancelSubscription, async ({ params: { id } }) => {
      const sub = await this.licensePoolService.cancelSubscription(id);
      return { status: 200 as const, body: sub as any };
    });
  }

  @TsRestHandler(c.expireSubscription)
  async expireSubscription() {
    return tsRestHandler(c.expireSubscription, async ({ params: { id } }) => {
      const sub = await this.licensePoolService.expireSubscription(id);
      return { status: 200 as const, body: sub as any };
    });
  }

  @TsRestHandler(c.getSubscriptionAssignments)
  async getSubscriptionAssignments() {
    return tsRestHandler(c.getSubscriptionAssignments, async ({ params: { id } }) => {
      const assignments = await this.licenseAssignmentService.getSubscriptionAssignments(id);
      return { status: 200 as const, body: assignments as any };
    });
  }

  @TsRestHandler(c.getTenantSubscriptions)
  async getTenantSubscriptions() {
    return tsRestHandler(c.getTenantSubscriptions, async ({ params: { tenantId } }) => {
      const subs = await this.licensePoolService.getTenantSubscriptions(tenantId);
      return { status: 200 as const, body: subs as any };
    });
  }

  @TsRestHandler(c.getTenantLicenseOverview)
  async getTenantLicenseOverview() {
    return tsRestHandler(c.getTenantLicenseOverview, async ({ params: { tenantId } }) => {
      const overview = await this.licensePoolService.getTenantLicenseOverview(tenantId);
      return { status: 200 as const, body: overview as any };
    });
  }

  @TsRestHandler(c.checkMemberAccess)
  async checkMemberAccess() {
    return tsRestHandler(c.checkMemberAccess, async ({ params: { tenantId, applicationId } }) => {
      const result = await this.licensePoolService.checkMemberAccess(tenantId, applicationId);
      return { status: 200 as const, body: result as any };
    });
  }

  // =========================================================================
  // LICENSE ASSIGNMENTS (Who has what)
  // =========================================================================

  @TsRestHandler(c.grantLicense)
  async grantLicense() {
    return tsRestHandler(c.grantLicense, async ({ body }) => {
      const assignment = await this.licenseAssignmentService.grantLicense(body as any);
      return { status: 200 as const, body: assignment as any };
    });
  }

  @TsRestHandler(c.revokeLicense)
  async revokeLicense() {
    return tsRestHandler(c.revokeLicense, async ({ body }) => {
      await this.licenseAssignmentService.revokeLicense(body as any);
      return { status: 200 as const, body: { success: true as const } };
    });
  }

  @TsRestHandler(c.changeLicenseType)
  async changeLicenseType() {
    return tsRestHandler(c.changeLicenseType, async ({ body }) => {
      const assignment = await this.licenseAssignmentService.changeLicenseType(body as any);
      return { status: 200 as const, body: assignment as any };
    });
  }

  @TsRestHandler(c.grantLicensesBulk)
  async grantLicensesBulk() {
    return tsRestHandler(c.grantLicensesBulk, async ({ body }) => {
      const result = await this.licenseAssignmentBulkService.grantLicensesBulk(body.assignments as any);
      return { status: 200 as const, body: result as any };
    });
  }

  @TsRestHandler(c.revokeLicensesBulk)
  async revokeLicensesBulk() {
    return tsRestHandler(c.revokeLicensesBulk, async ({ body }) => {
      const result = await this.licenseAssignmentBulkService.revokeLicensesBulk(body.revocations as any);
      return { status: 200 as const, body: result as any };
    });
  }

  @TsRestHandler(c.getUserLicenses)
  async getUserLicenses() {
    return tsRestHandler(c.getUserLicenses, async ({ params: { tenantId, userId } }) => {
      const licenses = await this.licenseAssignmentService.getUserLicenses(tenantId, userId);
      return { status: 200 as const, body: licenses as any };
    });
  }

  @TsRestHandler(c.revokeAllUserLicenses)
  async revokeAllUserLicenses() {
    return tsRestHandler(c.revokeAllUserLicenses, async ({ params: { tenantId, userId } }) => {
      await this.licenseAssignmentBulkService.revokeAllUserLicenses(tenantId, userId);
      return { status: 200 as const, body: { success: true as const } };
    });
  }

  @TsRestHandler(c.getAppLicenseHolders)
  async getAppLicenseHolders() {
    return tsRestHandler(c.getAppLicenseHolders, async ({ params: { tenantId, applicationId } }) => {
      const holders = await this.licenseAssignmentService.getAppLicenseHolders(tenantId, applicationId);
      return { status: 200 as const, body: holders as any };
    });
  }

  @TsRestHandler(c.getTenantMembersWithLicenses)
  async getTenantMembersWithLicenses() {
    return tsRestHandler(c.getTenantMembersWithLicenses, async ({ params: { tenantId } }) => {
      const members = await this.licenseAssignmentService.getTenantMembersWithLicenses(tenantId);
      return { status: 200 as const, body: members as any };
    });
  }

  @TsRestHandler(c.getAvailableLicenseTypesForTenant)
  async getAvailableLicenseTypesForTenant() {
    return tsRestHandler(c.getAvailableLicenseTypesForTenant, async ({ params: { tenantId } }) => {
      const types = await this.licensePoolService.getAvailableLicenseTypesForTenant(tenantId);
      return { status: 200 as const, body: types as any };
    });
  }
}
