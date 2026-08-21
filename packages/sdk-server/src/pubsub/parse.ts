/**
 * @authvital/server/pubsub - Message Parsing
 *
 * Decodes GCP Pub/Sub deliveries into the typed AuthVital envelope without
 * depending on @google-cloud/pubsub (structural typing only — works with
 * pull Message objects, push HTTP bodies, or anything shaped like them).
 */

import type { AuthVitalPubSubEvent } from '@authvital/shared';
import { PubSubParseError } from './errors';

/**
 * Structural stand-in for @google-cloud/pubsub's `Message` — anything with
 * a `data` buffer/string (and optional attributes) qualifies, so no runtime
 * dependency on the client library is needed.
 */
export interface PullMessageLike {
  data: Uint8Array | Buffer | string;
  attributes?: Record<string, string>;
}

/**
 * The HTTP request body Pub/Sub POSTs to push endpoints:
 * `{ message: { data: <base64>, attributes, messageId }, subscription }`.
 */
export interface PushRequestBody {
  message: {
    data: string;
    attributes?: Record<string, string>;
    messageId?: string;
  };
  subscription?: string;
}

/** Either delivery shape accepted by {@link parsePubSubMessage}. */
export type PubSubMessageInput = PullMessageLike | PushRequestBody;

function isPushBody(input: Record<string, unknown>): input is PushRequestBody & Record<string, unknown> {
  const message = input.message;
  return (
    typeof message === 'object' &&
    message !== null &&
    typeof (message as Record<string, unknown>).data === 'string'
  );
}

function decodeToString(data: Uint8Array | Buffer | string, base64: boolean): string {
  if (typeof data === 'string') {
    return base64 ? Buffer.from(data, 'base64').toString('utf8') : data;
  }
  return Buffer.from(data).toString('utf8');
}

/**
 * Parse a Pub/Sub delivery into a typed AuthVital event envelope.
 *
 * Accepts BOTH delivery shapes:
 *  - **Pull** subscription `Message`-like objects (`{ data, attributes }`
 *    where `data` is a Buffer/Uint8Array/string of raw JSON).
 *  - **Push** endpoint HTTP bodies
 *    (`{ message: { data: <base64> } }` — data is base64-encoded JSON).
 *
 * Validates the envelope structure (id, source === 'authvital',
 * event_type, event_source, timestamp, data object) and throws a
 * {@link PubSubParseError} with a specific reason on anything malformed.
 *
 * The return type is the discriminated {@link AuthVitalPubSubEvent} union,
 * so `switch (event.event_type)` narrows `event.data`. Event types added
 * to the platform after your SDK version still parse fine at runtime —
 * handle them in a `default` branch.
 */
export function parsePubSubMessage(input: unknown): AuthVitalPubSubEvent {
  if (typeof input !== 'object' || input === null) {
    throw new PubSubParseError(
      `Expected a Pub/Sub message object, got ${input === null ? 'null' : typeof input}`,
    );
  }

  const record = input as Record<string, unknown>;

  let json: string;
  if (isPushBody(record)) {
    // Push HTTP body — data is base64-encoded JSON
    json = decodeToString(record.message.data, true);
  } else if (
    typeof record.data === 'string' ||
    record.data instanceof Uint8Array // Buffer extends Uint8Array
  ) {
    // Pull Message-like — data is raw JSON bytes/string
    json = decodeToString(record.data as Uint8Array | string, false);
  } else {
    throw new PubSubParseError(
      'Unrecognized input shape: expected { data: Buffer|string } (pull) ' +
        'or { message: { data: base64 } } (push body)',
    );
  }

  let envelope: Record<string, unknown>;
  try {
    envelope = JSON.parse(json);
  } catch {
    throw new PubSubParseError(
      `Message data is not valid JSON: ${json.substring(0, 120)}`,
    );
  }

  if (typeof envelope !== 'object' || envelope === null || Array.isArray(envelope)) {
    throw new PubSubParseError('Message JSON is not an object envelope');
  }

  // ---- envelope validation -------------------------------------------------
  if (envelope.source !== 'authvital') {
    throw new PubSubParseError(
      `Not an AuthVital message: source is ${JSON.stringify(envelope.source)}, expected "authvital"`,
    );
  }
  if (typeof envelope.id !== 'string' || envelope.id.length === 0) {
    throw new PubSubParseError('Envelope is missing a string "id"');
  }
  if (typeof envelope.event_type !== 'string' || envelope.event_type.length === 0) {
    throw new PubSubParseError('Envelope is missing a string "event_type"');
  }
  if (envelope.event_source !== 'sync_event' && envelope.event_source !== 'system_webhook') {
    throw new PubSubParseError(
      `Envelope "event_source" must be "sync_event" or "system_webhook", got ${JSON.stringify(envelope.event_source)}`,
    );
  }
  if (typeof envelope.timestamp !== 'string') {
    throw new PubSubParseError('Envelope is missing a string "timestamp"');
  }
  if (typeof envelope.data !== 'object' || envelope.data === null) {
    throw new PubSubParseError('Envelope is missing an object "data" payload');
  }

  return envelope as unknown as AuthVitalPubSubEvent;
}
