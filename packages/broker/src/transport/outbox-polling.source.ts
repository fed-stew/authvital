import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  BrokerEventHandler,
  BrokerEventMessage,
  BrokerEventSource,
  EventSource,
} from './event-source.interface';

/** Row shape returned by the claim query (camelCase via SQL aliases). */
interface ClaimedRow {
  id: string;
  eventType: string;
  eventSource: string;
  tenantId: string | null;
  applicationId: string | null;
  payload: Prisma.JsonValue;
  orderingKey: string | null;
  deliveryAttempts: number;
}

/**
 * OutboxPollingSource — Postgres-native transport (no GCP required).
 *
 * Polls `pub_sub_outbox_events` for rows with deliveryStatus=PENDING using
 * `SELECT ... FOR UPDATE SKIP LOCKED` inside an interactive transaction, so
 * multiple broker replicas can poll concurrently without double-claiming.
 * Row locks are held for the duration of the batch; rows that are neither
 * acked nor nacked simply return to PENDING when the transaction ends
 * (at-least-once delivery).
 *
 * LIFECYCLE INDEPENDENCE: the broker reads/writes ONLY the delivery_*
 * columns (BrokerDeliveryStatus lifecycle). The GCP publish lifecycle
 * (status/attempts/lastAttemptAt/publishedAt) belongs exclusively to the
 * backend's PubSubOutboxService cron — the two consumers never touch each
 * other's columns, so webhook delivery works even when Pub/Sub is disabled
 * (rows written as status=SKIPPED still have deliveryStatus=PENDING) and
 * broker acks never block legitimate GCP topic export.
 *
 * Delivery status semantics:
 *  - ack  => deliveryStatus DELIVERED.
 *  - skip => deliveryStatus SKIPPED (no deliverable targets; terminal).
 *  - nack(retryable=true)  => deliveryAttempts + 1, stays PENDING; the claim
 *    query enforces the same RETRY_DELAYS backoff ladder as
 *    packages/backend/src/pubsub/pubsub-outbox.service.ts.
 *  - nack(retryable=false) or attempts exhausted => deliveryStatus FAILED.
 *
 * Known trade-off: per-orderingKey FIFO is best-effort here — a backed-off
 * event does not block newer events with the same key. Strict ordering is a
 * Pub/Sub-transport feature.
 */
@Injectable()
export class OutboxPollingSource implements EventSource {
  private readonly logger = new Logger(OutboxPollingSource.name);

  /** Same ladder as PubSubOutboxService.RETRY_DELAYS (seconds). */
  static readonly RETRY_DELAYS_SECONDS = [
    10, 30, 60, 300, 900, 3600, 14400, 43200, 86400, 172800,
  ];

  /** Same cap as PubSubOutboxService.MAX_RETRY_ATTEMPTS. */
  static readonly MAX_RETRY_ATTEMPTS = 10;

  /** Rows claimed per poll tick. */
  private readonly batchSize = 100;

  /** Poll interval — BROKER_POLL_INTERVAL_MS, default 5s. */
  private readonly pollIntervalMs: number;

  /** Interactive transaction budget for one batch (locks held this long max). */
  private readonly claimTxTimeoutMs: number;

  private handler: BrokerEventHandler | null = null;
  private running = false;
  private timer: NodeJS.Timeout | null = null;
  private inFlight: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly prisma: PrismaService,
    configService: ConfigService,
  ) {
    this.pollIntervalMs = parseInt(
      configService.get<string>('BROKER_POLL_INTERVAL_MS') ?? '5000',
      10,
    );
    this.claimTxTimeoutMs = parseInt(
      configService.get<string>('BROKER_CLAIM_TX_TIMEOUT_MS') ?? '30000',
      10,
    );
  }

  // ---------------------------------------------------------------------------
  // EventSource lifecycle
  // ---------------------------------------------------------------------------

  async start(handler: BrokerEventHandler): Promise<void> {
    if (this.running) {
      throw new Error('OutboxPollingSource already started');
    }
    this.handler = handler;
    this.running = true;
    this.logger.log(
      `Outbox polling started (interval=${this.pollIntervalMs}ms, batch=${this.batchSize})`,
    );
    this.scheduleNext(0);
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    // Drain the in-flight batch so we never abandon locked rows mid-handler.
    await this.inFlight;
    this.logger.log('Outbox polling stopped');
  }

  // ---------------------------------------------------------------------------
  // Polling loop
  // ---------------------------------------------------------------------------

  private scheduleNext(delayMs: number): void {
    if (!this.running) {
      return;
    }
    this.timer = setTimeout(() => {
      this.inFlight = this.pollOnce()
        .catch((error: Error) => {
          this.logger.error(`Poll tick failed: ${error.message}`, error.stack);
        })
        .finally(() => this.scheduleNext(this.pollIntervalMs));
    }, delayMs);
    // Don't keep the process alive just for polling; Nest owns the lifecycle.
    this.timer.unref?.();
  }

  /**
   * Claim and process one batch. Exposed (not private) for unit testing —
   * the timer loop is just scheduling sugar around this.
   *
   * @returns number of rows claimed in this tick.
   */
  async pollOnce(): Promise<number> {
    const handler = this.handler;
    if (!handler) {
      return 0;
    }

    return this.prisma.$transaction(
      async (tx) => {
        const rows = await this.claimBatch(tx);

        for (const row of rows) {
          const { message, isSettled } = this.buildMessage(tx, row);
          try {
            await handler(message);
            if (!isSettled()) {
              this.logger.warn(
                `Handler finished without ack/nack for event ${row.id}; it will be re-claimed`,
              );
            }
          } catch (error: any) {
            this.logger.error(
              `Handler threw for event ${row.id} (${row.eventType}): ${error.message}`,
            );
            if (!isSettled()) {
              await message.nack(true);
            }
          }
        }

        if (rows.length > 0) {
          this.logger.debug(`Claimed and processed ${rows.length} event(s)`);
        }
        return rows.length;
      },
      { timeout: this.claimTxTimeoutMs, maxWait: 5000 },
    );
  }

  // ---------------------------------------------------------------------------
  // Claiming & acknowledgement
  // ---------------------------------------------------------------------------

  /**
   * SELECT ... FOR UPDATE SKIP LOCKED claim on the DELIVERY lifecycle.
   * Backoff readiness is evaluated in SQL so not-yet-ready rows are never
   * locked or fetched. The GCP publish `status` column is deliberately NOT
   * part of the predicate — delivery is independent of topic export.
   */
  private async claimBatch(tx: Prisma.TransactionClient): Promise<ClaimedRow[]> {
    const backoffCase = OutboxPollingSource.buildBackoffCaseSql();

    return tx.$queryRaw<ClaimedRow[]>`
      SELECT id,
             event_type        AS "eventType",
             event_source      AS "eventSource",
             tenant_id         AS "tenantId",
             application_id    AS "applicationId",
             payload,
             ordering_key      AS "orderingKey",
             delivery_attempts AS "deliveryAttempts"
      FROM pub_sub_outbox_events
      WHERE delivery_status = 'PENDING'
        AND (
          delivery_attempts = 0
          OR last_delivery_attempt_at IS NULL
          OR last_delivery_attempt_at + make_interval(secs => ${Prisma.raw(backoffCase)}) <= NOW()
        )
      ORDER BY created_at ASC
      LIMIT ${this.batchSize}
      FOR UPDATE SKIP LOCKED
    `;
  }

  /**
   * Render the RETRY_DELAYS ladder as a SQL CASE expression keyed on the
   * attempt count (values are compile-time constants — no injection surface).
   */
  static buildBackoffCaseSql(): string {
    const delays = OutboxPollingSource.RETRY_DELAYS_SECONDS;
    const clauses = delays
      .map((seconds, index) =>
        index === delays.length - 1
          ? `ELSE ${seconds}`
          : `WHEN ${index + 1} THEN ${seconds}`,
      )
      .join(' ');
    return `CASE LEAST(delivery_attempts, ${delays.length}) ${clauses} END`;
  }

  /**
   * Wrap a claimed row as a BrokerEventMessage whose ack/nack write through
   * the SAME transaction that holds the row lock (multi-replica safe).
   */
  private buildMessage(
    tx: Prisma.TransactionClient,
    row: ClaimedRow,
  ): { message: BrokerEventMessage; isSettled: () => boolean } {
    let settled = false;
    const settleOnce = (): boolean => {
      if (settled) {
        this.logger.warn(`Event ${row.id} was acked/nacked more than once`);
        return false;
      }
      settled = true;
      return true;
    };

    const message: BrokerEventMessage = {
      id: row.id,
      eventType: row.eventType,
      eventSource: row.eventSource as BrokerEventSource,
      tenantId: row.tenantId,
      applicationId: row.applicationId,
      payload: (row.payload ?? {}) as Record<string, unknown>,
      orderingKey: row.orderingKey,

      ack: async (): Promise<void> => {
        if (!settleOnce()) return;
        await tx.pubSubOutboxEvent.update({
          where: { id: row.id },
          data: {
            deliveryStatus: 'DELIVERED',
            deliveryAttempts: { increment: 1 },
            lastDeliveryAttemptAt: new Date(),
          },
        });
      },

      skip: async (reason?: string): Promise<void> => {
        if (!settleOnce()) return;
        await tx.pubSubOutboxEvent.update({
          where: { id: row.id },
          data: {
            deliveryStatus: 'SKIPPED',
            lastDeliveryError: reason?.substring(0, 500) ?? null,
          },
        });
      },

      nack: async (retryable = true, error?: string): Promise<void> => {
        if (!settleOnce()) return;
        const attempts = row.deliveryAttempts + 1;
        const exhausted = attempts >= OutboxPollingSource.MAX_RETRY_ATTEMPTS;
        const failed = !retryable || exhausted;

        await tx.pubSubOutboxEvent.update({
          where: { id: row.id },
          data: {
            deliveryStatus: failed ? 'FAILED' : 'PENDING',
            deliveryAttempts: attempts,
            lastDeliveryAttemptAt: new Date(),
            lastDeliveryError: error?.substring(0, 500) ?? null,
          },
        });

        if (failed) {
          this.logger.error(
            `Event ${row.id} (${row.eventType}) delivery marked FAILED ` +
              (retryable ? `after ${attempts} attempts` : 'as non-retryable') +
              (error ? `: ${error}` : ''),
          );
        }
      },
    };

    return { message, isSettled: () => settled };
  }
}
