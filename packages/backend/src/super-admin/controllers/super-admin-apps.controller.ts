import { Controller, UseGuards } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { superAdminContract as c } from '@authvital/contracts';
import { SuperAdminGuard } from '../guards/super-admin.guard';
import { AdminApplicationsService } from '../services/admin-applications.service';
import {
  AdminApplicationClientsService,
  CreateClientInput,
} from '../services/admin-application-clients.service';
import { AdminInstanceService } from '../services/admin-instance.service';

@Controller()
@UseGuards(SuperAdminGuard)
export class SuperAdminAppsController {
  constructor(
    private readonly applicationsService: AdminApplicationsService,
    private readonly clientsService: AdminApplicationClientsService,
    private readonly instanceService: AdminInstanceService,
  ) {}

  // =========================================================================
  // SYSTEM STATS
  // =========================================================================

  @TsRestHandler(c.getSystemStats)
  async getSystemStats() {
    return tsRestHandler(c.getSystemStats, async () => {
      const stats = await this.instanceService.getSystemStats();
      return { status: 200 as const, body: stats as any };
    });
  }

  // =========================================================================
  // APPLICATIONS
  // =========================================================================

  @TsRestHandler(c.getApplications)
  async getApplications() {
    return tsRestHandler(c.getApplications, async () => {
      const apps = await this.applicationsService.getApplications();
      return { status: 200 as const, body: apps as any };
    });
  }

  @TsRestHandler(c.getApplication)
  async getApplication() {
    return tsRestHandler(c.getApplication, async ({ params: { id } }) => {
      const app = await this.applicationsService.getApplication(id);
      return { status: 200 as const, body: app as any };
    });
  }

  @TsRestHandler(c.createApplication)
  async createApplication() {
    return tsRestHandler(c.createApplication, async ({ body }) => {
      const app = await this.applicationsService.createApplication(body as any);
      return { status: 201 as const, body: app as any };
    });
  }

  @TsRestHandler(c.updateApplication)
  async updateApplication() {
    return tsRestHandler(c.updateApplication, async ({ params: { id }, body }) => {
      const app = await this.applicationsService.updateApplication(id, body as any);
      return { status: 200 as const, body: app as any };
    });
  }

  @TsRestHandler(c.deleteApplication)
  async deleteApplication() {
    return tsRestHandler(c.deleteApplication, async ({ params: { id } }) => {
      await this.applicationsService.deleteApplication(id);
      return { status: 200 as const, body: { success: true as const } };
    });
  }

  @TsRestHandler(c.disableApplication)
  async disableApplication() {
    return tsRestHandler(c.disableApplication, async ({ params: { id } }) => {
      const app = await this.applicationsService.disableApplication(id);
      return { status: 200 as const, body: app as any };
    });
  }

  @TsRestHandler(c.enableApplication)
  async enableApplication() {
    return tsRestHandler(c.enableApplication, async ({ params: { id } }) => {
      const app = await this.applicationsService.enableApplication(id);
      return { status: 200 as const, body: app as any };
    });
  }

  // =========================================================================
  // CREDENTIALS (ApplicationClient) — app-client-split Phase 2
  // =========================================================================

  @TsRestHandler(c.addApplicationClient)
  async addApplicationClient() {
    return tsRestHandler(c.addApplicationClient, async ({ params: { id }, body }) => {
      const { client, clientSecret } = await this.clientsService.addClient(
        id,
        body as CreateClientInput,
      );
      return { status: 201 as const, body: { ...client, clientSecret } as any };
    });
  }

  @TsRestHandler(c.updateApplicationClient)
  async updateApplicationClient() {
    return tsRestHandler(
      c.updateApplicationClient,
      async ({ params: { id, clientId }, body }) => {
        const client = await this.clientsService.updateClient(id, clientId, body);
        return { status: 200 as const, body: client as any };
      },
    );
  }

  @TsRestHandler(c.deleteApplicationClient)
  async deleteApplicationClient() {
    return tsRestHandler(
      c.deleteApplicationClient,
      async ({ params: { id, clientId } }) => {
        const result = await this.clientsService.deleteClient(id, clientId);
        return { status: 200 as const, body: result };
      },
    );
  }

  @TsRestHandler(c.rotateApplicationClientSecret)
  async rotateApplicationClientSecret() {
    return tsRestHandler(
      c.rotateApplicationClientSecret,
      async ({ params: { id, clientId } }) => {
        const secret = await this.clientsService.rotateSecret(id, clientId);
        return {
          status: 200 as const,
          body: {
            clientSecret: secret,
            warning: 'Store this secret securely. It will not be shown again.',
          },
        };
      },
    );
  }

  // =========================================================================
  // M2M TENANT GRANTS (target a specific MACHINE credential by clientId)
  // =========================================================================

  @TsRestHandler(c.listClientTenantGrants)
  async listClientTenantGrants() {
    return tsRestHandler(
      c.listClientTenantGrants,
      async ({ params: { id, clientId } }) => {
        const grants = await this.clientsService.listTenantGrants(id, clientId);
        return { status: 200 as const, body: grants as any };
      },
    );
  }

  @TsRestHandler(c.addClientTenantGrant)
  async addClientTenantGrant() {
    return tsRestHandler(
      c.addClientTenantGrant,
      async ({ params: { id, clientId }, body }) => {
        const grant = await this.clientsService.addTenantGrant(id, clientId, body.tenantId);
        return { status: 201 as const, body: grant as any };
      },
    );
  }

  @TsRestHandler(c.removeClientTenantGrant)
  async removeClientTenantGrant() {
    return tsRestHandler(
      c.removeClientTenantGrant,
      async ({ params: { id, clientId, tenantId } }) => {
        const result = await this.clientsService.removeTenantGrant(id, clientId, tenantId);
        return { status: 200 as const, body: result };
      },
    );
  }

  // =========================================================================
  // ROLES
  // =========================================================================

  @TsRestHandler(c.createRole)
  async createRole() {
    return tsRestHandler(c.createRole, async ({ params: { appId }, body }) => {
      const role = await this.applicationsService.createRole(
        appId,
        body.name,
        body.slug,
        body.description,
        body.isDefault,
      );
      return { status: 201 as const, body: role as any };
    });
  }

  @TsRestHandler(c.updateRole)
  async updateRole() {
    return tsRestHandler(c.updateRole, async ({ params: { id }, body }) => {
      const role = await this.applicationsService.updateRole(id, body as any);
      return { status: 200 as const, body: role as any };
    });
  }

  @TsRestHandler(c.deleteRole)
  async deleteRole() {
    return tsRestHandler(c.deleteRole, async ({ params: { id } }) => {
      await this.applicationsService.deleteRole(id);
      return { status: 200 as const, body: { success: true as const } };
    });
  }

  @TsRestHandler(c.setDefaultRole)
  async setDefaultRole() {
    return tsRestHandler(c.setDefaultRole, async ({ params: { id } }) => {
      const role = await this.applicationsService.setDefaultRole(id);
      return { status: 200 as const, body: role as any };
    });
  }
}
