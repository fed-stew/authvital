import {
  Controller,
  Get,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { SyncEventService } from './sync-event.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SuperAdminGuard } from '../super-admin/guards/super-admin.guard';

class GetEventsQueryDto {
  tenant_id!: string;
  application_id!: string;
  since?: string;
  event_types?: string;
  limit?: string;
  cursor?: string;
}

@Controller('sync')
export class SyncController {
  constructor(private readonly syncEventService: SyncEventService) {}

  /**
   * GET /api/sync/events
   * Poll for sync events
   *
   * Query params:
   * - tenant_id (required): Tenant to get events for
   * - application_id (required): Application to get events for
   * - since (optional): ISO timestamp to get events after
   * - event_types (optional): Comma-separated event types to filter
   * - limit (optional): Max events to return (default 100, max 1000)
   * - cursor (optional): Pagination cursor from previous response
   */
  @UseGuards(JwtAuthGuard)
  @Get('events')
  async getEvents(@Query() query: GetEventsQueryDto) {
    const { tenant_id, application_id, since, event_types, limit, cursor } = query;

    if (!tenant_id) {
      throw new BadRequestException('tenant_id is required');
    }

    if (!application_id) {
      throw new BadRequestException('application_id is required');
    }

    // Parse and validate limit
    let parsedLimit = 100;
    if (limit) {
      parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 1000);
    }

    // Parse since timestamp
    let sinceDate: Date | undefined;
    if (since) {
      sinceDate = new Date(since);
      if (isNaN(sinceDate.getTime())) {
        throw new BadRequestException('Invalid since timestamp');
      }
    }

    // Parse event types filter
    let eventTypesArray: string[] | undefined;
    if (event_types) {
      eventTypesArray = event_types
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
    }

    return this.syncEventService.getEvents({
      tenantId: tenant_id,
      applicationId: application_id,
      since: sinceDate,
      eventTypes: eventTypesArray,
      limit: parsedLimit,
      cursor,
    });
  }

  /**
   * GET /api/sync/event-types
   * Get list of all available event types grouped by category
   * 
   * Protected by SuperAdminGuard - only super admins can view/configure webhook events.
   * Super admins authenticate via super_admin_session cookie.
   */
  @UseGuards(SuperAdminGuard)
  @Get('event-types')
  getEventTypes() {
    return this.syncEventService.getEventTypes();
  }
}
