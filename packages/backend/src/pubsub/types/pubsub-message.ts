/**
 * Pub/Sub Message Type Definitions
 *
 * Defines the canonical message envelope published to GCP Pub/Sub.
 * Subscribers receive these messages on configured topics.
 */

// =============================================================================
// MESSAGE ENVELOPE
// =============================================================================

/**
 * The JSON body of every Pub/Sub message published by AuthVital.
 */
export interface PubSubMessageEnvelope {
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
  data: Record<string, unknown>;
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
// OUTBOX ENQUEUE PARAMS
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
