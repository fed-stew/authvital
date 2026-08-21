import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BrokerEventMessage } from '../transport/event-source.interface';
import { CircuitBreakerService } from './circuit-breaker.service';
import { DeliveryOutcome } from './delivery.interface';
import { eventMatchesFilter } from './event-filter';
import { KeyReaderService } from './key-reader.service';
import { resolveFullPayload } from './payload-resolver';
import { categorizeError, postWebhook } from './webhook-http';
import { UrlGuardService } from './url-guard.service';

/**
 * SyncEventDeliverer — per-application sync-event webhooks.
 *
 * Faithful port of SyncEventService.deliverWebhook() from
 * packages/backend/src/sync/sync-event.service.ts:
 *  - Same application config checks (webhookEnabled/webhookUrl/filter).
 *  - Same wire format: body = JSON.stringify(syncEvent.payload), signature
 *    = RSA-SHA256 over `${timestamp}.${body}` (base64), same X-AuthVital-*
 *    headers — byte-identical for existing receivers.
 *  - Same syncEvent write-backs (webhookStatus/webhookAttempts/
 *    lastAttemptAt/deliveredAt/lastError) so admin dashboards keep working.
 *  - Same 5-attempt budget (MAX_RETRY_ATTEMPTS) — the transport's backoff
 *    ladder schedules WHEN retries happen; this budget decides HOW MANY.
 *
 * CRITICAL: the signature embeds a unix-seconds timestamp and receivers
 * enforce a ~300s replay window, so every attempt RE-SIGNS with a fresh
 * timestamp. Never cache signatures across attempts.
 */
@Injectable()
export class SyncEventDeliverer {
  private readonly logger = new Logger(SyncEventDeliverer.name);

  /** Same cap as the backend's SyncEventService. */
  static readonly MAX_RETRY_ATTEMPTS = 5;

  constructor(
    private readonly prisma: PrismaService,
    private readonly keyReader: KeyReaderService,
    private readonly urlGuard: UrlGuardService,
    private readonly circuitBreaker: CircuitBreakerService,
  ) {}

  async deliver(message: BrokerEventMessage): Promise<DeliveryOutcome> {
    // The sync event id lives INSIDE the payload (payload.id), not in
    // message.id (that's the outbox row id).
    const payload = await resolveFullPayload(this.prisma, message, [
      'id',
      'type',
    ]);
    if (!payload) {
      return {
        outcome: 'failed',
        retryable: false,
        error: 'Cannot resolve full sync event payload',
      };
    }

    const syncEventId = payload.id as string;

    const event = await this.prisma.syncEvent.findUnique({
      where: { id: syncEventId },
    });

    if (!event) {
      // Row may have been cleaned up (30-day retention) — nothing to do.
      return { outcome: 'skipped', reason: 'Sync event row not found' };
    }

    if (event.webhookStatus !== 'PENDING') {
      // Already DELIVERED/FAILED/SKIPPED (e.g. duplicate redelivery, or the
      // legacy backend path already handled it). Same guard as the backend.
      return {
        outcome: 'skipped',
        reason: `Sync event webhookStatus is ${event.webhookStatus}, not PENDING`,
      };
    }

    const application = await this.prisma.application.findUnique({
      where: { id: event.applicationId },
      select: {
        id: true,
        name: true,
        webhookUrl: true,
        webhookEnabled: true,
        webhookEvents: true,
      },
    });

    if (!application) {
      await this.markSkipped(syncEventId);
      return { outcome: 'skipped', reason: 'Application not found' };
    }

    if (!application.webhookEnabled || !application.webhookUrl) {
      await this.markSkipped(syncEventId);
      return {
        outcome: 'skipped',
        reason: 'Webhook disabled or no URL configured',
      };
    }

    // Same filter semantics as emit(): empty filter = deliver everything.
    const filters = application.webhookEvents ?? [];
    if (filters.length > 0 && !eventMatchesFilter(event.eventType, filters)) {
      await this.markSkipped(syncEventId);
      return {
        outcome: 'skipped',
        reason: `Event type "${event.eventType}" does not match filter`,
      };
    }

    // SSRF guard — a blocked URL will not become deliverable by retrying.
    const verdict = await this.urlGuard.checkUrl(application.webhookUrl);
    if (!verdict.allowed) {
      await this.prisma.syncEvent.update({
        where: { id: syncEventId },
        data: {
          webhookStatus: 'FAILED',
          lastAttemptAt: new Date(),
          lastError: `[SSRF_BLOCKED] ${verdict.reason}`,
        },
      });
      return {
        outcome: 'failed',
        retryable: false,
        error: `SSRF blocked: ${verdict.reason}`,
      };
    }

    // Circuit breaker — refuse without attempting; no syncEvent writes so
    // the 5-attempt budget is not burned by breaker rejections.
    if (!this.circuitBreaker.canAttempt(application.webhookUrl)) {
      return {
        outcome: 'failed',
        retryable: true,
        error: `Circuit open for ${application.webhookUrl}`,
      };
    }

    return this.attemptDelivery(event, application.webhookUrl);
  }

  // ---------------------------------------------------------------------------
  // Single delivery attempt (sign fresh, POST, write back)
  // ---------------------------------------------------------------------------

  private async attemptDelivery(
    event: {
      id: string;
      eventType: string;
      payload: unknown;
      webhookAttempts: number;
    },
    webhookUrl: string,
  ): Promise<DeliveryOutcome> {
    try {
      // RE-SIGN EVERY ATTEMPT: fresh unix-seconds timestamp, receivers
      // enforce a replay window on `${timestamp}.${body}`.
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const body = JSON.stringify(event.payload);
      const { signature, kid } = await this.keyReader.sign(
        `${timestamp}.${body}`,
      );

      const headers = {
        'Content-Type': 'application/json',
        'X-AuthVital-Signature': signature,
        'X-AuthVital-Key-Id': kid,
        'X-AuthVital-Timestamp': timestamp,
        'X-AuthVital-Event-Id': event.id,
        'X-AuthVital-Event-Type': event.eventType,
      };

      const response = await postWebhook(webhookUrl, headers, body);

      if (!response.ok) {
        let responseBody = '';
        try {
          responseBody = await response.text();
        } catch {
          responseBody = '[Could not read response body]';
        }
        throw new Error(
          `HTTP ${response.status}: ${response.statusText} - ${responseBody.substring(0, 200)}`,
        );
      }

      await this.prisma.syncEvent.update({
        where: { id: event.id },
        data: {
          webhookStatus: 'DELIVERED',
          deliveredAt: new Date(),
          webhookAttempts: { increment: 1 },
          lastAttemptAt: new Date(),
        },
      });

      this.circuitBreaker.recordSuccess(webhookUrl);
      this.logger.debug(
        `Delivered sync event ${event.id} (${event.eventType}) to ${webhookUrl}`,
      );
      return { outcome: 'delivered' };
    } catch (error: any) {
      this.circuitBreaker.recordFailure(webhookUrl);

      const errorCategory = categorizeError(error);
      const attempts = event.webhookAttempts + 1;
      const isFinalAttempt = attempts >= SyncEventDeliverer.MAX_RETRY_ATTEMPTS;

      await this.prisma.syncEvent.update({
        where: { id: event.id },
        data: {
          webhookStatus: isFinalAttempt ? 'FAILED' : 'PENDING',
          webhookAttempts: attempts,
          lastAttemptAt: new Date(),
          lastError: `[${errorCategory}] ${error.message}`,
        },
      });

      this.logger.warn(
        `Sync webhook delivery failed for ${event.id} (${event.eventType}) ` +
          `to ${webhookUrl}: [${errorCategory}] ${error.message} — ` +
          (isFinalAttempt
            ? 'FINAL FAILURE'
            : `attempt ${attempts}/${SyncEventDeliverer.MAX_RETRY_ATTEMPTS}`),
      );

      return {
        outcome: 'failed',
        retryable: !isFinalAttempt,
        error: `[${errorCategory}] ${error.message}`,
      };
    }
  }

  private async markSkipped(syncEventId: string): Promise<void> {
    await this.prisma.syncEvent.update({
      where: { id: syncEventId },
      data: { webhookStatus: 'SKIPPED' },
    });
  }
}
