/**
 * @authvital/server/pubsub - Error Classes
 *
 * Typed errors so subscribers can branch on failure modes instead of
 * string-matching messages (same conventions as ../errors.ts).
 */

/**
 * Thrown by {@link parsePubSubMessage} when the input is not a valid
 * AuthVital Pub/Sub message (unrecognized shape, invalid base64/JSON,
 * missing envelope fields, wrong `source`, ...).
 *
 * Parse errors are PERMANENT: redelivering the same bytes can never
 * succeed. Ack (pull) or use the push handler's 400 mapping paired with a
 * dead-letter topic — do not retry forever.
 *
 * @example
 * ```typescript
 * import { parsePubSubMessage, PubSubParseError } from '@authvital/server/pubsub';
 *
 * subscription.on('message', (message) => {
 *   try {
 *     const event = parsePubSubMessage(message);
 *     // ... handle
 *   } catch (err) {
 *     if (err instanceof PubSubParseError) {
 *       message.ack(); // poison message — drop it, don't loop
 *       return;
 *     }
 *     throw err;
 *   }
 * });
 * ```
 */
export class PubSubParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PubSubParseError';
    // Fix prototype chain for instanceof checks (matches core error style)
    Object.setPrototypeOf(this, PubSubParseError.prototype);
  }
}
