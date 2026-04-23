import { Controller, UseGuards } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { superAdminContract as c } from '@authvital/contracts';
import { SuperAdminGuard } from '../guards/super-admin.guard';
import { AdminTenantsService } from '../services/admin-tenants.service';
import { AdminServiceAccountsService } from '../services/admin-service-accounts.service';
import { MfaService } from '../../auth/mfa/mfa.service';

@Controller()
@UseGuards(SuperAdminGuard)
export class SuperAdminTenantsController {
  constructor(
    private readonly tenantsService: AdminTenantsService,
    private readonly serviceAccountsService: AdminServiceAccountsService,
    private readonly mfaService: MfaService,
  ) {}

  // =========================================================================
  // TENANTS CRUD
  // =========================================================================

  @TsRestHandler(c.getTenants)
  async getTenants() {
    return tsRestHandler(c.getTenants, async ({ query }) => {
      const result = await this.tenantsService.getTenants(query);
      return { status: 200 as const, body: result as any };
    });
  }

  @TsRestHandler(c.createTenant)
  async createTenant() {
    return tsRestHandler(c.createTenant, async ({ body }) => {
      const tenant = await this.tenantsService.createTenant(body as any);
      return { status: 201 as const, body: tenant as any };
    });
  }

  @TsRestHandler(c.getTenant)
  async getTenant() {
    return tsRestHandler(c.getTenant, async ({ params: { id } }) => {
      const tenant = await this.tenantsService.getTenant(id);
      return { status: 200 as const, body: tenant as any };
    });
  }

  @TsRestHandler(c.updateTenant)
  async updateTenant() {
    return tsRestHandler(c.updateTenant, async ({ params: { id }, body }) => {
      const tenant = await this.tenantsService.updateTenant(id, body as any);
      return { status: 200 as const, body: tenant as any };
    });
  }

  @TsRestHandler(c.deleteTenant)
  async deleteTenant() {
    return tsRestHandler(c.deleteTenant, async ({ params: { id } }) => {
      await this.tenantsService.deleteTenant(id);
      return { status: 200 as const, body: { success: true as const } };
    });
  }

  // =========================================================================
  // MEMBER MANAGEMENT
  // =========================================================================

  @TsRestHandler(c.removeTenantMember)
  async removeTenantMember() {
    return tsRestHandler(c.removeTenantMember, async ({ params: { tenantId, membershipId } }) => {
      await this.tenantsService.removeTenantMember(tenantId, membershipId);
      return { status: 200 as const, body: { success: true as const } };
    });
  }

  @TsRestHandler(c.getAvailableUsersForTenant)
  async getAvailableUsersForTenant() {
    return tsRestHandler(c.getAvailableUsersForTenant, async ({ params: { tenantId } }) => {
      const users = await this.tenantsService.getAvailableUsersForTenant(tenantId);
      return { status: 200 as const, body: users as any };
    });
  }

  @TsRestHandler(c.inviteUserToTenant)
  async inviteUserToTenant() {
    return tsRestHandler(c.inviteUserToTenant, async ({ params: { tenantId }, body }) => {
      await this.tenantsService.inviteUserToTenant(tenantId, body.email);
      return { status: 200 as const, body: { success: true as const } };
    });
  }

  // =========================================================================
  // TENANT MFA
  // =========================================================================

  @TsRestHandler(c.getTenantMfaPolicy)
  async getTenantMfaPolicy() {
    return tsRestHandler(c.getTenantMfaPolicy, async ({ params: { tenantId } }) => {
      const policy = await this.mfaService.getTenantMfaPolicy(tenantId);
      return { status: 200 as const, body: policy as any };
    });
  }

  @TsRestHandler(c.updateTenantMfaPolicy)
  async updateTenantMfaPolicy() {
    return tsRestHandler(c.updateTenantMfaPolicy, async ({ params: { tenantId }, body }) => {
      const result = await this.mfaService.updateTenantMfaPolicy(
        tenantId,
        body.policy as any,
        body.gracePeriodDays,
      );
      return { status: 200 as const, body: result as any };
    });
  }

  @TsRestHandler(c.getTenantMfaStats)
  async getTenantMfaStats() {
    return tsRestHandler(c.getTenantMfaStats, async ({ params: { tenantId } }) => {
      const stats = await this.mfaService.getTenantMfaStats(tenantId);
      return { status: 200 as const, body: stats as any };
    });
  }

  // =========================================================================
  // SERVICE ACCOUNTS
  // =========================================================================

  @TsRestHandler(c.listServiceAccounts)
  async listServiceAccounts() {
    return tsRestHandler(c.listServiceAccounts, async ({ params: { tenantId } }) => {
      const accounts = await this.serviceAccountsService.listTenantServiceAccounts(tenantId);
      return { status: 200 as const, body: accounts as any };
    });
  }

  @TsRestHandler(c.createServiceAccount)
  async createServiceAccount() {
    return tsRestHandler(c.createServiceAccount, async ({ params: { tenantId }, body }) => {
      const account = await this.serviceAccountsService.createServiceAccount(
        tenantId,
        body.name,
        body.roleIds || [],
        body.description,
      );
      return { status: 201 as const, body: account as any };
    });
  }

  @TsRestHandler(c.updateServiceAccountRoles)
  async updateServiceAccountRoles() {
    return tsRestHandler(c.updateServiceAccountRoles, async ({ params: { tenantId, serviceAccountId }, body }) => {
      const account = await this.serviceAccountsService.updateServiceAccountRoles(
        tenantId,
        serviceAccountId,
        body.roleIds,
      );
      return { status: 200 as const, body: account as any };
    });
  }

  @TsRestHandler(c.revokeServiceAccount)
  async revokeServiceAccount() {
    return tsRestHandler(c.revokeServiceAccount, async ({ params: { tenantId, serviceAccountId } }) => {
      await this.serviceAccountsService.revokeServiceAccount(tenantId, serviceAccountId);
      return { status: 200 as const, body: { success: true as const } };
    });
  }
}
