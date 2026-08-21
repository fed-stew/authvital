import { OutboxPollingSource } from './outbox-polling.source';
import { PubSubSubscriptionSource } from './pubsub-subscription.source';
import { selectEventSource } from './transport.module';

describe('selectEventSource (transport factory)', () => {
  // The factory only routes between the two instances — stubs are plenty.
  const outbox = { kind: 'outbox' } as unknown as OutboxPollingSource;
  const pubsub = { kind: 'pubsub' } as unknown as PubSubSubscriptionSource;

  it('should default to the outbox source when BROKER_TRANSPORT is unset', () => {
    expect(selectEventSource(undefined, outbox, pubsub)).toBe(outbox);
  });

  it('should select the outbox source for "outbox"', () => {
    expect(selectEventSource('outbox', outbox, pubsub)).toBe(outbox);
  });

  it('should select the pubsub source for "pubsub"', () => {
    expect(selectEventSource('pubsub', outbox, pubsub)).toBe(pubsub);
  });

  it('should be case-insensitive', () => {
    expect(selectEventSource('PubSub', outbox, pubsub)).toBe(pubsub);
    expect(selectEventSource('OUTBOX', outbox, pubsub)).toBe(outbox);
  });

  it('should throw on unknown transports', () => {
    expect(() => selectEventSource('kafka', outbox, pubsub)).toThrow(
      'Unknown BROKER_TRANSPORT "kafka"',
    );
  });
});
