import { Injectable, Logger } from '@nestjs/common';
import { BrokerEventMessage } from '../transport/event-source.interface';

/** Injection token for the delivery engine. */
export const DELIVERY_SERVICE = 'DELIVERY_SERVICE';

/**
 * Result of one delivery pass for a broker event.
 *
 * BrokerService maps outcomes onto transport acknowledgements:
 *  - delivered => ack()
 *  - skipped   => skip(reason)
 *  - failed    => nack(retryable, error)
 *
 * Keeping the engine outcome-based (instead of letting it ack/nack directly)
 * means message settlement lives in exactly one place and the engine stays
 * trivially unit-testable.
 */
export type DeliveryOutcome =
  | { outcome: 'delivered' }
  | { outcome: 'skipped'; reason?: string }
  | { outcome: 'failed'; retryable: boolean; error?: string };

/** Contract the delivery engine must fulfil. */
export interface DeliveryService {
  /**
   * Deliver one event to all interested consumers.
   * Throwing is treated as a retryable failure by the transports.
   */
  deliver(message: BrokerEventMessage): Promise<DeliveryOutcome>;
}

/**
 * Test/dev stub: logs the event and reports success. The real engine is
 * BrokerDeliveryService (delivery.module.ts binds it to DELIVERY_SERVICE).
 */
@Injectable()
export class LogOnlyDeliveryService implements DeliveryService {
  private readonly logger = new Logger(LogOnlyDeliveryService.name);

  async deliver(message: BrokerEventMessage): Promise<DeliveryOutcome> {
    this.logger.log(
      `[stub] Would deliver event ${message.id} ` +
        `(type=${message.eventType}, source=${message.eventSource}, ` +
        `tenant=${message.tenantId ?? '-'})`,
    );
    return { outcome: 'delivered' };
  }
}
