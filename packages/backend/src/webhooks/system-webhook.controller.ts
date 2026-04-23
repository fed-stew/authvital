import { Controller, UseGuards } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { webhooksContract as c } from '@authvital/contracts';
import { SuperAdminGuard } from '../super-admin/guards/super-admin.guard';
import { SystemWebhookService, SYSTEM_WEBHOOK_EVENTS } from './system-webhook.service';

@Controller()
@UseGuards(SuperAdminGuard)
export class SystemWebhookController {
  constructor(private readonly webhookService: SystemWebhookService) {}

  @TsRestHandler(c.getAvailableEvents)
  async getAvailableEvents() {
    return tsRestHandler(c.getAvailableEvents, async () => ({
      status: 200 as const,
      body: { events: [...SYSTEM_WEBHOOK_EVENTS] },
    }));
  }

  @TsRestHandler(c.getEventTypes)
  async getEventTypes() {
    return tsRestHandler(c.getEventTypes, async () => ({
      status: 200 as const,
      body: this.webhookService.getSystemEventTypes() as any,
    }));
  }

  @TsRestHandler(c.getWebhooks)
  async getWebhooks() {
    return tsRestHandler(c.getWebhooks, async () => ({
      status: 200 as const,
      body: (await this.webhookService.getWebhooks()) as any,
    }));
  }

  @TsRestHandler(c.getWebhook)
  async getWebhook() {
    return tsRestHandler(c.getWebhook, async ({ params }) => ({
      status: 200 as const,
      body: (await this.webhookService.getWebhook(params.id)) as any,
    }));
  }

  @TsRestHandler(c.getDeliveries)
  async getDeliveries() {
    return tsRestHandler(c.getDeliveries, async ({ params }) => ({
      status: 200 as const,
      body: (await this.webhookService.getDeliveries(params.id)) as any,
    }));
  }

  @TsRestHandler(c.createWebhook)
  async createWebhook() {
    return tsRestHandler(c.createWebhook, async ({ body }) => ({
      status: 201 as const,
      body: (await this.webhookService.createWebhook(body)) as any,
    }));
  }

  @TsRestHandler(c.updateWebhook)
  async updateWebhook() {
    return tsRestHandler(c.updateWebhook, async ({ params, body }) => ({
      status: 200 as const,
      body: (await this.webhookService.updateWebhook(params.id, body)) as any,
    }));
  }

  @TsRestHandler(c.deleteWebhook)
  async deleteWebhook() {
    return tsRestHandler(c.deleteWebhook, async ({ params }) => ({
      status: 200 as const,
      body: (await this.webhookService.deleteWebhook(params.id)) as any,
    }));
  }

  @TsRestHandler(c.testWebhook)
  async testWebhook() {
    return tsRestHandler(c.testWebhook, async ({ params }) => ({
      status: 200 as const,
      body: (await this.webhookService.testWebhook(params.id)) as any,
    }));
  }
}
