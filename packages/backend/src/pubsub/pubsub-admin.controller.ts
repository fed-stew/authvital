import { Controller, UseGuards } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { pubsubContract as c } from '@authvital/contracts';
import { SuperAdminGuard } from '../super-admin/guards/super-admin.guard';
import { PubSubConfigService } from './pubsub-config.service';
import { PubSubOutboxService } from './pubsub-outbox.service';

@Controller()
@UseGuards(SuperAdminGuard)
export class PubSubAdminController {
  constructor(
    private readonly configService: PubSubConfigService,
    private readonly outboxService: PubSubOutboxService,
  ) {}

  @TsRestHandler(c.getConfig)
  async getConfig() {
    return tsRestHandler(c.getConfig, async () => ({
      status: 200 as const,
      body: (await this.configService.getConfig()) as any,
    }));
  }

  @TsRestHandler(c.updateConfig)
  async updateConfig() {
    return tsRestHandler(c.updateConfig, async ({ body }) => ({
      status: 200 as const,
      body: (await this.configService.updateConfig(body)) as any,
    }));
  }

  @TsRestHandler(c.getEventTypes)
  async getEventTypes() {
    return tsRestHandler(c.getEventTypes, async () => ({
      status: 200 as const,
      body: this.configService.getAvailableEventTypes() as any,
    }));
  }

  @TsRestHandler(c.getOutboxStats)
  async getOutboxStats() {
    return tsRestHandler(c.getOutboxStats, async () => ({
      status: 200 as const,
      body: (await this.outboxService.getStats()) as any,
    }));
  }

  @TsRestHandler(c.getOutboxEvents)
  async getOutboxEvents() {
    return tsRestHandler(c.getOutboxEvents, async ({ query }) => ({
      status: 200 as const,
      body: (await this.outboxService.getRecentEvents(
        query.limit || 50,
        query.status as any,
      )) as any,
    }));
  }

  @TsRestHandler(c.retryEvent)
  async retryEvent() {
    return tsRestHandler(c.retryEvent, async ({ params }) => ({
      status: 200 as const,
      body: (await this.outboxService.retryEvent(params.id)) as any,
    }));
  }

  @TsRestHandler(c.retryAllFailed)
  async retryAllFailed() {
    return tsRestHandler(c.retryAllFailed, async () => ({
      status: 200 as const,
      body: (await this.outboxService.retryAllFailed()) as any,
    }));
  }
}
