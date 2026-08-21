import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventSource } from './event-source.interface';
import { OutboxPollingSource } from './outbox-polling.source';
import { PubSubSubscriptionSource } from './pubsub-subscription.source';

/** Injection token for the active EventSource implementation. */
export const EVENT_SOURCE = 'EVENT_SOURCE';

/**
 * Pick the transport based on BROKER_TRANSPORT.
 * Exported standalone so the selection logic is unit-testable without
 * spinning up a Nest testing module.
 */
export function selectEventSource(
  transport: string | undefined,
  outbox: OutboxPollingSource,
  pubsub: PubSubSubscriptionSource,
): EventSource {
  switch ((transport ?? 'outbox').toLowerCase()) {
    case 'outbox':
      return outbox;
    case 'pubsub':
      return pubsub;
    default:
      throw new Error(
        `Unknown BROKER_TRANSPORT "${transport}" — expected "outbox" or "pubsub"`,
      );
  }
}

/**
 * TransportModule — provides the single active EventSource behind the
 * EVENT_SOURCE token. Both implementations are constructed (they're cheap
 * until start() is called); only the selected one is ever started.
 */
@Module({
  providers: [
    OutboxPollingSource,
    PubSubSubscriptionSource,
    {
      provide: EVENT_SOURCE,
      useFactory: (
        configService: ConfigService,
        outbox: OutboxPollingSource,
        pubsub: PubSubSubscriptionSource,
      ): EventSource =>
        selectEventSource(
          configService.get<string>('BROKER_TRANSPORT'),
          outbox,
          pubsub,
        ),
      inject: [ConfigService, OutboxPollingSource, PubSubSubscriptionSource],
    },
  ],
  exports: [EVENT_SOURCE],
})
export class TransportModule {}
