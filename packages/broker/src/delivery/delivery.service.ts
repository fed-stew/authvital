import { Injectable } from '@nestjs/common';
import { BrokerEventMessage } from '../transport/event-source.interface';
import { DeliveryOutcome, DeliveryService } from './delivery.interface';
import { SyncEventDeliverer } from './sync-event.deliverer';
import { SystemWebhookDeliverer } from './system-webhook.deliverer';

/**
 * BrokerDeliveryService — the real delivery engine behind DELIVERY_SERVICE.
 * Pure router: eventSource decides which deliverer owns the message.
 */
@Injectable()
export class BrokerDeliveryService implements DeliveryService {
  constructor(
    private readonly syncEventDeliverer: SyncEventDeliverer,
    private readonly systemWebhookDeliverer: SystemWebhookDeliverer,
  ) {}

  async deliver(message: BrokerEventMessage): Promise<DeliveryOutcome> {
    switch (message.eventSource) {
      case 'sync_event':
        return this.syncEventDeliverer.deliver(message);
      case 'system_webhook':
        return this.systemWebhookDeliverer.deliver(message);
      default:
        return {
          outcome: 'failed',
          retryable: false,
          error: `Unknown eventSource "${message.eventSource as string}"`,
        };
    }
  }
}
