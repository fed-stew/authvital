import { Controller, UseGuards } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { superAdminContract as c } from '@authvital/contracts';
import { SuperAdminGuard } from '../guards/super-admin.guard';
import { AdminSsoService } from '../services/admin-sso.service';
import { DomainsService } from '../../tenants/domains/domains.service';
import { TenantRolesService } from '../../authorization';

@Controller()
@UseGuards(SuperAdminGuard)
export class SuperAdminSsoController {
  constructor(
    private readonly ssoService: AdminSsoService,
    private readonly domainsService: DomainsService,
    private readonly tenantRolesService: TenantRolesService,
  ) {}

  // =========================================================================
  // DOMAINS
  // =========================================================================

  @TsRestHandler(c.getTenantDomains)
  async getTenantDomains() {
    return tsRestHandler(c.getTenantDomains, async ({ params: { tenantId } }) => {
      const domains = await this.domainsService.getTenantDomains(tenantId);
      return { status: 200 as const, body: domains as any };
    });
  }

  @TsRestHandler(c.registerDomain)
  async registerDomain() {
    return tsRestHandler(c.registerDomain, async ({ body }) => {
      const domain = await this.domainsService.registerDomain(body.tenantId, body.domainName);
      return { status: 201 as const, body: domain as any };
    });
  }

  @TsRestHandler(c.verifyDomain)
  async verifyDomain() {
    return tsRestHandler(c.verifyDomain, async ({ params: { domainId } }) => {
      const domain = await this.domainsService.verifyDomain(domainId);
      return { status: 200 as const, body: domain as any };
    });
  }

  @TsRestHandler(c.deleteDomain)
  async deleteDomain() {
    return tsRestHandler(c.deleteDomain, async ({ params: { domainId } }) => {
      await this.domainsService.deleteDomain(domainId);
      return { status: 200 as const, body: { success: true as const } };
    });
  }

  // =========================================================================
  // TENANT ROLES
  // =========================================================================

  @TsRestHandler(c.getTenantRoles)
  async getTenantRoles() {
    return tsRestHandler(c.getTenantRoles, async () => {
      const roles = await this.tenantRolesService.getTenantRoles();
      return { status: 200 as const, body: roles as any };
    });
  }

  @TsRestHandler(c.getMembershipTenantRoles)
  async getMembershipTenantRoles() {
    return tsRestHandler(c.getMembershipTenantRoles, async ({ params: { membershipId } }) => {
      const roles = await this.tenantRolesService.getMembershipTenantRoles(membershipId);
      return { status: 200 as const, body: roles as any };
    });
  }

  @TsRestHandler(c.assignTenantRole)
  async assignTenantRole() {
    return tsRestHandler(c.assignTenantRole, async ({ params: { membershipId }, body }) => {
      await this.tenantRolesService.assignTenantRole(membershipId, body.tenantRoleSlug);
      const roles = await this.tenantRolesService.getMembershipTenantRoles(membershipId);
      return {
        status: 200 as const,
        body: {
          success: true as const,
          message: 'Tenant role assigned successfully',
          roles: roles as any,
        },
      };
    });
  }

  @TsRestHandler(c.removeTenantRole)
  async removeTenantRole() {
    return tsRestHandler(c.removeTenantRole, async ({ params: { membershipId, roleSlug } }) => {
      await this.tenantRolesService.removeTenantRole(membershipId, roleSlug);
      return {
        status: 200 as const,
        body: { success: true as const, message: 'Tenant role removed successfully' },
      };
    });
  }

  // =========================================================================
  // SSO PROVIDERS
  // =========================================================================

  @TsRestHandler(c.getSsoProviders)
  async getSsoProviders() {
    return tsRestHandler(c.getSsoProviders, async () => {
      const providers = await this.ssoService.getAllProviders();
      return { status: 200 as const, body: providers as any };
    });
  }

  @TsRestHandler(c.getSsoProvider)
  async getSsoProvider() {
    return tsRestHandler(c.getSsoProvider, async ({ params: { provider } }) => {
      const result = await this.ssoService.getProvider(provider.toUpperCase() as any);
      return { status: 200 as const, body: result as any };
    });
  }

  @TsRestHandler(c.createSsoProvider)
  async createSsoProvider() {
    return tsRestHandler(c.createSsoProvider, async ({ body }) => {
      const provider = await this.ssoService.upsertProvider({
        ...body,
        provider: body.provider.toUpperCase(),
      } as any);
      return { status: 201 as const, body: provider as any };
    });
  }

  @TsRestHandler(c.updateSsoProvider)
  async updateSsoProvider() {
    return tsRestHandler(c.updateSsoProvider, async ({ params: { provider }, body }) => {
      const result = await this.ssoService.updateProvider(
        provider.toUpperCase() as any,
        body as any,
      );
      return { status: 200 as const, body: result as any };
    });
  }

  @TsRestHandler(c.deleteSsoProvider)
  async deleteSsoProvider() {
    return tsRestHandler(c.deleteSsoProvider, async ({ params: { provider } }) => {
      await this.ssoService.deleteProvider(provider.toUpperCase() as any);
      return { status: 200 as const, body: { success: true as const } };
    });
  }

  @TsRestHandler(c.testSsoProvider)
  async testSsoProvider() {
    return tsRestHandler(c.testSsoProvider, async ({ params: { provider } }) => {
      const result = await this.ssoService.testProvider(provider.toUpperCase() as any);
      return { status: 200 as const, body: result as any };
    });
  }
}
