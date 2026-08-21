/**
 * @authvital/server/pubsub - Typed Event Dispatcher
 *
 * Register handlers per event type (fully narrowed payloads), per category
 * wildcard, or as a catch-all — then feed parsed envelopes to dispatch().
 */

import type { AuthVitalPubSubEvent, PubSubEventType } from '@authvital/shared';
import type { DedupeStore } from './dedupe';

/** Handler for one specific event type — `event.data` is fully narrowed. */
export type PubSubEventHandler<T extends PubSubEventType> = (
  event: Extract<AuthVitalPubSubEvent, { event_type: T }>,
) => void | Promise<void>;

/** Handler receiving any event (wildcard / onAny registrations). */
export type PubSubAnyHandler = (
  event: AuthVitalPubSubEvent,
) => void | Promise<void>;

/**
 * Category wildcard matching the platform's publisher-filter semantics:
 * `'member.*'` matches everything whose type up to the LAST dot is
 * `member` (so `'tenant.app.*'` — not `'tenant.*'` — matches
 * `'tenant.app.granted'`). `'*'` matches everything.
 */
export type PubSubWildcard = `${string}.*` | '*';

export type DispatchResult = 'handled' | 'unhandled' | 'duplicate';

export interface PubSubDispatcherOptions {
  /**
   * Duplicate tracking keyed on `envelope.id`. When provided, dispatch()
   * skips ids the store has seen and records ids AFTER all handlers
   * succeed (so a thrown handler leaves the event un-recorded and a
   * redelivery gets another chance).
   *
   * Use {@link InMemoryDedupeStore} for single-process consumers; implement
   * {@link DedupeStore} over Redis/DB for anything scaled out.
   */
  dedupeStore?: DedupeStore;
}

export interface PubSubDispatcher {
  /** Register a handler for one event type (typed payload). */
  on<T extends PubSubEventType>(eventType: T, handler: PubSubEventHandler<T>): PubSubDispatcher;
  /** Register a handler for a category wildcard ('member.*') or '*'. */
  on(pattern: PubSubWildcard, handler: PubSubAnyHandler): PubSubDispatcher;
  /** Register a fallback invoked when NO other registration matched. */
  onAny(handler: PubSubAnyHandler): PubSubDispatcher;
  /**
   * Route an envelope to all matching handlers (exact + wildcard), awaited
   * sequentially in registration order. Handler errors PROPAGATE — the
   * caller decides ack/nack semantics.
   */
  dispatch(envelope: AuthVitalPubSubEvent): Promise<DispatchResult>;
}

/**
 * Create a typed event dispatcher.
 *
 * @example
 * ```typescript
 * import { createPubSubDispatcher, InMemoryDedupeStore } from '@authvital/server/pubsub';
 *
 * const dispatcher = createPubSubDispatcher({ dedupeStore: new InMemoryDedupeStore() })
 *   .on('member.joined', async (event) => {
 *     await db.members.upsert(event.data.membership_id, event.data.tenant_roles);
 *   })
 *   .on('license.*', async (event) => {
 *     await refreshEntitlements(event.tenant_id);
 *   })
 *   .onAny((event) => console.log('unhandled event', event.event_type));
 * ```
 */
export function createPubSubDispatcher(
  options: PubSubDispatcherOptions = {},
): PubSubDispatcher {
  // Registration order matters within a bucket; exact and wildcard buckets
  // are matched independently, then run in registration order overall.
  const registrations: Array<{
    pattern: string;
    handler: PubSubAnyHandler;
  }> = [];
  const fallbacks: PubSubAnyHandler[] = [];

  function matches(pattern: string, eventType: string): boolean {
    if (pattern === '*') return true;
    if (pattern === eventType) return true;
    if (pattern.endsWith('.*')) {
      // Same rule as the platform's publisher filter: compare against the
      // prefix up to the event type's LAST dot.
      const lastDot = eventType.lastIndexOf('.');
      return lastDot > 0 && eventType.substring(0, lastDot) === pattern.slice(0, -2);
    }
    return false;
  }

  const dispatcher: PubSubDispatcher = {
    on(pattern: string, handler: PubSubAnyHandler): PubSubDispatcher {
      registrations.push({ pattern, handler });
      return dispatcher;
    },

    onAny(handler: PubSubAnyHandler): PubSubDispatcher {
      fallbacks.push(handler);
      return dispatcher;
    },

    async dispatch(envelope: AuthVitalPubSubEvent): Promise<DispatchResult> {
      if (options.dedupeStore && (await options.dedupeStore.has(envelope.id))) {
        return 'duplicate';
      }

      const matched = registrations.filter((r) => matches(r.pattern, envelope.event_type));

      if (matched.length === 0) {
        for (const fallback of fallbacks) {
          await fallback(envelope);
        }
        // Record even unhandled events — the id WAS processed to a
        // terminal outcome; redelivering it would change nothing.
        await options.dedupeStore?.add(envelope.id);
        return fallbacks.length > 0 ? 'handled' : 'unhandled';
      }

      for (const { handler } of matched) {
        // Sequential on purpose: deterministic ordering, and a throw stops
        // the chain WITHOUT recording the id (redelivery retries all).
        await handler(envelope);
      }

      await options.dedupeStore?.add(envelope.id);
      return 'handled';
    },
  } as PubSubDispatcher;

  return dispatcher;
}
