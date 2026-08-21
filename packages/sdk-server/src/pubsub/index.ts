/**
 * @authvital/server/pubsub
 *
 * First-class GCP Pub/Sub consumption for AuthVital events: typed parsing,
 * event dispatch with wildcard routing, idempotency, and a push-endpoint
 * helper. No dependency on @google-cloud/pubsub — everything is structural,
 * so it works with pull Messages, push bodies, and emulator traffic alike.
 *
 * @example Pull subscription
 * ```typescript
 * import { PubSub } from '@google-cloud/pubsub';
 * import {
 *   createPubSubDispatcher,
 *   parsePubSubMessage,
 *   InMemoryDedupeStore,
 *   PubSubParseError,
 * } from '@authvital/server/pubsub';
 *
 * const dispatcher = createPubSubDispatcher({ dedupeStore: new InMemoryDedupeStore() })
 *   .on('member.joined', async (event) => { ... })   // event.data fully typed
 *   .on('license.*', async (event) => { ... });
 *
 * new PubSub().subscription('my-sub').on('message', async (message) => {
 *   try {
 *     await dispatcher.dispatch(parsePubSubMessage(message));
 *     message.ack();
 *   } catch (err) {
 *     if (err instanceof PubSubParseError) return message.ack(); // poison
 *     message.nack(); // transient handler failure — redeliver
 *   }
 * });
 * ```
 */

export { PubSubParseError } from './errors';
export {
  parsePubSubMessage,
  type PubSubMessageInput,
  type PullMessageLike,
  type PushRequestBody,
} from './parse';
export {
  createPubSubDispatcher,
  type PubSubDispatcher,
  type PubSubDispatcherOptions,
  type PubSubEventHandler,
  type PubSubAnyHandler,
  type PubSubWildcard,
  type DispatchResult,
} from './dispatcher';
export {
  InMemoryDedupeStore,
  type DedupeStore,
  type InMemoryDedupeStoreOptions,
} from './dedupe';
export {
  createPubSubPushHandler,
  type PushHandlerResult,
  type PushHandlerOptions,
} from './push-handler';

// Re-export the shared wire-format types so subscribers rarely need a
// direct @authvital/shared import.
export type {
  AuthVitalPubSubEvent,
  PubSubEventType,
  PubSubMessageEnvelope,
  PubSubMessageAttributes,
  SyncEventEnvelope,
  SystemEventEnvelope,
  SystemEventType,
  SystemEvent,
  SystemEventDataOf,
  SyncEventDataOf,
} from '@authvital/shared';
export {
  isSyncEventEnvelope,
  isSystemEventEnvelope,
  SYSTEM_EVENT_TYPES,
} from '@authvital/shared';
