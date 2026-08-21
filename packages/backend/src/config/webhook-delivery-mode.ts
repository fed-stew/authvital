import { ConfigService } from '@nestjs/config';

/**
 * Who owns webhook delivery for this deployment.
 *
 *  - 'legacy' (DEFAULT): the core delivers webhooks in-process, exactly as it
 *    always has. Single-container self-hosters need no changes.
 *  - 'broker': the core only WRITES events (syncEvent rows + transactional
 *    outbox); the separate authvital-broker service (packages/broker) owns
 *    all webhook delivery, retries and failure tracking via the outbox
 *    delivery_* lifecycle.
 */
export type WebhookDeliveryMode = 'legacy' | 'broker';

/**
 * Resolve WEBHOOK_DELIVERY_MODE from the environment.
 * Anything other than the exact string 'broker' resolves to 'legacy' —
 * misconfiguration must never silently disable delivery in BOTH places.
 */
export function resolveWebhookDeliveryMode(
  configService: ConfigService,
): WebhookDeliveryMode {
  return configService.get<string>('WEBHOOK_DELIVERY_MODE') === 'broker'
    ? 'broker'
    : 'legacy';
}
