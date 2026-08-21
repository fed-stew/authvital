/**
 * Pub/Sub Message Type Definitions
 *
 * The canonical wire format now lives in @authvital/shared
 * (packages/shared/src/types/pubsub-envelope.types.ts) so the backend,
 * the broker, and the server SDK share ONE definition. This file re-exports
 * it to keep the existing internal import path
 * (`../pubsub/types/pubsub-message`) working — nothing else churns.
 */

export type {
  PubSubMessageEnvelope,
  PubSubMessageAttributes,
  PubSubEnqueueParams,
} from '@authvital/shared';
