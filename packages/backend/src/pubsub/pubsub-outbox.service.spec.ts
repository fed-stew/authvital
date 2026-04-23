import { Logger } from '@nestjs/common';
import { PubSubOutboxService } from './pubsub-outbox.service';
import { PubSubPublisherService } from './pubsub-publisher.service';
import { PubSubConfigService } from './pubsub-config.service';
import { PrismaService } from '../prisma/prisma.service';

describe('PubSubOutboxService', () => {
  const mockPrisma = {
    pubSubOutboxEvent: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    $queryRaw: jest.fn(),
  };

  const mockPublisher = {
    publish: jest.fn(),
    isEnabled: jest.fn(),
  };

  const mockPubSubConfig = {
    isEventEnabled: jest.fn(),
    getConfig: jest.fn(),
  };

  let service: PubSubOutboxService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    // Reset mock implementations to defaults for each test
    mockPubSubConfig.isEventEnabled.mockReturnValue(true);
    mockPubSubConfig.getConfig.mockResolvedValue({
      enabled: true,
      topic: 'authvital-events',
      orderingEnabled: true,
      events: ['tenant.created'],
    });

    service = new PubSubOutboxService(
      mockPrisma as unknown as PrismaService,
      mockPublisher as unknown as PubSubPublisherService,
      mockPubSubConfig as unknown as PubSubConfigService,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ===========================================================================
  // enqueue()
  // ===========================================================================

  describe('enqueue', () => {
    const enqueueParams = {
      eventType: 'tenant.created',
      eventSource: 'system_webhook' as const,
      aggregateId: 'tenant-123',
      tenantId: 'tenant-123',
      payload: { data: { name: 'Test Tenant' } },
      orderingKey: 'tenant-123',
    };

    it('should write a PENDING record when event is enabled', async () => {
      mockPrisma.pubSubOutboxEvent.create.mockResolvedValue({});

      await service.enqueue(enqueueParams);

      expect(mockPubSubConfig.isEventEnabled).toHaveBeenCalledWith(
        'tenant.created',
      );
      expect(mockPrisma.pubSubOutboxEvent.create).toHaveBeenCalledWith({
        data: {
          eventType: 'tenant.created',
          eventSource: 'system_webhook',
          aggregateId: 'tenant-123',
          tenantId: 'tenant-123',
          applicationId: undefined,
          payload: { data: { name: 'Test Tenant' } },
          topic: 'authvital-events',
          orderingKey: 'tenant-123',
          status: 'PENDING',
        },
      });
    });

    it('should write a SKIPPED record when event is not enabled', async () => {
      mockPubSubConfig.isEventEnabled.mockReturnValue(false);
      mockPrisma.pubSubOutboxEvent.create.mockResolvedValue({});

      await service.enqueue(enqueueParams);

      expect(mockPubSubConfig.isEventEnabled).toHaveBeenCalledWith(
        'tenant.created',
      );
      expect(mockPrisma.pubSubOutboxEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ status: 'SKIPPED' }),
      });
    });
  });

  // ===========================================================================
  // enqueueWithTransaction()
  // ===========================================================================

  describe('enqueueWithTransaction', () => {
    it('should use the transaction client instead of default prisma', async () => {
      const mockTx = {
        pubSubOutboxEvent: { create: jest.fn().mockResolvedValue({}) },
      };

      await service.enqueueWithTransaction(mockTx, {
        eventType: 'member.joined',
        eventSource: 'system_webhook',
        aggregateId: 'member-1',
        tenantId: 'tenant-1',
        payload: { data: { userId: 'u1' } },
      });

      expect(mockTx.pubSubOutboxEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          eventType: 'member.joined',
          status: 'PENDING',
        }),
      });
      expect(mockPrisma.pubSubOutboxEvent.create).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // processOutbox()
  // ===========================================================================

  describe('processOutbox', () => {
    it('should publish pending events and mark them as PUBLISHED', async () => {
      const pendingEvent = {
        id: 'evt-1',
        eventType: 'tenant.created',
        eventSource: 'system_webhook',
        createdAt: new Date('2024-01-01T00:00:00Z'),
        tenantId: 'tenant-1',
        applicationId: null,
        payload: { data: { name: 'Tenant' } },
        orderingKey: 'tenant-1',
        attempts: 0,
        lastAttemptAt: null,
      };

      mockPrisma.pubSubOutboxEvent.findMany.mockResolvedValue([pendingEvent]);
      mockPublisher.publish.mockResolvedValue('msg-id-123');
      mockPrisma.pubSubOutboxEvent.update.mockResolvedValue({});

      await service.processOutbox();

      expect(mockPublisher.publish).toHaveBeenCalledWith({
        data: expect.objectContaining({
          id: 'evt-1',
          source: 'authvital',
          event_type: 'tenant.created',
          event_source: 'system_webhook',
          tenant_id: 'tenant-1',
          application_id: null,
          data: { name: 'Tenant' },
        }),
        attributes: {
          event_type: 'tenant.created',
          event_source: 'system_webhook',
          tenant_id: 'tenant-1',
          source: 'authvital',
        },
        orderingKey: 'tenant-1',
      });

      expect(mockPrisma.pubSubOutboxEvent.update).toHaveBeenCalledWith({
        where: { id: 'evt-1' },
        data: {
          status: 'PUBLISHED',
          publishedAt: expect.any(Date),
          messageId: 'msg-id-123',
          attempts: { increment: 1 },
        },
      });
    });

    it('should mark events as FAILED after max retries', async () => {
      const exhaustedEvent = {
        id: 'evt-2',
        eventType: 'tenant.deleted',
        eventSource: 'system_webhook',
        createdAt: new Date('2024-01-01T00:00:00Z'),
        tenantId: 'tenant-2',
        applicationId: null,
        payload: { data: {} },
        orderingKey: null,
        attempts: 9,
        lastAttemptAt: new Date('2020-01-01T00:00:00Z'),
      };

      mockPrisma.pubSubOutboxEvent.findMany.mockResolvedValue([
        exhaustedEvent,
      ]);
      mockPublisher.publish.mockRejectedValue(
        new Error('Pub/Sub unavailable'),
      );
      mockPrisma.pubSubOutboxEvent.update.mockResolvedValue({});

      await service.processOutbox();

      expect(mockPrisma.pubSubOutboxEvent.update).toHaveBeenCalledWith({
        where: { id: 'evt-2' },
        data: {
          status: 'FAILED',
          attempts: 10,
          lastAttemptAt: expect.any(Date),
          lastError: 'Pub/Sub unavailable',
        },
      });
    });

    it('should skip events not ready for retry', async () => {
      const recentlyFailedEvent = {
        id: 'evt-3',
        eventType: 'tenant.updated',
        eventSource: 'system_webhook',
        createdAt: new Date('2024-01-01T00:00:00Z'),
        tenantId: 'tenant-3',
        applicationId: null,
        payload: { data: {} },
        orderingKey: null,
        attempts: 1,
        lastAttemptAt: new Date(), // just now — not ready for retry
      };

      mockPrisma.pubSubOutboxEvent.findMany.mockResolvedValue([
        recentlyFailedEvent,
      ]);

      await service.processOutbox();

      expect(mockPublisher.publish).not.toHaveBeenCalled();
      expect(mockPrisma.pubSubOutboxEvent.update).not.toHaveBeenCalled();
    });

    it('should return immediately when Pub/Sub is disabled', async () => {
      mockPubSubConfig.getConfig.mockResolvedValue({
        enabled: false,
        topic: 'authvital-events',
        orderingEnabled: true,
        events: ['tenant.created'],
      });

      await service.processOutbox();

      expect(mockPrisma.pubSubOutboxEvent.findMany).not.toHaveBeenCalled();
      expect(mockPublisher.publish).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // cleanupPublishedEvents()
  // ===========================================================================

  describe('cleanupPublishedEvents', () => {
    it('should delete old PUBLISHED events', async () => {
      mockPrisma.pubSubOutboxEvent.deleteMany.mockResolvedValue({ count: 5 });

      await service.cleanupPublishedEvents();

      expect(mockPrisma.pubSubOutboxEvent.deleteMany).toHaveBeenCalledWith({
        where: {
          status: 'PUBLISHED',
          createdAt: { lt: expect.any(Date) },
        },
      });

      // Verify the cutoff date is approximately 7 days ago
      const callArgs =
        mockPrisma.pubSubOutboxEvent.deleteMany.mock.calls[0][0];
      const cutoff = callArgs.where.createdAt.lt as Date;
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      expect(
        Math.abs(cutoff.getTime() - sevenDaysAgo.getTime()),
      ).toBeLessThan(5000);
    });
  });

  // ===========================================================================
  // getStats()
  // ===========================================================================

  describe('getStats', () => {
    it('should return event counts grouped by status', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        { status: 'PENDING', count: BigInt(5) },
        { status: 'PUBLISHED', count: BigInt(100) },
        { status: 'FAILED', count: BigInt(2) },
      ]);

      const stats = await service.getStats();

      expect(stats).toEqual({
        PENDING: 5,
        PUBLISHED: 100,
        FAILED: 2,
        SKIPPED: 0,
      });
    });

    it('should return all-zero counts when no events exist', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);

      const stats = await service.getStats();

      expect(stats).toEqual({
        PENDING: 0,
        PUBLISHED: 0,
        FAILED: 0,
        SKIPPED: 0,
      });
    });
  });

  // ===========================================================================
  // retryEvent()
  // ===========================================================================

  describe('retryEvent', () => {
    it('should reset a FAILED event to PENDING', async () => {
      mockPrisma.pubSubOutboxEvent.findUnique.mockResolvedValue({
        id: 'evt-1',
        status: 'FAILED',
      });
      mockPrisma.pubSubOutboxEvent.update.mockResolvedValue({});

      const result = await service.retryEvent('evt-1');

      expect(result).toEqual({
        success: true,
        message: 'Event reset to PENDING for retry',
      });
      expect(mockPrisma.pubSubOutboxEvent.update).toHaveBeenCalledWith({
        where: { id: 'evt-1' },
        data: {
          status: 'PENDING',
          attempts: 0,
          lastError: null,
          lastAttemptAt: null,
        },
      });
    });

    it('should return failure when event is not found', async () => {
      mockPrisma.pubSubOutboxEvent.findUnique.mockResolvedValue(null);

      const result = await service.retryEvent('non-existent');

      expect(result).toEqual({
        success: false,
        message: 'Event not found',
      });
      expect(mockPrisma.pubSubOutboxEvent.update).not.toHaveBeenCalled();
    });

    it('should return failure when event is not in FAILED status', async () => {
      mockPrisma.pubSubOutboxEvent.findUnique.mockResolvedValue({
        id: 'evt-1',
        status: 'PUBLISHED',
      });

      const result = await service.retryEvent('evt-1');

      expect(result).toEqual({
        success: false,
        message: 'Cannot retry event with status PUBLISHED',
      });
      expect(mockPrisma.pubSubOutboxEvent.update).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // retryAllFailed()
  // ===========================================================================

  describe('retryAllFailed', () => {
    it('should reset all FAILED events to PENDING', async () => {
      mockPrisma.pubSubOutboxEvent.updateMany.mockResolvedValue({ count: 3 });

      const result = await service.retryAllFailed();

      expect(result).toEqual({ success: true, count: 3 });
      expect(mockPrisma.pubSubOutboxEvent.updateMany).toHaveBeenCalledWith({
        where: { status: 'FAILED' },
        data: {
          status: 'PENDING',
          attempts: 0,
          lastError: null,
          lastAttemptAt: null,
        },
      });
    });

    it('should return zero count when no failed events exist', async () => {
      mockPrisma.pubSubOutboxEvent.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.retryAllFailed();

      expect(result).toEqual({ success: true, count: 0 });
    });
  });
});
