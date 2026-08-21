import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import {
  DELIVERY_SERVICE,
  DeliveryService,
} from './delivery/delivery.interface';
import {
  BrokerEventMessage,
  EventSource,
} from './transport/event-source.interface';
import { EVENT_SOURCE } from './transport/transport.module';

/**
 * BrokerService — glues the selected EventSource to the DeliveryService.
 *
 * The handler maps DeliveryOutcome onto transport acknowledgements:
 * delivered => ack, skipped => skip, failed => nack. Retry scheduling is
 * owned by the transports, which also auto-nack when the handler throws.
 */
@Injectable()
export class BrokerService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(BrokerService.name);

  /** True while the event source is consuming — surfaced by /health. */
  private consuming = false;

  constructor(
    @Inject(EVENT_SOURCE) private readonly eventSource: EventSource,
    @Inject(DELIVERY_SERVICE) private readonly delivery: DeliveryService,
  ) {}

  /** Health snapshot: transport liveness, not just process-up. */
  get status(): { consuming: boolean; transport: string } {
    return {
      consuming: this.consuming,
      transport: this.eventSource.constructor.name,
    };
  }

  async onApplicationBootstrap(): Promise<void> {
    // The broker cannot DETECT the core's WEBHOOK_DELIVERY_MODE (it is
    // core-side env config, never persisted), so remind loudly instead:
    // core in legacy mode + a running broker = double delivery of sync
    // events (core delivers immediately AND the broker consumes the same
    // outbox row).
    this.logger.warn(
      'Ensure the AuthVital core runs WEBHOOK_DELIVERY_MODE=broker — ' +
        'a core in (default) legacy mode alongside this broker will ' +
        'DOUBLE-DELIVER sync-event webhooks.',
    );

    await this.eventSource.start(async (message: BrokerEventMessage) => {
      const result = await this.delivery.deliver(message);
      switch (result.outcome) {
        case 'delivered':
          await message.ack();
          break;
        case 'skipped':
          await message.skip(result.reason);
          break;
        case 'failed':
          await message.nack(result.retryable, result.error);
          break;
      }
    });
    this.consuming = true;
    this.logger.log('Broker event consumption started');
  }

  async onApplicationShutdown(): Promise<void> {
    await this.eventSource.stop();
    this.consuming = false;
    this.logger.log('Broker event consumption stopped');
  }
}
