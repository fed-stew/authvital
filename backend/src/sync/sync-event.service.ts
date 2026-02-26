import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma';
import { KeyService } from '../oauth/key.service';
import { SyncEventType, BaseEventPayload } from './types';

@Injectable()
export class SyncEventService {
  private readonly logger = new Logger(SyncEventService.name);
  private readonly MAX_RETRY_ATTEMPTS = 5;
  private readonly RETRY_DELAYS = [60, 300, 900, 3600, 14400]; // 1m, 5m, 15m, 1h, 4h

  constructor(
    private readonly prisma: PrismaService,
    private readonly keyService: KeyService,
  ) {}

  /**
   * Emit a sync event - stores in DB and triggers webhook delivery
   */
  async emit<T extends Record<string, any>>(
    eventType: SyncEventType,
    tenantId: string,
    applicationId: string,
    data: T,
  ): Promise<void> {
    const eventId = crypto.randomUUID();
    const timestamp = new Date().toISOString();

    this.logger.debug(
      `[SyncEvent] Emitting event: id=${eventId}, type=${eventType}, tenantId=${tenantId}, appId=${applicationId}`,
    );

    const payload: BaseEventPayload & { data: T } = {
      id: eventId,
      type: eventType,
      timestamp,
      tenant_id: tenantId,
      application_id: applicationId,
      data,
    };

    this.logger.debug(`[SyncEvent] Event data: ${JSON.stringify(data)}`);

    // Get application to check webhook config
    const application = await this.prisma.application.findUnique({
      where: { id: applicationId },
      select: {
        id: true,
        name: true,
        webhookUrl: true,
        webhookEnabled: true,
        webhookEvents: true,
      },
    });

    if (!application) {
      this.logger.debug(
        `[SyncEvent] Application ${applicationId} not found - event will be stored with SKIPPED status`,
      );
    } else {
      this.logger.debug(
        `[SyncEvent] Application "${application.name}" webhook config: enabled=${application.webhookEnabled}, url=${application.webhookUrl ? `"${application.webhookUrl}"` : 'null'}, filters=${JSON.stringify(application.webhookEvents || [])}`,
      );
    }

    // Determine webhook status
    let webhookStatus: 'PENDING' | 'SKIPPED' = 'SKIPPED';
    let skipReason = '';

    if (!application) {
      skipReason = 'Application not found';
    } else if (!application.webhookEnabled) {
      skipReason = 'Webhooks disabled for application';
    } else if (!application.webhookUrl) {
      skipReason = 'No webhook URL configured';
    } else {
      // Check if this event type matches the filter
      const eventFilter = application.webhookEvents || [];
      if (eventFilter.length === 0) {
        webhookStatus = 'PENDING';
        this.logger.debug(
          `[SyncEvent] No event filter configured - all events will trigger webhook`,
        );
      } else if (this.eventMatchesFilter(eventType, eventFilter)) {
        webhookStatus = 'PENDING';
        this.logger.debug(
          `[SyncEvent] Event type "${eventType}" matches filter ${JSON.stringify(eventFilter)}`,
        );
      } else {
        skipReason = `Event type "${eventType}" does not match filter ${JSON.stringify(eventFilter)}`;
      }
    }

    if (skipReason) {
      this.logger.debug(`[SyncEvent] Webhook SKIPPED: ${skipReason}`);
    }

    // Store the event
    await this.prisma.syncEvent.create({
      data: {
        id: eventId,
        eventType,
        tenantId,
        applicationId,
        payload: payload as any,
        webhookStatus,
      },
    });

    this.logger.debug(
      `[SyncEvent] Event ${eventId} stored with webhookStatus=${webhookStatus}`,
    );

    // If webhook is configured, attempt immediate delivery
    if (webhookStatus === 'PENDING') {
      this.logger.debug(
        `[SyncEvent] Triggering immediate webhook delivery for event ${eventId}`,
      );
      // Fire and forget - don't block the main operation
      this.deliverWebhook(eventId).catch((err) => {
        this.logger.warn(
          `[SyncEvent] Immediate webhook delivery failed for ${eventId}: ${err.message}`,
        );
      });
    }
  }

  /**
   * Check if event type matches filter patterns
   * Supports exact match ("user.created") or wildcard ("user.*")
   */
  private eventMatchesFilter(eventType: string, filters: string[]): boolean {
    for (const filter of filters) {
      if (filter.endsWith('.*')) {
        const prefix = filter.slice(0, -1); // "user.*" -> "user."
        const matches = eventType.startsWith(prefix);
        this.logger.debug(
          `[FilterMatch] Wildcard filter "${filter}" (prefix: "${prefix}") vs event "${eventType}" -> ${matches ? 'MATCH' : 'no match'}`,
        );
        if (matches) return true;
      } else {
        const matches = filter === eventType;
        this.logger.debug(
          `[FilterMatch] Exact filter "${filter}" vs event "${eventType}" -> ${matches ? 'MATCH' : 'no match'}`,
        );
        if (matches) return true;
      }
    }
    this.logger.debug(
      `[FilterMatch] Event "${eventType}" did not match any of ${filters.length} filter(s)`,
    );
    return false;
  }

  /**
   * Deliver a webhook with signature
   */
  async deliverWebhook(eventId: string): Promise<boolean> {
    this.logger.debug(`[Webhook] Starting delivery for event ${eventId}`);

    const event = await this.prisma.syncEvent.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      this.logger.debug(`[Webhook] Event ${eventId} not found in database`);
      return false;
    }

    if (event.webhookStatus !== 'PENDING') {
      this.logger.debug(
        `[Webhook] Event ${eventId} skipped - status is ${event.webhookStatus}, not PENDING`,
      );
      return false;
    }

    this.logger.debug(
      `[Webhook] Event details: type=${event.eventType}, tenantId=${event.tenantId}, appId=${event.applicationId}, attempts=${event.webhookAttempts}`,
    );

    const application = await this.prisma.application.findUnique({
      where: { id: event.applicationId },
      select: { id: true, name: true, webhookUrl: true, webhookEnabled: true },
    });

    if (!application) {
      this.logger.debug(
        `[Webhook] Application ${event.applicationId} not found - marking event as SKIPPED`,
      );
      await this.prisma.syncEvent.update({
        where: { id: eventId },
        data: { webhookStatus: 'SKIPPED' },
      });
      return false;
    }

    this.logger.debug(
      `[Webhook] Application config: name="${application.name}", webhookEnabled=${application.webhookEnabled}, webhookUrl=${application.webhookUrl ? `"${application.webhookUrl}"` : 'null'}`,
    );

    if (!application.webhookUrl || !application.webhookEnabled) {
      this.logger.debug(
        `[Webhook] Webhook not configured or disabled for app ${application.name} - marking event as SKIPPED`,
      );
      await this.prisma.syncEvent.update({
        where: { id: eventId },
        data: { webhookStatus: 'SKIPPED' },
      });
      return false;
    }

    const startTime = Date.now();
    try {
      // Sign the payload
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const payloadString = JSON.stringify(event.payload);
      const signatureInput = `${timestamp}.${payloadString}`;

      this.logger.debug(
        `[Webhook] Signing payload: timestamp=${timestamp}, payloadSize=${payloadString.length} bytes`,
      );

      const { signature, kid } = await this.signPayload(signatureInput);

      this.logger.debug(`[Webhook] Payload signed with kid=${kid}`);

      const headers = {
        'Content-Type': 'application/json',
        'X-AuthVader-Signature': signature,
        'X-AuthVader-Key-Id': kid,
        'X-AuthVader-Timestamp': timestamp,
        'X-AuthVader-Event-Id': eventId,
        'X-AuthVader-Event-Type': event.eventType,
      };

      this.logger.debug(
        `[Webhook] Sending POST to ${application.webhookUrl} with headers: ${JSON.stringify({ ...headers, 'X-AuthVader-Signature': '[REDACTED]' })}`,
      );

      // Send the webhook
      const response = await fetch(application.webhookUrl, {
        method: 'POST',
        headers,
        body: payloadString,
        signal: AbortSignal.timeout(30000), // 30 second timeout
      });

      const elapsed = Date.now() - startTime;

      if (response.ok) {
        await this.prisma.syncEvent.update({
          where: { id: eventId },
          data: {
            webhookStatus: 'DELIVERED',
            deliveredAt: new Date(),
            webhookAttempts: { increment: 1 },
            lastAttemptAt: new Date(),
          },
        });
        this.logger.debug(
          `[Webhook] ✓ Delivered event ${eventId} (${event.eventType}) to ${application.webhookUrl} - HTTP ${response.status} in ${elapsed}ms`,
        );
        return true;
      } else {
        // Try to read response body for more context
        let responseBody = '';
        try {
          responseBody = await response.text();
        } catch {
          responseBody = '[Could not read response body]';
        }
        this.logger.debug(
          `[Webhook] ✗ Server rejected webhook: HTTP ${response.status} ${response.statusText} in ${elapsed}ms`,
        );
        this.logger.debug(
          `[Webhook] Response body: ${responseBody.substring(0, 500)}${responseBody.length > 500 ? '...' : ''}`,
        );
        throw new Error(
          `HTTP ${response.status}: ${response.statusText} - ${responseBody.substring(0, 200)}`,
        );
      }
    } catch (error: any) {
      const elapsed = Date.now() - startTime;
      const attempts = event.webhookAttempts + 1;
      const isFinalAttempt = attempts >= this.MAX_RETRY_ATTEMPTS;

      // Categorize the error for better debugging
      let errorCategory = 'UNKNOWN';
      if (error.name === 'AbortError' || error.message?.includes('timeout')) {
        errorCategory = 'TIMEOUT';
      } else if (error.code === 'ECONNREFUSED') {
        errorCategory = 'CONNECTION_REFUSED';
      } else if (error.code === 'ENOTFOUND') {
        errorCategory = 'DNS_FAILED';
      } else if (error.code === 'ECONNRESET') {
        errorCategory = 'CONNECTION_RESET';
      } else if (error.message?.startsWith('HTTP ')) {
        errorCategory = 'HTTP_ERROR';
      }

      this.logger.debug(
        `[Webhook] ✗ Delivery failed for event ${eventId} after ${elapsed}ms - category=${errorCategory}`,
      );
      this.logger.debug(
        `[Webhook] Error details: name=${error.name}, code=${error.code}, message=${error.message}`,
      );
      if (error.cause) {
        this.logger.debug(`[Webhook] Error cause: ${JSON.stringify(error.cause)}`);
      }

      await this.prisma.syncEvent.update({
        where: { id: eventId },
        data: {
          webhookStatus: isFinalAttempt ? 'FAILED' : 'PENDING',
          webhookAttempts: attempts,
          lastAttemptAt: new Date(),
          lastError: `[${errorCategory}] ${error.message}`,
        },
      });

      const nextAction = isFinalAttempt
        ? 'FINAL FAILURE - no more retries'
        : `will retry (attempt ${attempts}/${this.MAX_RETRY_ATTEMPTS})`;

      this.logger.warn(
        `[Webhook] Delivery failed for ${eventId} (${event.eventType}) to ${application.webhookUrl}: [${errorCategory}] ${error.message} - ${nextAction}`,
      );
      return false;
    }
  }

  /**
   * Sign payload using the active signing key
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
   * Retry failed webhooks (runs every minute)
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async retryPendingWebhooks(): Promise<void> {
    const now = new Date();

    // Find pending webhooks that are ready for retry
    const pendingEvents = await this.prisma.syncEvent.findMany({
      where: {
        webhookStatus: 'PENDING',
        webhookAttempts: { gt: 0, lt: this.MAX_RETRY_ATTEMPTS },
      },
      orderBy: { createdAt: 'asc' },
      take: 50, // Process in batches
    });

    if (pendingEvents.length > 0) {
      this.logger.debug(
        `[WebhookRetry] Found ${pendingEvents.length} pending webhook(s) to evaluate for retry`,
      );
    }

    let retriedCount = 0;
    let skippedCount = 0;

    for (const event of pendingEvents) {
      // Check if enough time has passed since last attempt
      if (event.lastAttemptAt) {
        const delaySeconds =
          this.RETRY_DELAYS[Math.min(event.webhookAttempts - 1, this.RETRY_DELAYS.length - 1)];
        const nextRetryTime = new Date(event.lastAttemptAt.getTime() + delaySeconds * 1000);

        if (now < nextRetryTime) {
          const waitSeconds = Math.ceil((nextRetryTime.getTime() - now.getTime()) / 1000);
          this.logger.debug(
            `[WebhookRetry] Event ${event.id} (${event.eventType}) not ready - attempt ${event.webhookAttempts}/${this.MAX_RETRY_ATTEMPTS}, waiting ${waitSeconds}s more`,
          );
          skippedCount++;
          continue; // Not ready for retry yet
        }

        this.logger.debug(
          `[WebhookRetry] Retrying event ${event.id} (${event.eventType}) - attempt ${event.webhookAttempts + 1}/${this.MAX_RETRY_ATTEMPTS}, lastError: ${event.lastError || 'none'}`,
        );
      }

      retriedCount++;
      await this.deliverWebhook(event.id);
    }

    if (retriedCount > 0 || skippedCount > 0) {
      this.logger.debug(
        `[WebhookRetry] Batch complete: ${retriedCount} retried, ${skippedCount} waiting for cooldown`,
      );
    }
  }

  /**
   * Clean up old events (runs daily)
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanupOldEvents(): Promise<void> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const result = await this.prisma.syncEvent.deleteMany({
      where: {
        createdAt: { lt: thirtyDaysAgo },
      },
    });

    if (result.count > 0) {
      this.logger.log(`Cleaned up ${result.count} old sync events`);
    }
  }

  /**
   * Get available event types grouped by category
   * Used by the webhook event picker UI
   */
  getEventTypes() {
    return {
      categories: [
        {
          slug: 'invite',
          name: 'Invitations',
          description: 'Events related to user invitations',
          events: [
            { type: 'invite.created', description: 'When an invitation is sent' },
            { type: 'invite.accepted', description: 'When an invitation is accepted' },
            { type: 'invite.deleted', description: 'When an invitation is deleted' },
            { type: 'invite.expired', description: 'When an invitation expires' },
          ],
        },
        {
          slug: 'subject',
          name: 'Subjects',
          description: 'Events related to users and service accounts',
          events: [
            { type: 'subject.created', description: 'When a new user is created' },
            { type: 'subject.updated', description: 'When a user profile is updated' },
            { type: 'subject.deleted', description: 'When a user is deleted' },
            { type: 'subject.deactivated', description: 'When a user is deactivated' },
          ],
        },
        {
          slug: 'member',
          name: 'Members',
          description: 'Events related to tenant membership',
          events: [
            { type: 'member.joined', description: 'When a user joins a tenant' },
            { type: 'member.left', description: 'When a user leaves a tenant' },
            { type: 'member.role_changed', description: "When a member's tenant role changes" },
            { type: 'member.suspended', description: 'When a member is suspended' },
            { type: 'member.activated', description: 'When a suspended member is reactivated' },
          ],
        },
        {
          slug: 'app_access',
          name: 'App Access',
          description: 'Events related to application access',
          events: [
            { type: 'app_access.granted', description: 'When a user is granted app access' },
            { type: 'app_access.revoked', description: 'When app access is revoked' },
            { type: 'app_access.role_changed', description: "When a user's app role changes" },
          ],
        },
        {
          slug: 'license',
          name: 'Licenses',
          description: 'Events related to license management',
          events: [
            { type: 'license.assigned', description: 'When a license is assigned to a user' },
            { type: 'license.revoked', description: 'When a license is revoked from a user' },
            { type: 'license.changed', description: "When a user's license type changes" },
          ],
        },
      ],
    };
  }

  /**
   * Get events for polling API
   */
  async getEvents(params: {
    tenantId: string;
    applicationId: string;
    since?: Date;
    eventTypes?: string[];
    limit?: number;
    cursor?: string;
  }) {
    const { tenantId, applicationId, since, eventTypes, limit = 100, cursor } = params;

    const where: any = {
      tenantId,
      applicationId,
    };

    if (since) {
      where.createdAt = { gt: since };
    }

    if (cursor) {
      where.id = { gt: cursor };
    }

    if (eventTypes && eventTypes.length > 0) {
      where.eventType = { in: eventTypes };
    }

    const events = await this.prisma.syncEvent.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      take: limit + 1, // Fetch one extra to check if there's more
    });

    const hasMore = events.length > limit;
    const returnEvents = hasMore ? events.slice(0, limit) : events;
    const nextCursor = hasMore ? returnEvents[returnEvents.length - 1]?.id : null;

    return {
      events: returnEvents.map((e) => e.payload),
      cursor: nextCursor,
      has_more: hasMore,
    };
  }
}
