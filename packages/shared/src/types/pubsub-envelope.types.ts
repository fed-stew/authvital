/**
 * Pub/Sub Wire Format — the SINGLE SOURCE OF TRUTH.
 *
 * The canonical message envelope + attributes published to GCP Pub/Sub by
 * the AuthVital outbox publisher
 * (packages/backend/src/pubsub/pubsub-outbox.service.ts). The backend, the
 * authvital-broker, and @authvital/server's pubsub module all re-use these
 * definitions — do not fork them.
 *
 * Wire notes:
 *  - `data` carries the INNER event payload: for sync events the publisher
 *    unwraps `BaseSyncEvent.data`; for system events it unwraps the
 *    dispatch wrapper's `data`.
 *  - Attributes duplicate routing fields so subscribers can filter without
 *    deserializing the JSON body.
 */

import type { SyncEvent, SyncEventType } from './sync-events.types.js';
import type { SystemEventDataOf, SystemEventType } from './system-events.types.js';

// System event types + canonical payload contracts live in
// system-events.types.ts (the source of truth, enforced at dispatch time).
// Re-exported names come through the barrel — this file only consumes them.

/** Any event type that can appear on the wire. */
export type PubSubEventType = SyncEventType | SystemEventType;

// =============================================================================
// MESSAGE ENVELOPE
// =============================================================================

/**
 * The JSON body of every Pub/Sub message published by AuthVital.
 *
 * Loosely typed (default `TData`) for producers; consumers who want
 * per-event narrowing should use {@link AuthVitalPubSubEvent}.
 */
export interface PubSubMessageEnvelope<
  TData = Record<string, unknown>,
> {
  /** Unique event ID (matches outbox record ID) */
  id: string;
  /** Source system identifier */
  source: 'authvital';
  /** Event type (e.g., "tenant.created", "member.joined") */
  event_type: string;
  /** Which internal system produced this event */
  event_source: 'system_webhook' | 'sync_event';
  /** ISO 8601 timestamp of when the event occurred */
  timestamp: string;
  /** Tenant ID where the event occurred (null for system-level events) */
  tenant_id: string | null;
  /** Application ID the event relates to (null for system webhook events) */
  application_id: string | null;
  /** Event-specific payload data */
  data: TData;
}

// =============================================================================
// TYPED, NARROWABLE UNION
// =============================================================================

/** Payload type for a given sync event type (derived — never drifts). */
export type SyncEventDataOf<T extends SyncEventType> = Extract<
  SyncEvent,
  { type: T }
>['data'];

/**
 * Envelope for a sync event, discriminated on `event_type` so a
 * `switch (env.event_type)` narrows `env.data` automatically.
 * (Distributive conditional produces one union member per event type.)
 */
export type SyncEventEnvelope<T extends SyncEventType = SyncEventType> =
  T extends SyncEventType
    ? {
        id: string;
        source: 'authvital';
        event_type: T;
        event_source: 'sync_event';
        timestamp: string;
        tenant_id: string | null;
        application_id: string | null;
        data: SyncEventDataOf<T>;
      }
    : never;

/**
 * Envelope for a system (system_webhook) event — discriminated on
 * `event_type` with the CANONICAL strict payload per event, exactly like
 * sync events.
 */
export type SystemEventEnvelope<T extends SystemEventType = SystemEventType> =
  T extends SystemEventType
    ? {
        id: string;
        source: 'authvital';
        event_type: T;
        event_source: 'system_webhook';
        timestamp: string;
        tenant_id: string | null;
        application_id: string | null;
        data: SystemEventDataOf<T>;
      }
    : never;

/**
 * Every event AuthVital publishes, as a discriminated union.
 *
 * ```ts
 * switch (event.event_type) {
 *   case 'member.joined':
 *     event.data.membership_id; // narrowed to MemberJoinedEvent data
 *     break;
 *   case 'tenant.created':
 *     event.data.tenant_id;     // narrowed to SystemEventData
 *     break;
 * }
 * ```
 */
export type AuthVitalPubSubEvent = SyncEventEnvelope | SystemEventEnvelope;

// =============================================================================
// TYPE GUARDS
// =============================================================================

/** Narrow an envelope to the sync-event side of the union. */
export function isSyncEventEnvelope(
  envelope: AuthVitalPubSubEvent,
): envelope is SyncEventEnvelope {
  return envelope.event_source === 'sync_event';
}

/** Narrow an envelope to the system-event side of the union. */
export function isSystemEventEnvelope(
  envelope: AuthVitalPubSubEvent,
): envelope is SystemEventEnvelope {
  return envelope.event_source === 'system_webhook';
}

// =============================================================================
// MESSAGE ATTRIBUTES (for Pub/Sub attribute-based filtering)
// =============================================================================

/**
 * Pub/Sub message attributes set on every published message.
 * Subscribers can filter on these without deserializing the JSON body.
 */
export interface PubSubMessageAttributes {
  /** Event type for filtering (e.g., "tenant.created") */
  event_type: string;
  /** Event source for filtering ("system_webhook" | "sync_event") */
  event_source: string;
  /** Tenant ID for filtering */
  tenant_id: string;
  /** Source system identifier */
  source: string;
}

// =============================================================================
// OUTBOX ENQUEUE PARAMS (producer-side)
// =============================================================================

/**
 * Parameters for enqueuing an event to the Pub/Sub outbox.
 */
export interface PubSubEnqueueParams {
  /** Event type (e.g., "tenant.created") */
  eventType: string;
  /** Which system produced the event */
  eventSource: 'system_webhook' | 'sync_event';
  /** Primary entity ID for the event */
  aggregateId: string;
  /** Tenant ID (used for ordering key) */
  tenantId?: string;
  /** Application ID (for sync events) */
  applicationId?: string;
  /** Full event payload */
  payload: Record<string, unknown>;
  /** Pub/Sub ordering key */
  orderingKey?: string;
}
