import { Controller, UseGuards } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { instanceContract as c } from '@authvital/contracts';
import { InstanceService } from './instance.service';
import { InstanceApiKeyService } from './instance-api-key.service';
import { SuperAdminGuard } from '../super-admin/guards/super-admin.guard';

@Controller()
@UseGuards(SuperAdminGuard)
export class InstanceController {
  constructor(
    private readonly instanceService: InstanceService,
    private readonly apiKeyService: InstanceApiKeyService,
  ) {}

  // =========================================================================
  // INSTANCE CONFIGURATION
  // =========================================================================

  @TsRestHandler(c.getInstanceMeta)
  async getInstanceMeta() {
    return tsRestHandler(c.getInstanceMeta, async () => {
      const meta = await this.instanceService.getInstanceMeta();
      return { status: 200 as const, body: meta as any };
    });
  }

  @TsRestHandler(c.getInstanceUuid)
  async getInstanceUuid() {
    return tsRestHandler(c.getInstanceUuid, async () => {
      const uuid = await this.instanceService.getInstanceUuid();
      return { status: 200 as const, body: { instanceUuid: uuid } };
    });
  }

  @TsRestHandler(c.getSignupConfig)
  async getSignupConfig() {
    return tsRestHandler(c.getSignupConfig, async () => {
      const config = await this.instanceService.getSignupConfig();
      return { status: 200 as const, body: config as any };
    });
  }

  @TsRestHandler(c.getBrandingConfig)
  async getBrandingConfig() {
    return tsRestHandler(c.getBrandingConfig, async () => {
      const branding = await this.instanceService.getBrandingConfig();
      return { status: 200 as const, body: branding as any };
    });
  }

  @TsRestHandler(c.updateInstanceMeta)
  async updateInstanceMeta() {
    return tsRestHandler(c.updateInstanceMeta, async ({ body }) => {
      const meta = await this.instanceService.updateInstanceMeta(body as any);
      return { status: 200 as const, body: meta as any };
    });
  }

  // =========================================================================
  // INSTANCE API KEYS
  // =========================================================================

  @TsRestHandler(c.listApiKeys)
  async listApiKeys() {
    return tsRestHandler(c.listApiKeys, async () => {
      const keys = await this.apiKeyService.listApiKeys();
      return { status: 200 as const, body: keys as any };
    });
  }

  @TsRestHandler(c.createApiKey)
  async createApiKey() {
    return tsRestHandler(c.createApiKey, async ({ body }) => {
      const result = await this.apiKeyService.createApiKey(body as any);
      return { status: 201 as const, body: result as any };
    });
  }

  @TsRestHandler(c.revokeApiKey)
  async revokeApiKey() {
    return tsRestHandler(c.revokeApiKey, async ({ params: { id } }) => {
      await this.apiKeyService.revokeApiKey(id);
      return { status: 200 as const, body: { success: true as const } };
    });
  }
}
