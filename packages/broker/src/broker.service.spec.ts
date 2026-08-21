import { Logger } from '@nestjs/common';
import { BrokerService } from './broker.service';
import { DeliveryService } from './delivery/delivery.interface';
import {
  BrokerEventHandler,
  BrokerEventMessage,
  EventSource,
} from './transport/event-source.interface';

describe('BrokerService (outcome mapping)', () => {
  let capturedHandler: BrokerEventHandler;

  const eventSource: EventSource = {
    start: jest.fn(async (handler) => {
      capturedHandler = handler;
    }),
    stop: jest.fn(),
  };

  const delivery: DeliveryService = { deliver: jest.fn() };

  const makeMessage = (): BrokerEventMessage => ({
    id: 'evt-1',
    eventType: 'user.created',
    eventSource: 'sync_event',
    tenantId: 't-1',
    applicationId: 'a-1',
    payload: {},
    orderingKey: null,
    ack: jest.fn(),
    skip: jest.fn(),
    nack: jest.fn(),
  });

  let service: BrokerService;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

    service = new BrokerService(eventSource, delivery);
    await service.onApplicationBootstrap();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should ack on delivered', async () => {
    (delivery.deliver as jest.Mock).mockResolvedValue({ outcome: 'delivered' });
    const message = makeMessage();

    await capturedHandler(message);

    expect(message.ack).toHaveBeenCalledTimes(1);
    expect(message.skip).not.toHaveBeenCalled();
    expect(message.nack).not.toHaveBeenCalled();
  });

  it('should skip with the reason on skipped', async () => {
    (delivery.deliver as jest.Mock).mockResolvedValue({
      outcome: 'skipped',
      reason: 'no subscribers',
    });
    const message = makeMessage();

    await capturedHandler(message);

    expect(message.skip).toHaveBeenCalledWith('no subscribers');
    expect(message.ack).not.toHaveBeenCalled();
  });

  it('should nack with retryability and error on failed', async () => {
    (delivery.deliver as jest.Mock).mockResolvedValue({
      outcome: 'failed',
      retryable: true,
      error: 'HTTP 500',
    });
    const message = makeMessage();

    await capturedHandler(message);

    expect(message.nack).toHaveBeenCalledWith(true, 'HTTP 500');
  });

  it('should stop the event source on shutdown', async () => {
    await service.onApplicationShutdown();

    expect(eventSource.stop).toHaveBeenCalledTimes(1);
  });
});
