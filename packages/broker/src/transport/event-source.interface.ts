/**
 * Transport abstraction for the broker.
 *
 * The broker consumes events from exactly ONE transport at a time:
 *  - OutboxPollingSource      — polls `pub_sub_outbox_events` in Postgres
 *                               (self-host friendly, no GCP required).
 *  - PubSubSubscriptionSource — GCP Pub/Sub ordered subscription.
 *
 * Both normalise events into {@link BrokerEventMessage} so the delivery
 * engine (Phase 1b) never knows which transport is in play.
 */

/** Origin system of an event — matches PubSubOutboxEvent.eventSource. */
export type BrokerEventSource = 'system_webhook' | 'sync_event';

/**
 * A single event as seen by the broker, transport-agnostic.
 *
 * Acknowledgement semantics:
 *  - `ack()`  — the event was fully delivered; it will never be redelivered.
 *  - `skip(reason?)` — the event has no deliverable targets (webhooks
 *    disabled, filtered out, no subscribers). Terminal, never redelivered.
 *  - `nack(retryable = true, error?)` — processing failed. When retryable,
 *    the transport schedules a redelivery (backoff ladder for the outbox
 *    source, Pub/Sub redelivery for the subscription source). When NOT
 *    retryable, the event is dead-lettered / marked FAILED.
 *
 * Exactly one of ack/skip/nack should be called once per message. Sources
 * treat an unhandled handler exception as `nack(true)`.
 */
export interface BrokerEventMessage {
  /** Unique event ID (outbox row ID / envelope ID). */
  id: string;
  /** Event type, e.g. "tenant.created". */
  eventType: string;
  /** Which internal system produced the event. */
  eventSource: BrokerEventSource;
  /** Tenant the event belongs to (null for system-level events). */
  tenantId: string | null;
  /** Application the event relates to (null for system webhook events). */
  applicationId: string | null;
  /** Event-specific payload data. */
  payload: Record<string, unknown>;
  /** Ordering key for per-key FIFO delivery (usually the tenant ID). */
  orderingKey: string | null;
  /** Mark the event as successfully delivered. */
  ack(): Promise<void>;
  /** Mark the event as having no deliverable targets (terminal). */
  skip(reason?: string): Promise<void>;
  /** Mark the event as failed; retryable by default. */
  nack(retryable?: boolean, error?: string): Promise<void>;
}

/** Handler invoked by an EventSource for every consumed message. */
export type BrokerEventHandler = (msg: BrokerEventMessage) => Promise<void>;

/**
 * A running event transport. Implementations must be idempotent-ish about
 * lifecycle: `stop()` after `start()` drains in-flight work before resolving.
 */
export interface EventSource {
  start(handler: BrokerEventHandler): Promise<void>;
  stop(): Promise<void>;
}
