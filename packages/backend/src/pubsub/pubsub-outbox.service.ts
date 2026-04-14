import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { PubSubConfigService } from './pubsub-config.service';
import { PubSubPublisherService } from './pubsub-publisher.service';
import {
  PubSubEnqueueParams,
  PubSubMessageEnvelope,
  PubSubMessageAttributes,
} from './types/pubsub-message';

/**
 * PubSubOutboxService — Transactional Outbox Writer & Background Processor
 *
 * Implements the transactional outbox pattern for reliable event delivery
 * to GCP Pub/Sub. Events are first written to the `pub_sub_outbox_events`
 * database table (in the same transaction as the business logic), then
 * asynchronously published by a background cron job.
 *
 * This guarantees:
 * - **Zero data loss**: Events survive Pub/Sub outages.
 * - **At-least-once delivery**: Retries with exponential back-off.
 * - **Transactional consistency**: The outbox write participates in the
 *   caller's database transaction.
 */
@Injectable()
export class PubSubOutboxService {
  private readonly logger = new Logger(PubSubOutboxService.name);

  /** Maximum number of publish attempts before marking an event as FAILED. */
  private readonly MAX_RETRY_ATTEMPTS = 10;

  /**
   * Back-off delays (in seconds) indexed by attempt number.
   * 10s, 30s, 1m, 5m, 15m, 1h, 4h, 12h, 24h, 48h
   */
  private readonly RETRY_DELAYS = [
    10, 30, 60, 300, 900, 3600, 14400, 43200, 86400, 172800,
  ];

  /** Number of outbox events processed per cron tick. */
  private readonly BATCH_SIZE = 100;

  /** Number of days to retain published events before cleanup. */
  private readonly CLEANUP_RETENTION_DAYS = 7;

  constructor(
    private readonly prisma: PrismaService,
    private readonly publisher: PubSubPublisherService,
    private readonly pubSubConfig: PubSubConfigService,
  ) {}

  // ===========================================================================
  // Enqueue Methods
  // ===========================================================================

  /**
   * Write a new event to the Pub/Sub outbox table.
   *
   * Uses the default Prisma client (auto-commit). If you need to include
   * the outbox write in an existing database transaction, use
   * {@link enqueueWithTransaction} instead.
   *
   * When Pub/Sub is disabled the event is still persisted with a `SKIPPED`
   * status so the audit trail is preserved.
   *
   * @param params - Event parameters to enqueue.
   */
  async enqueue(params: PubSubEnqueueParams): Promise<void> {
    await this.writeOutboxRecord(this.prisma, params);
  }

  /**
   * Write a new event to the Pub/Sub outbox table using a Prisma
   * interactive transaction client.
   *
   * This allows callers to include the outbox write in the same database
   * transaction as their business logic, ensuring atomicity.
   *
   * @example
   * ```ts
   * await this.prisma.$transaction(async (tx) => {
   *   await tx.tenant.create({ data: { ... } });
   *   await this.pubsubOutbox.enqueueWithTransaction(tx, {
   *     eventType: 'tenant.created',
   *     eventSource: 'system_webhook',
   *     aggregateId: tenant.id,
   *     tenantId: tenant.id,
   *     payload: { data: { ... } },
   *   });
   * });
   * ```
   *
   * @param tx     - Prisma interactive transaction client.
   * @param params - Event parameters to enqueue.
   */
  async enqueueWithTransaction(
    tx: any,
    params: PubSubEnqueueParams,
  ): Promise<void> {
    await this.writeOutboxRecord(tx, params);
  }

  // ===========================================================================
  // Background Cron Jobs
  // ===========================================================================

  /**
   * Process pending outbox events every 10 seconds.
   *
   * Fetches up to {@link BATCH_SIZE} `PENDING` events ordered by creation
   * time, respects per-event retry back-off, builds the canonical
   * {@link PubSubMessageEnvelope}, and publishes via
   * {@link PubSubPublisherService}.
   *
   * On success the record is marked `PUBLISHED`; on failure the attempt
   * counter is incremented and, once exhausted, the status moves to `FAILED`.
   */
  @Cron('*/10 * * * * *')
  async processOutbox(): Promise<void> {
    const config = await this.pubSubConfig.getConfig();
    if (!config?.enabled) {
      return;
    }

    const events = await this.prisma.pubSubOutboxEvent.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: this.BATCH_SIZE,
    });

    if (events.length === 0) {
      return;
    }

    const now = new Date();
    let publishedCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    for (const event of events) {
      // -----------------------------------------------------------------------
      // Retry back-off check
      // -----------------------------------------------------------------------
      if (event.attempts > 0 && event.lastAttemptAt) {
        const delaySeconds =
          this.RETRY_DELAYS[
            Math.min(event.attempts - 1, this.RETRY_DELAYS.length - 1)
          ];
        const nextRetryTime = new Date(
          event.lastAttemptAt.getTime() + delaySeconds * 1000,
        );

        if (now < nextRetryTime) {
          skippedCount++;
          continue;
        }
      }

      // -----------------------------------------------------------------------
      // Build envelope & attributes
      // -----------------------------------------------------------------------
      const envelope: PubSubMessageEnvelope = {
        id: event.id,
        source: 'authvital',
        event_type: event.eventType,
        event_source: event.eventSource as 'system_webhook' | 'sync_event',
        timestamp: event.createdAt.toISOString(),
        tenant_id: event.tenantId ?? null,
        application_id: event.applicationId ?? null,
        data: (event.payload as any)?.data ?? event.payload,
      };

      const attributes: PubSubMessageAttributes = {
        event_type: event.eventType,
        event_source: event.eventSource,
        tenant_id: event.tenantId ?? '',
        source: 'authvital',
      };

      // -----------------------------------------------------------------------
      // Publish
      // -----------------------------------------------------------------------
      try {
        const messageId = await this.publisher.publish({
          data: envelope as unknown as Record<string, unknown>,
          attributes: attributes as unknown as Record<string, string>,
          orderingKey: event.orderingKey ?? undefined,
        });

        await this.prisma.pubSubOutboxEvent.update({
          where: { id: event.id },
          data: {
            status: 'PUBLISHED',
            publishedAt: new Date(),
            messageId,
            attempts: { increment: 1 },
          },
        });

        publishedCount++;
      } catch (error: any) {
        const attempts = event.attempts + 1;
        const isFinalAttempt = attempts >= this.MAX_RETRY_ATTEMPTS;

        await this.prisma.pubSubOutboxEvent.update({
          where: { id: event.id },
          data: {
            status: isFinalAttempt ? 'FAILED' : 'PENDING',
            attempts,
            lastAttemptAt: new Date(),
            lastError: error.message?.substring(0, 500) ?? 'Unknown error',
          },
        });

        failedCount++;

        if (isFinalAttempt) {
          this.logger.error(
            `[PubSubOutbox] Event ${event.id} (${event.eventType}) permanently failed after ${attempts} attempts: ${error.message}`,
          );
        }
      }
    }

    this.logger.log(
      `[PubSubOutbox] Processed batch: ${publishedCount} published, ${failedCount} failed, ${skippedCount} skipped (not ready for retry)`,
    );
  }

  /**
   * Clean up old published events daily at 4 AM.
   *
   * Removes `PUBLISHED` events older than {@link CLEANUP_RETENTION_DAYS}
   * to keep the outbox table lean. Failed and skipped events are retained
   * indefinitely for manual inspection.
   */
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async cleanupPublishedEvents(): Promise<void> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - this.CLEANUP_RETENTION_DAYS);

    const result = await this.prisma.pubSubOutboxEvent.deleteMany({
      where: {
        status: 'PUBLISHED',
        createdAt: { lt: cutoff },
      },
    });

    if (result.count > 0) {
      this.logger.log(
        `[PubSubOutbox] Cleaned up ${result.count} published event(s) older than ${this.CLEANUP_RETENTION_DAYS} days`,
      );
    }
  }

  // ===========================================================================
  // Dashboard / Admin Methods
  // ===========================================================================

  /**
   * Get outbox statistics — counts grouped by status.
   * Used by the admin dashboard.
   */
  async getStats(): Promise<Record<string, number>> {
    const results = await this.prisma.$queryRaw<Array<{ status: string; count: bigint }>>`
      SELECT status, COUNT(*) as count
      FROM pub_sub_outbox_events
      GROUP BY status
    `;

    const stats: Record<string, number> = {
      PENDING: 0,
      PUBLISHED: 0,
      FAILED: 0,
      SKIPPED: 0,
    };

    for (const row of results) {
      stats[row.status] = Number(row.count);
    }

    return stats;
  }

  /**
   * Get recent outbox events with optional status filter.
   * Used by the admin dashboard.
   */
  async getRecentEvents(limit: number = 50, status?: string) {
    const where: any = {};
    if (status && ['PENDING', 'PUBLISHED', 'FAILED', 'SKIPPED'].includes(status)) {
      where.status = status;
    }

    return this.prisma.pubSubOutboxEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 200),
      select: {
        id: true,
        eventType: true,
        eventSource: true,
        aggregateId: true,
        tenantId: true,
        topic: true,
        status: true,
        attempts: true,
        lastError: true,
        messageId: true,
        publishedAt: true,
        createdAt: true,
      },
    });
  }

  /**
   * Retry a single failed event by resetting it to PENDING.
   */
  async retryEvent(id: string): Promise<{ success: boolean; message: string }> {
    const event = await this.prisma.pubSubOutboxEvent.findUnique({
      where: { id },
    });

    if (!event) {
      return { success: false, message: 'Event not found' };
    }

    if (event.status !== 'FAILED') {
      return { success: false, message: `Cannot retry event with status ${event.status}` };
    }

    await this.prisma.pubSubOutboxEvent.update({
      where: { id },
      data: {
        status: 'PENDING',
        attempts: 0,
        lastError: null,
        lastAttemptAt: null,
      },
    });

    return { success: true, message: 'Event reset to PENDING for retry' };
  }

  /**
   * Retry all failed events by resetting them to PENDING.
   */
  async retryAllFailed(): Promise<{ success: boolean; count: number }> {
    const result = await this.prisma.pubSubOutboxEvent.updateMany({
      where: { status: 'FAILED' },
      data: {
        status: 'PENDING',
        attempts: 0,
        lastError: null,
        lastAttemptAt: null,
      },
    });

    return { success: true, count: result.count };
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  /**
   * Persist an outbox record using the supplied Prisma client (or transaction).
   *
   * @param client - Prisma client or interactive transaction handle.
   * @param params - Event parameters to persist.
   */
  private async writeOutboxRecord(
    client: any,
    params: PubSubEnqueueParams,
  ): Promise<void> {
    const {
      eventType,
      eventSource,
      aggregateId,
      tenantId,
      applicationId,
      payload,
      orderingKey,
    } = params;

    const status = this.pubSubConfig.isEventEnabled(eventType) ? 'PENDING' : 'SKIPPED';
    const config = await this.pubSubConfig.getConfig();

    await client.pubSubOutboxEvent.create({
      data: {
        eventType,
        eventSource,
        aggregateId,
        tenantId,
        applicationId,
        payload,
        topic: config?.topic ?? 'authvital-events',
        orderingKey,
        status,
      },
    });

    this.logger.debug(
      `[PubSubOutbox] Enqueued event: type=${eventType}, source=${eventSource}, status=${status}`,
    );
  }
}
