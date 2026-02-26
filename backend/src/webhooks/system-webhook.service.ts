import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { KeyService } from '../oauth/key.service';
import * as crypto from 'crypto';

export const SYSTEM_WEBHOOK_EVENTS = [
  // Tenant lifecycle
  'tenant.created',
  'tenant.updated',
  'tenant.deleted',
  'tenant.suspended',
  // Tenant app access
  'tenant.app.granted',
  'tenant.app.revoked',
] as const;

export type SystemWebhookEvent = (typeof SYSTEM_WEBHOOK_EVENTS)[number];

interface WebhookPayload {
  event: SystemWebhookEvent;
  timestamp: string;
  data: Record<string, unknown>;
}

@Injectable()
export class SystemWebhookService {
  private readonly logger = new Logger(SystemWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly keyService: KeyService,
  ) {}

  /**
   * Get all system webhooks
   */
  async getWebhooks() {
    return this.prisma.systemWebhook.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        url: true,
        events: true,
        isActive: true,
        description: true,
        lastTriggeredAt: true,
        lastStatus: true,
        failureCount: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  /**
   * Get a single webhook by ID
   */
  async getWebhook(id: string) {
    const webhook = await this.prisma.systemWebhook.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        url: true,
        events: true,
        isActive: true,
        description: true,
        headers: true,
        lastTriggeredAt: true,
        lastStatus: true,
        failureCount: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!webhook) {
      throw new NotFoundException('Webhook not found');
    }

    return webhook;
  }

  /**
   * Create a new webhook
   */
  async createWebhook(data: {
    name: string;
    url: string;
    events: string[];
    description?: string;
    headers?: Record<string, string>;
  }) {
    const webhook = await this.prisma.systemWebhook.create({
      data: {
        name: data.name,
        url: data.url,
        secret: '', // No longer used - we use JWKS signing
        events: data.events,
        description: data.description,
        headers: data.headers ?? Prisma.JsonNull,
      },
    });

    return {
      id: webhook.id,
      name: webhook.name,
      url: webhook.url,
      events: webhook.events,
      description: webhook.description,
      isActive: webhook.isActive,
      createdAt: webhook.createdAt,
    };
  }

  /**
   * Update a webhook
   */
  async updateWebhook(
    id: string,
    data: {
      name?: string;
      url?: string;
      events?: string[];
      isActive?: boolean;
      description?: string;
      headers?: Record<string, string>;
    },
  ) {
    const webhook = await this.prisma.systemWebhook.findUnique({
      where: { id },
    });

    if (!webhook) {
      throw new NotFoundException('Webhook not found');
    }

    return this.prisma.systemWebhook.update({
      where: { id },
      data: {
        name: data.name,
        url: data.url,
        events: data.events,
        isActive: data.isActive,
        description: data.description,
        headers: data.headers !== undefined ? (data.headers ?? Prisma.JsonNull) : undefined,
      },
      select: {
        id: true,
        name: true,
        url: true,
        events: true,
        isActive: true,
        description: true,
        lastTriggeredAt: true,
        lastStatus: true,
        failureCount: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  /**
   * Delete a webhook
   */
  async deleteWebhook(id: string) {
    const webhook = await this.prisma.systemWebhook.findUnique({
      where: { id },
    });

    if (!webhook) {
      throw new NotFoundException('Webhook not found');
    }

    await this.prisma.systemWebhook.delete({
      where: { id },
    });

    return { success: true };
  }

  /**
   * Get recent deliveries for a webhook
   */
  async getDeliveries(webhookId: string, limit = 20) {
    return this.prisma.systemWebhookDelivery.findMany({
      where: { webhookId },
      orderBy: { attemptedAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Dispatch an event to all subscribed webhooks
   */
  async dispatch(event: SystemWebhookEvent, data: Record<string, unknown>) {
    const webhooks = await this.prisma.systemWebhook.findMany({
      where: {
        isActive: true,
        events: { has: event },
      },
    });

    if (webhooks.length === 0) {
      return;
    }

    const payload: WebhookPayload = {
      event,
      timestamp: new Date().toISOString(),
      data,
    };

    // Dispatch to all webhooks in parallel (fire and forget)
    const promises = webhooks.map((webhook) =>
      this.deliverWebhook(webhook, payload).catch((err) => {
        this.logger.error(`Failed to deliver webhook ${webhook.id}: ${err.message}`);
      }),
    );

    // Don't await - fire and forget
    Promise.all(promises);
  }

  /**
   * Deliver a webhook to a single endpoint
   */
  private async deliverWebhook(
    webhook: { id: string; url: string; headers: unknown },
    payload: WebhookPayload,
  ) {
    const body = JSON.stringify(payload);
    const { signature, kid } = await this.signPayload(body);
    const startTime = Date.now();

    let status: number | null = null;
    let response: string | null = null;
    let error: string | null = null;

    try {
      const customHeaders = (webhook.headers as Record<string, string>) || {};

      const res = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Key-Id': kid,
          'X-Webhook-Event': payload.event,
          'X-Webhook-Timestamp': payload.timestamp,
          ...customHeaders,
        },
        body,
        signal: AbortSignal.timeout(30000), // 30 second timeout
      });

      status = res.status;
      response = await res.text().catch(() => null);

      // Truncate response
      if (response && response.length > 1000) {
        response = response.substring(0, 1000) + '...';
      }
    } catch (err: unknown) {
      error = (err as Error).message || 'Unknown error';
    }

    const duration = Date.now() - startTime;
    const success = status !== null && status >= 200 && status < 300;

    // Log delivery
    await this.prisma.systemWebhookDelivery.create({
      data: {
        webhookId: webhook.id,
        event: payload.event,
        payload: payload as object,
        status,
        response,
        duration,
        error,
      },
    });

    // Update webhook stats
    await this.prisma.systemWebhook.update({
      where: { id: webhook.id },
      data: {
        lastTriggeredAt: new Date(),
        lastStatus: status,
        failureCount: success ? 0 : { increment: 1 },
      },
    });

    if (!success) {
      this.logger.warn(
        `Webhook delivery failed: ${webhook.id} -> ${webhook.url} (${status || 'no response'})`,
      );
    }
  }

  /**
   * Sign payload using the active signing key (RSA-SHA256)
   * Uses the same JWKS infrastructure as SyncEventService for consistency
   */
  private async signPayload(input: string): Promise<{ signature: string; kid: string }> {
    const activeKey = await this.keyService.getActiveKey();

    const sign = crypto.createSign('RSA-SHA256');
    sign.update(input);
    const signature = sign.sign(activeKey.privateKey, 'base64');

    return {
      signature,
      kid: activeKey.kid,
    };
  }

  /**
   * Test a webhook by sending a test event
   */
  async testWebhook(id: string) {
    const webhook = await this.prisma.systemWebhook.findUnique({
      where: { id },
    });

    if (!webhook) {
      throw new NotFoundException('Webhook not found');
    }

    const payload: WebhookPayload = {
      event: 'tenant.created' as SystemWebhookEvent, // Use a sample event
      timestamp: new Date().toISOString(),
      data: {
        test: true,
        message: 'This is a test webhook delivery',
        webhookId: id,
      },
    };

    await this.deliverWebhook(webhook, payload);

    // Get the delivery we just created
    const delivery = await this.prisma.systemWebhookDelivery.findFirst({
      where: { webhookId: id },
      orderBy: { attemptedAt: 'desc' },
    });

    return {
      success: delivery?.status ? delivery.status >= 200 && delivery.status < 300 : false,
      status: delivery?.status,
      duration: delivery?.duration,
      error: delivery?.error,
    };
  }

  /**
   * Get available system event types grouped by category
   * Used by the webhook event picker UI
   */
  getSystemEventTypes() {
    return {
      categories: [
        {
          slug: 'tenant',
          name: 'Tenant Lifecycle',
          description: 'Events related to tenant creation and management',
          events: [
            { type: 'tenant.created', description: 'When a new tenant is created' },
            { type: 'tenant.updated', description: 'When tenant details are updated' },
            { type: 'tenant.deleted', description: 'When a tenant is deleted' },
            { type: 'tenant.suspended', description: 'When a tenant is suspended' },
          ],
        },
        {
          slug: 'tenant.app',
          name: 'Tenant App Access',
          description: 'Events related to application access within tenants',
          events: [
            { type: 'tenant.app.granted', description: 'When a user is granted access to an application in a tenant' },
            { type: 'tenant.app.revoked', description: 'When application access is revoked from a user' },
          ],
        },
      ],
    };
  }
}
