import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SuperAdminGuard } from '../super-admin/guards/super-admin.guard';
import { SystemWebhookService, SYSTEM_WEBHOOK_EVENTS } from './system-webhook.service';

@Controller('super-admin/webhooks')
@UseGuards(SuperAdminGuard)
export class SystemWebhookController {
  constructor(private readonly webhookService: SystemWebhookService) {}

  @Get('events')
  getAvailableEvents() {
    // Backwards compatible - flat array
    return { events: SYSTEM_WEBHOOK_EVENTS };
  }

  @Get('event-types')
  getEventTypes() {
    // New categorized format for the picker UI
    return this.webhookService.getSystemEventTypes();
  }

  @Get()
  async getWebhooks() {
    return this.webhookService.getWebhooks();
  }

  @Get(':id')
  async getWebhook(@Param('id') id: string) {
    return this.webhookService.getWebhook(id);
  }

  @Get(':id/deliveries')
  async getDeliveries(@Param('id') id: string) {
    return this.webhookService.getDeliveries(id);
  }

  @Post()
  async createWebhook(
    @Body()
    body: {
      name: string;
      url: string;
      events: string[];
      description?: string;
      headers?: Record<string, string>;
    },
  ) {
    return this.webhookService.createWebhook(body);
  }

  @Put(':id')
  async updateWebhook(
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      url?: string;
      events?: string[];
      isActive?: boolean;
      description?: string;
      headers?: Record<string, string>;
    },
  ) {
    return this.webhookService.updateWebhook(id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async deleteWebhook(@Param('id') id: string) {
    return this.webhookService.deleteWebhook(id);
  }

  @Post(':id/test')
  @HttpCode(HttpStatus.OK)
  async testWebhook(@Param('id') id: string) {
    return this.webhookService.testWebhook(id);
  }
}
