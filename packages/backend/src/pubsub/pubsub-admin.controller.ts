import {
  Controller,
  Get,
  Put,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SuperAdminGuard } from '../super-admin/guards/super-admin.guard';
import { PubSubConfigService, UpdatePubSubConfigDto } from './pubsub-config.service';
import { PubSubOutboxService } from './pubsub-outbox.service';

@Controller('super-admin/pubsub')
@UseGuards(SuperAdminGuard)
export class PubSubAdminController {
  constructor(
    private readonly configService: PubSubConfigService,
    private readonly outboxService: PubSubOutboxService,
  ) {}

  // =========================================================================
  // Configuration
  // =========================================================================

  /**
   * GET /api/super-admin/pubsub/config
   * Get current Pub/Sub configuration
   */
  @Get('config')
  async getConfig() {
    return this.configService.getConfig();
  }

  /**
   * PUT /api/super-admin/pubsub/config
   * Update Pub/Sub configuration
   */
  @Put('config')
  async updateConfig(@Body() dto: UpdatePubSubConfigDto) {
    return this.configService.updateConfig(dto);
  }

  /**
   * GET /api/super-admin/pubsub/event-types
   * Get all available event types for the event picker
   */
  @Get('event-types')
  getEventTypes() {
    return this.configService.getAvailableEventTypes();
  }

  // =========================================================================
  // Outbox Dashboard
  // =========================================================================

  /**
   * GET /api/super-admin/pubsub/outbox
   * Get outbox statistics (counts by status)
   */
  @Get('outbox')
  async getOutboxStats() {
    return this.outboxService.getStats();
  }

  /**
   * GET /api/super-admin/pubsub/outbox/events?status=FAILED&limit=50
   * Get recent outbox events with optional filtering
   */
  @Get('outbox/events')
  async getOutboxEvents(
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ) {
    return this.outboxService.getRecentEvents(
      parseInt(limit || '50', 10),
      status as any,
    );
  }

  /**
   * POST /api/super-admin/pubsub/outbox/:id/retry
   * Retry a single failed event
   */
  @Post('outbox/:id/retry')
  @HttpCode(HttpStatus.OK)
  async retryEvent(@Param('id') id: string) {
    return this.outboxService.retryEvent(id);
  }

  /**
   * POST /api/super-admin/pubsub/outbox/retry-all
   * Retry all failed events
   */
  @Post('outbox/retry-all')
  @HttpCode(HttpStatus.OK)
  async retryAllFailed() {
    return this.outboxService.retryAllFailed();
  }
}
