import { Message, PubSub, Subscription } from '@google-cloud/pubsub';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BrokerEventHandler,
  BrokerEventMessage,
  EventSource,
} from './event-source.interface';

import type { PubSubMessageEnvelope } from '@authvital/shared';

/**
 * Wire envelope published by the backend's outbox publisher.
 *
 * The canonical definition now lives in @authvital/shared
 * (pubsub-envelope.types.ts) — aliased under the old local name so
 * existing internal imports keep working.
 */
export type PubSubWireEnvelope = PubSubMessageEnvelope;

/**
 * PubSubSubscriptionSource — GCP Pub/Sub transport.
 *
 * Consumes an (ideally ordered) subscription whose name comes from
 * BROKER_PUBSUB_SUBSCRIPTION. GCP connectivity follows the same rules as
 * packages/backend/src/pubsub/pubsub-publisher.service.ts:
 *  - PUBSUB_PROJECT_ID  — real GCP project (ADC credentials).
 *  - PUBSUB_EMULATOR_HOST — the client library picks this env var up
 *    automatically for local/emulator use.
 *
 * ack => message.ack(); nack(retryable=true) => message.nack() so Pub/Sub
 * redelivers per the subscription's retry policy. nack(retryable=false)
 * acks + logs loudly — Pub/Sub has no per-message "never retry" without a
 * dead-letter topic, which arrives with the Phase 1b DLQ work.
 */
@Injectable()
export class PubSubSubscriptionSource implements EventSource {
  private readonly logger = new Logger(PubSubSubscriptionSource.name);

  private pubsub: PubSub | null = null;
  private subscription: Subscription | null = null;

  constructor(private readonly configService: ConfigService) {}

  // ---------------------------------------------------------------------------
  // EventSource lifecycle
  // ---------------------------------------------------------------------------

  async start(handler: BrokerEventHandler): Promise<void> {
    const projectId = this.configService.get<string>('PUBSUB_PROJECT_ID');
    const emulatorHost = this.configService.get<string>('PUBSUB_EMULATOR_HOST');
    const subscriptionName = this.configService.get<string>(
      'BROKER_PUBSUB_SUBSCRIPTION',
    );

    // The pubsub transport was EXPLICITLY selected, so misconfiguration is a
    // hard error — unlike the backend publisher, which soft-disables itself.
    if (!subscriptionName) {
      throw new Error(
        'BROKER_TRANSPORT=pubsub requires BROKER_PUBSUB_SUBSCRIPTION to be set',
      );
    }
    if (!projectId && !emulatorHost) {
      throw new Error(
        'BROKER_TRANSPORT=pubsub requires PUBSUB_PROJECT_ID or PUBSUB_EMULATOR_HOST',
      );
    }

    if (emulatorHost) {
      this.logger.log(`Using Pub/Sub emulator at ${emulatorHost}`);
    }

    this.pubsub = new PubSub({ projectId });
    this.subscription = this.pubsub.subscription(subscriptionName);

    this.subscription.on('message', (message: Message) => {
      void this.handleMessage(message, handler);
    });
    this.subscription.on('error', (error: Error) => {
      this.logger.error(`Subscription error: ${error.message}`, error.stack);
    });

    this.logger.log(
      `Pub/Sub subscription source started — subscription "${subscriptionName}" (project: ${projectId ?? 'emulator'})`,
    );
  }

  async stop(): Promise<void> {
    if (this.subscription) {
      await this.subscription.close();
      this.subscription = null;
    }
    if (this.pubsub) {
      await this.pubsub.close();
      this.pubsub = null;
    }
    this.logger.log('Pub/Sub subscription source stopped');
  }

  // ---------------------------------------------------------------------------
  // Message handling (internal, exposed for unit tests)
  // ---------------------------------------------------------------------------

  /** @internal — exported for unit testing. */
  async handleMessage(
    message: Pick<Message, 'id' | 'data' | 'orderingKey' | 'ack' | 'nack'>,
    handler: BrokerEventHandler,
  ): Promise<void> {
    let envelope: PubSubWireEnvelope;
    try {
      envelope = PubSubSubscriptionSource.parseEnvelope(message.data);
    } catch (error: any) {
      // Poison message: unparseable payloads would redeliver forever if
      // nacked. Ack + log; a dead-letter topic lands in Phase 1b.
      this.logger.error(
        `Dropping unparseable Pub/Sub message ${message.id}: ${error.message}`,
      );
      message.ack();
      return;
    }

    const brokerMessage = this.toBrokerMessage(envelope, message);

    try {
      await handler(brokerMessage);
    } catch (error: any) {
      this.logger.error(
        `Handler threw for event ${envelope.id} (${envelope.event_type}): ${error.message}`,
      );
      await brokerMessage.nack(true);
    }
  }

  /**
   * Parse and validate the wire envelope produced by the backend's
   * PubSubOutboxService (see its processOutbox() envelope construction).
   *
   * @throws on malformed JSON or missing required fields.
   */
  static parseEnvelope(data: Buffer | Uint8Array): PubSubWireEnvelope {
    const parsed = JSON.parse(Buffer.from(data).toString('utf8'));

    if (typeof parsed?.id !== 'string' || typeof parsed?.event_type !== 'string') {
      throw new Error('Envelope missing required "id"/"event_type" fields');
    }
    if (
      parsed.event_source !== 'system_webhook' &&
      parsed.event_source !== 'sync_event'
    ) {
      throw new Error(`Unknown event_source "${parsed.event_source}"`);
    }

    return {
      id: parsed.id,
      source: parsed.source,
      event_type: parsed.event_type,
      event_source: parsed.event_source,
      timestamp: parsed.timestamp,
      tenant_id: parsed.tenant_id ?? null,
      application_id: parsed.application_id ?? null,
      data: (parsed.data ?? {}) as Record<string, unknown>,
    };
  }

  private toBrokerMessage(
    envelope: PubSubWireEnvelope,
    message: Pick<Message, 'orderingKey' | 'ack' | 'nack'>,
  ): BrokerEventMessage {
    return {
      id: envelope.id,
      eventType: envelope.event_type,
      eventSource: envelope.event_source,
      tenantId: envelope.tenant_id,
      applicationId: envelope.application_id,
      payload: envelope.data,
      orderingKey: message.orderingKey || envelope.tenant_id || null,

      ack: async (): Promise<void> => {
        message.ack();
      },

      skip: async (reason?: string): Promise<void> => {
        // Nothing to deliver — consumed as far as Pub/Sub is concerned.
        this.logger.debug(
          `Event ${envelope.id} (${envelope.event_type}) skipped${reason ? `: ${reason}` : ''}`,
        );
        message.ack();
      },

      nack: async (retryable = true, error?: string): Promise<void> => {
        if (retryable) {
          message.nack();
          return;
        }
        // Non-retryable without a dead-letter topic: ack so it doesn't loop
        // forever, but shout about it. Configure a subscription DLQ in GCP
        // for durable capture of these.
        this.logger.error(
          `Event ${envelope.id} (${envelope.event_type}) non-retryable — acking without delivery` +
            (error ? `: ${error}` : ''),
        );
        message.ack();
      },
    };
  }
}
