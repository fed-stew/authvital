import { Module } from '@nestjs/common';
import { CircuitBreakerService } from './circuit-breaker.service';
import { DELIVERY_SERVICE } from './delivery.interface';
import { BrokerDeliveryService } from './delivery.service';
import { KeyReaderService } from './key-reader.service';
import { SyncEventDeliverer } from './sync-event.deliverer';
import { SystemWebhookDeliverer } from './system-webhook.deliverer';
import { UrlGuardService } from './url-guard.service';

/**
 * DeliveryModule — the real webhook delivery engine.
 * Binds BrokerDeliveryService to the DELIVERY_SERVICE token.
 */
@Module({
  providers: [
    KeyReaderService,
    UrlGuardService,
    CircuitBreakerService,
    SyncEventDeliverer,
    SystemWebhookDeliverer,
    BrokerDeliveryService,
    { provide: DELIVERY_SERVICE, useExisting: BrokerDeliveryService },
  ],
  exports: [DELIVERY_SERVICE],
})
export class DeliveryModule {}
