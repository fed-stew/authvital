const mockPublishMessage = jest.fn().mockResolvedValue('test-message-id');
const mockTopicInstance = {
  publishMessage: mockPublishMessage,
  enableMessageOrdering: false,
};
const mockGet = jest.fn().mockResolvedValue([mockTopicInstance]);
const mockTopic = jest.fn().mockReturnValue({ get: mockGet });
const mockClose = jest.fn().mockResolvedValue(undefined);

jest.mock('@google-cloud/pubsub', () => {
  const MockPubSub = jest.fn().mockImplementation(() => ({
    topic: mockTopic,
    close: mockClose,
  }));
  return { PubSub: MockPubSub };
});

import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PubSubPublisherService } from './pubsub-publisher.service';
import { PubSubConfigService } from './pubsub-config.service';

describe('PubSubPublisherService', () => {
  /**
   * ConfigService now only provides GCP infrastructure env vars:
   * PUBSUB_PROJECT_ID and PUBSUB_EMULATOR_HOST.
   */
  const makeConfigService = (
    overrides: Record<string, string> = {},
  ): ConfigService => {
    const config: Record<string, string> = {
      PUBSUB_PROJECT_ID: 'test-project',
      PUBSUB_EMULATOR_HOST: '',
      ...overrides,
    };
    return {
      get: jest.fn((key: string) => config[key]),
    } as unknown as ConfigService;
  };

  /**
   * PubSubConfigService provides DB-backed application config:
   * topic, orderingEnabled, enabled, and events.
   */
  const makePubSubConfigService = (
    overrides: Partial<{
      topic: string;
      orderingEnabled: boolean;
      enabled: boolean;
      events: string[];
    }> = {},
  ): PubSubConfigService => {
    const config = {
      topic: 'test-topic',
      orderingEnabled: true,
      enabled: true,
      events: [],
      ...overrides,
    };
    return {
      getConfig: jest.fn().mockResolvedValue(config),
      onModuleInit: jest.fn(),
    } as unknown as PubSubConfigService;
  };

  let service: PubSubPublisherService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockTopicInstance.enableMessageOrdering = false;
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    service = new PubSubPublisherService(
      makeConfigService(),
      makePubSubConfigService(),
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ===========================================================================
  // isEnabled()
  // ===========================================================================

  describe('isEnabled', () => {
    it('should return true after successful initialization', async () => {
      await service.onModuleInit();

      expect(service.isEnabled()).toBe(true);
    });

    it('should return false before initialization (topic is null)', () => {
      expect(service.isEnabled()).toBe(false);
    });
  });

  // ===========================================================================
  // publish() when not initialized
  // ===========================================================================

  describe('publish (not initialized)', () => {
    it('should return null when not initialized (no GCP config)', async () => {
      const noGcp = new PubSubPublisherService(
        makeConfigService({
          PUBSUB_PROJECT_ID: '',
          PUBSUB_EMULATOR_HOST: '',
        }),
        makePubSubConfigService(),
      );

      const result = await noGcp.publish({
        data: { foo: 'bar' },
        attributes: { event_type: 'test' },
      });

      expect(result).toBeNull();
      expect(mockPublishMessage).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // onModuleInit()
  // ===========================================================================

  describe('onModuleInit', () => {
    it('should initialize topic on module init', async () => {
      await service.onModuleInit();

      expect(mockTopic).toHaveBeenCalledWith('test-topic');
      expect(mockGet).toHaveBeenCalledWith({ autoCreate: true });
    });

    it('should skip initialization when no GCP config is available', async () => {
      const noGcp = new PubSubPublisherService(
        makeConfigService({
          PUBSUB_PROJECT_ID: '',
          PUBSUB_EMULATOR_HOST: '',
        }),
        makePubSubConfigService(),
      );

      await noGcp.onModuleInit();

      expect(mockTopic).not.toHaveBeenCalled();
    });

    it('should enable message ordering when configured', async () => {
      const ordered = new PubSubPublisherService(
        makeConfigService(),
        makePubSubConfigService({ orderingEnabled: true }),
      );

      await ordered.onModuleInit();

      expect(mockTopicInstance.enableMessageOrdering).toBe(true);
    });

    it('should not enable message ordering when not configured', async () => {
      const unordered = new PubSubPublisherService(
        makeConfigService(),
        makePubSubConfigService({ orderingEnabled: false }),
      );

      await unordered.onModuleInit();

      expect(mockTopicInstance.enableMessageOrdering).toBe(false);
    });
  });

  // ===========================================================================
  // publish() after init
  // ===========================================================================

  describe('publish', () => {
    it('should publish message and return message ID', async () => {
      await service.onModuleInit();

      const data = { event: 'tenant.created', tenantId: 't-1' };
      const attributes = { event_type: 'tenant.created', source: 'authvital' };

      const messageId = await service.publish({
        data,
        attributes,
        orderingKey: 't-1',
      });

      expect(messageId).toBe('test-message-id');
      expect(mockPublishMessage).toHaveBeenCalledWith({
        data: Buffer.from(JSON.stringify(data)),
        attributes,
        orderingKey: 't-1',
      });
    });

    it('should return null when topic is not initialized', async () => {
      // publish without calling onModuleInit
      const result = await service.publish({ data: { foo: 'bar' } });

      expect(result).toBeNull();
    });
  });

  // ===========================================================================
  // onModuleDestroy()
  // ===========================================================================

  describe('onModuleDestroy', () => {
    it('should close client on module destroy', async () => {
      await service.onModuleInit();
      await service.onModuleDestroy();

      expect(mockClose).toHaveBeenCalled();
    });

    it('should not throw when client was never initialized', async () => {
      const noGcp = new PubSubPublisherService(
        makeConfigService({
          PUBSUB_PROJECT_ID: '',
          PUBSUB_EMULATOR_HOST: '',
        }),
        makePubSubConfigService(),
      );

      await expect(noGcp.onModuleDestroy()).resolves.not.toThrow();
    });
  });
});
