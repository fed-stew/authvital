import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BrokerEventMessage } from '../transport/event-source.interface';
import { CircuitBreakerService } from './circuit-breaker.service';
import { DeliveryOutcome } from './delivery.interface';
import { KeyReaderService } from './key-reader.service';
import { resolveFullPayload } from './payload-resolver';
import { postWebhook } from './webhook-http';
import { UrlGuardService } from './url-guard.service';

/**
 * Wire payload — same wrapper shape SystemWebhookService dispatches today
 * ({event, timestamp, data} = BaseSystemEvent in @authvital/shared).
 *
 * `data` stays intentionally opaque here: the deliverer is a PASSTHROUGH
 * and must forward whatever the core dispatched byte-for-byte. The strict
 * per-event contracts (SystemEventDataOf<T>, system-events.types.ts) are
 * enforced at the PRODUCER (generic dispatch) — re-validating here would
 * only add a place for drift.
 */
interface SystemWebhookPayload {
  event: string;
  timestamp: string;
  data: Record<string, unknown>;
}

/** Per-target delivery result. */
interface TargetResult {
  webhookId: string;
  success: boolean;
  retryable: boolean;
}

/**
 * SystemWebhookDeliverer — instance-level system webhooks.
 *
 * Faithful port of SystemWebhookService.deliverWebhook() from
 * packages/backend/src/webhooks/system-webhook.service.ts:
 *  - Same target selection: isActive AND events array contains the event
 *    (exact match — system webhooks have no wildcard semantics today).
 *  - Same wire format: body = JSON.stringify({event, timestamp, data}),
 *    signature = RSA-SHA256 over the BODY ONLY (base64), X-Webhook-*
 *    headers plus per-webhook custom headers. NOTE: this differs from the
 *    sync-event format (no timestamp prefix in the signature input) — we
 *    preserve the difference for receiver compatibility.
 *  - Same bookkeeping: systemWebhookDelivery log row per attempt, and
 *    lastTriggeredAt/lastStatus/failureCount stats on the webhook row
 *    (failureCount resets to 0 on success, increments on failure).
 *
 * AT-LEAST-ONCE ACROSS MULTIPLE TARGETS: when some targets succeed and at
 * least one fails retryably, the whole event is nacked and REDELIVERED TO
 * ALL TARGETS. Receivers may therefore see duplicates and must dedupe —
 * they already carry that obligation under the platform's at-least-once
 * contract (dedupe by event id, as examples/bff-express does).
 */
@Injectable()
export class SystemWebhookDeliverer {
  private readonly logger = new Logger(SystemWebhookDeliverer.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly keyReader: KeyReaderService,
    private readonly urlGuard: UrlGuardService,
    private readonly circuitBreaker: CircuitBreakerService,
  ) {}

  async deliver(message: BrokerEventMessage): Promise<DeliveryOutcome> {
    const resolved = await resolveFullPayload(this.prisma, message, [
      'event',
      'timestamp',
    ]);

    // Fallback (outbox row cleaned up + Pub/Sub inner-data payload):
    // reconstruct the wrapper. Only reachable in pathological replays.
    const payload: SystemWebhookPayload = resolved
      ? (resolved as unknown as SystemWebhookPayload)
      : {
          event: message.eventType,
          timestamp: new Date().toISOString(),
          data: message.payload,
        };

    const webhooks = await this.prisma.systemWebhook.findMany({
      where: {
        isActive: true,
        events: { has: payload.event },
      },
    });

    if (webhooks.length === 0) {
      return {
        outcome: 'skipped',
        reason: `No active system webhooks subscribed to ${payload.event}`,
      };
    }

    const body = JSON.stringify(payload);

    const results: TargetResult[] = [];
    for (const webhook of webhooks) {
      results.push(await this.deliverToTarget(webhook, payload, body));
    }

    const failures = results.filter((r) => !r.success);
    if (failures.length === 0) {
      return { outcome: 'delivered' };
    }

    // Partial failure: nack retryably only if at least one target failed
    // retryably; otherwise mark FAILED so ops can see it (per-target results
    // are in the systemWebhookDelivery log either way).
    const retryable = failures.some((f) => f.retryable);
    return {
      outcome: 'failed',
      retryable,
      error:
        `${failures.length}/${results.length} system webhook target(s) failed ` +
        `for ${payload.event} (${retryable ? 'retryable' : 'permanent'})`,
    };
  }

  // ---------------------------------------------------------------------------
  // Single-target delivery
  // ---------------------------------------------------------------------------

  private async deliverToTarget(
    webhook: { id: string; url: string; headers: unknown },
    payload: SystemWebhookPayload,
    body: string,
  ): Promise<TargetResult> {
    // SSRF guard: permanent failure for this target; still logged for ops.
    const verdict = await this.urlGuard.checkUrl(webhook.url);
    if (!verdict.allowed) {
      await this.recordDelivery(webhook.id, payload, {
        status: null,
        response: null,
        duration: 0,
        error: `[SSRF_BLOCKED] ${verdict.reason}`,
      });
      return { webhookId: webhook.id, success: false, retryable: false };
    }

    // Circuit breaker: refuse without attempting; no stats/log writes so
    // breaker rejections don't pollute the delivery history.
    if (!this.circuitBreaker.canAttempt(webhook.url)) {
      return { webhookId: webhook.id, success: false, retryable: true };
    }

    // Re-sign per attempt (fresh signature; body is the signature input,
    // exactly like the backend).
    const { signature, kid } = await this.keyReader.sign(body);
    const startTime = Date.now();

    let status: number | null = null;
    let response: string | null = null;
    let error: string | null = null;

    try {
      const customHeaders = (webhook.headers as Record<string, string>) || {};

      const res = await postWebhook(
        webhook.url,
        {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Key-Id': kid,
          'X-Webhook-Event': payload.event,
          'X-Webhook-Timestamp': payload.timestamp,
          ...customHeaders,
        },
        body,
      );

      status = res.status;
      response = await res.text().catch(() => null);

      if (response && response.length > 1000) {
        response = response.substring(0, 1000) + '...';
      }
    } catch (err: unknown) {
      error = (err as Error).message || 'Unknown error';
    }

    const duration = Date.now() - startTime;
    const success = status !== null && status >= 200 && status < 300;

    await this.recordDelivery(webhook.id, payload, {
      status,
      response,
      duration,
      error,
    });

    if (success) {
      this.circuitBreaker.recordSuccess(webhook.url);
    } else {
      this.circuitBreaker.recordFailure(webhook.url);
      this.logger.warn(
        `System webhook delivery failed: ${webhook.id} -> ${webhook.url} ` +
          `(${status ?? error ?? 'no response'})`,
      );
    }

    // Retryable: network errors/timeouts, 5xx, and 429. Other 4xx = the
    // receiver actively rejected the payload; retrying the same bytes at
    // the same endpoint will not help.
    const retryable =
      !success && (error !== null || status === 429 || (status ?? 0) >= 500);

    return { webhookId: webhook.id, success, retryable };
  }

  /** Delivery log + stats write-back, exactly as the backend does today. */
  private async recordDelivery(
    webhookId: string,
    payload: SystemWebhookPayload,
    result: {
      status: number | null;
      response: string | null;
      duration: number;
      error: string | null;
    },
  ): Promise<void> {
    const success =
      result.status !== null && result.status >= 200 && result.status < 300;

    await this.prisma.systemWebhookDelivery.create({
      data: {
        webhookId,
        event: payload.event,
        payload: payload as unknown as object,
        status: result.status,
        response: result.response,
        duration: result.duration,
        error: result.error,
      },
    });

    await this.prisma.systemWebhook.update({
      where: { id: webhookId },
      data: {
        lastTriggeredAt: new Date(),
        lastStatus: result.status,
        failureCount: success ? 0 : { increment: 1 },
      },
    });
  }
}
