import { Controller, UseGuards } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { superAdminContract as c } from '@authvital/contracts';
import { SuperAdminGuard } from '../guards/super-admin.guard';
import { AdminApplicationsService } from '../services/admin-applications.service';
import { AdminInstanceService } from '../services/admin-instance.service';

@Controller()
@UseGuards(SuperAdminGuard)
export class SuperAdminAppsController {
  constructor(
    private readonly applicationsService: AdminApplicationsService,
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

  @TsRestHandler(c.regenerateClientSecret)
  async regenerateClientSecret() {
    return tsRestHandler(c.regenerateClientSecret, async ({ params: { id } }) => {
      const secret = await this.applicationsService.regenerateClientSecret(id);
      return {
        status: 200 as const,
        body: {
          clientSecret: secret,
          warning: 'Store this secret securely. It will not be shown again.',
        },
      };
    });
  }

  @TsRestHandler(c.revokeClientSecret)
  async revokeClientSecret() {
    return tsRestHandler(c.revokeClientSecret, async ({ params: { id } }) => {
      await this.applicationsService.revokeClientSecret(id);
      return { status: 200 as const, body: { success: true as const } };
    });
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
