/**
 * @authvital/server/pubsub - Push Endpoint Helper
 *
 * Framework-agnostic core for Pub/Sub PUSH subscriptions: a pure function
 * from (request body) to an HTTP status verdict. Wire it into Express,
 * Nest, Fastify, or a bare http server in two lines — no framework
 * bindings shipped on purpose.
 */

import type { DispatchResult, PubSubDispatcher } from './dispatcher';
import { PubSubParseError } from './errors';
import { parsePubSubMessage } from './parse';

export interface PushHandlerResult {
  /** HTTP status to respond with (see retry-semantics notes below). */
  status: 204 | 400 | 500;
  /** Machine-readable outcome for logging/metrics. */
  outcome: DispatchResult | 'parse_error' | 'handler_error';
  /** Error detail when outcome is an error. */
  error?: string;
}

export interface PushHandlerOptions {
  /** Called on handler errors before the 500 is returned (logging hook). */
  onError?: (error: unknown) => void;
}

/**
 * Wrap a dispatcher as a push-endpoint handler.
 *
 * STATUS MAPPING vs Pub/Sub push retry semantics — Pub/Sub treats ONLY
 * 102/200/201/202/204 as ack; every other status triggers redelivery
 * (with backoff, until the subscription's dead-letter policy kicks in):
 *
 *  - handled / duplicate / unhandled -> **204** (ack — done with this message)
 *  - parse error -> **400**: the bytes are malformed; redelivery can NEVER
 *    succeed, so 400 signals a permanent failure. Because Pub/Sub still
 *    retries non-2xx, PAIR PUSH SUBSCRIPTIONS WITH A DEAD-LETTER TOPIC so
 *    poison messages park in the DLQ after maxDeliveryAttempts instead of
 *    retrying forever (this is how "non-retryable" manifests in Pub/Sub —
 *    there is no per-message reject).
 *  - handler throw -> **500**: transient by assumption; Pub/Sub redelivers
 *    and the (un-recorded) dedupe id lets the retry run the handlers again.
 *
 * @example Express
 * ```typescript
 * const handlePush = createPubSubPushHandler(dispatcher);
 * app.post('/pubsub/push', express.json(), async (req, res) => {
 *   const { status, error } = await handlePush(req.body);
 *   res.status(status).send(error ? { error } : undefined);
 * });
 * ```
 */
export function createPubSubPushHandler(
  dispatcher: PubSubDispatcher,
  options: PushHandlerOptions = {},
): (body: unknown) => Promise<PushHandlerResult> {
  return async (body: unknown): Promise<PushHandlerResult> => {
    let envelope;
    try {
      envelope = parsePubSubMessage(body);
    } catch (error) {
      if (error instanceof PubSubParseError) {
        return { status: 400, outcome: 'parse_error', error: error.message };
      }
      throw error; // programmer error — let it crash loudly
    }

    try {
      const outcome = await dispatcher.dispatch(envelope);
      return { status: 204, outcome };
    } catch (error: any) {
      options.onError?.(error);
      return {
        status: 500,
        outcome: 'handler_error',
        error: error?.message ?? String(error),
      };
    }
  };
}
