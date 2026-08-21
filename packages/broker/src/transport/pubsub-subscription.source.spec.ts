import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BrokerEventMessage } from './event-source.interface';
import { PubSubSubscriptionSource } from './pubsub-subscription.source';

describe('PubSubSubscriptionSource', () => {
  const validEnvelope = {
    id: 'evt-1',
    source: 'authvital',
    event_type: 'tenant.created',
    event_source: 'system_webhook',
    timestamp: '2025-01-01T00:00:00.000Z',
    tenant_id: 'tenant-123',
    application_id: null,
    data: { name: 'Test Tenant' },
  };

  const mockConfig = { get: jest.fn() };

  let source: PubSubSubscriptionSource;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    source = new PubSubSubscriptionSource(
      mockConfig as unknown as ConfigService,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const makeGcpMessage = (body: unknown, orderingKey = 'tenant-123') => ({
    id: 'gcp-msg-1',
    data: Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)),
    orderingKey,
    ack: jest.fn(),
    nack: jest.fn(),
  });

  // ===========================================================================
  // parseEnvelope()
  // ===========================================================================

  describe('parseEnvelope', () => {
    it('should parse a valid outbox-published envelope', () => {
      const envelope = PubSubSubscriptionSource.parseEnvelope(
        Buffer.from(JSON.stringify(validEnvelope)),
      );

      expect(envelope).toEqual(validEnvelope);
    });

    it('should default missing nullable fields to null / empty data', () => {
      const minimal = {
        id: 'evt-2',
        source: 'authvital',
        event_type: 'user.deleted',
        event_source: 'sync_event',
        timestamp: '2025-01-01T00:00:00.000Z',
      };

      const envelope = PubSubSubscriptionSource.parseEnvelope(
        Buffer.from(JSON.stringify(minimal)),
      );

      expect(envelope.tenant_id).toBeNull();
      expect(envelope.application_id).toBeNull();
      expect(envelope.data).toEqual({});
    });

    it('should throw on malformed JSON', () => {
      expect(() =>
        PubSubSubscriptionSource.parseEnvelope(Buffer.from('not-json{')),
      ).toThrow();
    });

    it('should throw when required fields are missing', () => {
      expect(() =>
        PubSubSubscriptionSource.parseEnvelope(
          Buffer.from(JSON.stringify({ hello: 'world' })),
        ),
      ).toThrow('missing required');
    });

    it('should throw on unknown event_source', () => {
      expect(() =>
        PubSubSubscriptionSource.parseEnvelope(
          Buffer.from(
            JSON.stringify({ ...validEnvelope, event_source: 'carrier_pigeon' }),
          ),
        ),
      ).toThrow('Unknown event_source');
    });
  });

  // ===========================================================================
  // handleMessage()
  // ===========================================================================

  describe('handleMessage', () => {
    it('should map the envelope to a BrokerEventMessage', async () => {
      const gcpMessage = makeGcpMessage(validEnvelope);
      const handler = jest.fn(async (msg: BrokerEventMessage) => msg.ack());

      await source.handleMessage(gcpMessage as any, handler);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0]).toMatchObject({
        id: 'evt-1',
        eventType: 'tenant.created',
        eventSource: 'system_webhook',
        tenantId: 'tenant-123',
        applicationId: null,
        payload: { name: 'Test Tenant' },
        orderingKey: 'tenant-123',
      });
      expect(gcpMessage.ack).toHaveBeenCalledTimes(1);
      expect(gcpMessage.nack).not.toHaveBeenCalled();
    });

    it('should fall back to tenant_id as orderingKey when message has none', async () => {
      const gcpMessage = makeGcpMessage(validEnvelope, '');
      const handler = jest.fn(async (msg: BrokerEventMessage) => msg.ack());

      await source.handleMessage(gcpMessage as any, handler);

      expect(handler.mock.calls[0][0].orderingKey).toBe('tenant-123');
    });

    it('should nack the GCP message when the broker message is nacked (retryable)', async () => {
      const gcpMessage = makeGcpMessage(validEnvelope);
      const handler = jest.fn(async (msg: BrokerEventMessage) => msg.nack(true));

      await source.handleMessage(gcpMessage as any, handler);

      expect(gcpMessage.nack).toHaveBeenCalledTimes(1);
      expect(gcpMessage.ack).not.toHaveBeenCalled();
    });

    it('should ack on skip (nothing to deliver = consumed)', async () => {
      const gcpMessage = makeGcpMessage(validEnvelope);
      const handler = jest.fn(async (msg: BrokerEventMessage) =>
        msg.skip('no subscribers'),
      );

      await source.handleMessage(gcpMessage as any, handler);

      expect(gcpMessage.ack).toHaveBeenCalledTimes(1);
      expect(gcpMessage.nack).not.toHaveBeenCalled();
    });

    it('should ack (not loop forever) on non-retryable nack', async () => {
      const gcpMessage = makeGcpMessage(validEnvelope);
      const handler = jest.fn(async (msg: BrokerEventMessage) => msg.nack(false));

      await source.handleMessage(gcpMessage as any, handler);

      expect(gcpMessage.ack).toHaveBeenCalledTimes(1);
      expect(gcpMessage.nack).not.toHaveBeenCalled();
    });

    it('should auto-nack when the handler throws', async () => {
      const gcpMessage = makeGcpMessage(validEnvelope);
      const handler = jest.fn(async () => {
        throw new Error('boom');
      });

      await source.handleMessage(gcpMessage as any, handler);

      expect(gcpMessage.nack).toHaveBeenCalledTimes(1);
    });

    it('should ack and drop poison (unparseable) messages without calling the handler', async () => {
      const gcpMessage = makeGcpMessage('this is not json');
      const handler = jest.fn();

      await source.handleMessage(gcpMessage as any, handler);

      expect(handler).not.toHaveBeenCalled();
      expect(gcpMessage.ack).toHaveBeenCalledTimes(1);
      expect(gcpMessage.nack).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // start() configuration validation
  // ===========================================================================

  describe('start', () => {
    it('should fail fast when BROKER_PUBSUB_SUBSCRIPTION is missing', async () => {
      mockConfig.get.mockReturnValue(undefined);

      await expect(source.start(jest.fn())).rejects.toThrow(
        'BROKER_PUBSUB_SUBSCRIPTION',
      );
    });

    it('should fail fast when no GCP connectivity is configured', async () => {
      mockConfig.get.mockImplementation((key: string) =>
        key === 'BROKER_PUBSUB_SUBSCRIPTION' ? 'my-sub' : undefined,
      );

      await expect(source.start(jest.fn())).rejects.toThrow(
        'PUBSUB_PROJECT_ID or PUBSUB_EMULATOR_HOST',
      );
    });
  });
});
