import { BrokerEventMessage } from '../transport/event-source.interface';
import { BrokerDeliveryService } from './delivery.service';
import { SyncEventDeliverer } from './sync-event.deliverer';
import { SystemWebhookDeliverer } from './system-webhook.deliverer';

describe('BrokerDeliveryService (routing)', () => {
  const syncDeliverer = { deliver: jest.fn() };
  const systemDeliverer = { deliver: jest.fn() };

  const baseMessage: Omit<BrokerEventMessage, 'eventSource'> = {
    id: 'evt-1',
    eventType: 'x.y',
    tenantId: null,
    applicationId: null,
    payload: {},
    orderingKey: null,
    ack: jest.fn(),
    skip: jest.fn(),
    nack: jest.fn(),
  };

  let service: BrokerDeliveryService;

  beforeEach(() => {
    jest.clearAllMocks();
    syncDeliverer.deliver.mockResolvedValue({ outcome: 'delivered' });
    systemDeliverer.deliver.mockResolvedValue({ outcome: 'delivered' });

    service = new BrokerDeliveryService(
      syncDeliverer as unknown as SyncEventDeliverer,
      systemDeliverer as unknown as SystemWebhookDeliverer,
    );
  });

  it('should route sync_event messages to the SyncEventDeliverer', async () => {
    const message = { ...baseMessage, eventSource: 'sync_event' } as BrokerEventMessage;

    await service.deliver(message);

    expect(syncDeliverer.deliver).toHaveBeenCalledWith(message);
    expect(systemDeliverer.deliver).not.toHaveBeenCalled();
  });

  it('should route system_webhook messages to the SystemWebhookDeliverer', async () => {
    const message = { ...baseMessage, eventSource: 'system_webhook' } as BrokerEventMessage;

    await service.deliver(message);

    expect(systemDeliverer.deliver).toHaveBeenCalledWith(message);
    expect(syncDeliverer.deliver).not.toHaveBeenCalled();
  });

  it('should fail non-retryably for unknown event sources', async () => {
    const message = {
      ...baseMessage,
      eventSource: 'carrier_pigeon',
    } as unknown as BrokerEventMessage;

    const result = await service.deliver(message);

    expect(result).toMatchObject({ outcome: 'failed', retryable: false });
  });
});
