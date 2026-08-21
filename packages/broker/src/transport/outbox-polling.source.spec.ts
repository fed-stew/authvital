import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { BrokerEventMessage } from './event-source.interface';
import { OutboxPollingSource } from './outbox-polling.source';

describe('OutboxPollingSource', () => {
  const claimedRow = {
    id: 'evt-1',
    eventType: 'tenant.created',
    eventSource: 'system_webhook',
    tenantId: 'tenant-123',
    applicationId: null,
    payload: { name: 'Test Tenant' },
    orderingKey: 'tenant-123',
    deliveryAttempts: 0,
  };

  const mockTx = {
    $queryRaw: jest.fn(),
    pubSubOutboxEvent: {
      update: jest.fn(),
    },
  };

  const mockPrisma = {
    // Interactive transaction: run the callback against mockTx.
    $transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(mockTx)),
  };

  const mockConfig = {
    get: jest.fn(),
  };

  let source: OutboxPollingSource;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    mockConfig.get.mockReturnValue(undefined);
    mockTx.$queryRaw.mockResolvedValue([]);
    mockTx.pubSubOutboxEvent.update.mockResolvedValue({});

    source = new OutboxPollingSource(
      mockPrisma as unknown as PrismaService,
      mockConfig as unknown as ConfigService,
    );
  });

  afterEach(async () => {
    await source.stop();
    jest.restoreAllMocks();
  });

  // ===========================================================================
  // Claiming
  // ===========================================================================

  describe('pollOnce (claim)', () => {
    it('should do nothing before start()', async () => {
      const claimed = await source.pollOnce();

      expect(claimed).toBe(0);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('should claim rows on the DELIVERY lifecycle with FOR UPDATE SKIP LOCKED', async () => {
      const handler = jest.fn(async (msg: BrokerEventMessage) => msg.ack());
      await startWithoutTimers(source, handler);
      mockTx.$queryRaw.mockResolvedValue([claimedRow]);

      const claimed = await source.pollOnce();

      expect(claimed).toBe(1);
      const sqlTemplate = (mockTx.$queryRaw.mock.calls[0][0] as string[]).join('?');
      expect(sqlTemplate).toContain('FOR UPDATE SKIP LOCKED');
      expect(sqlTemplate).toContain("delivery_status = 'PENDING'");
      // Lifecycle independence: the GCP publish status column is NOT part
      // of the claim predicate (SKIPPED/PUBLISHED rows still get webhooks).
      // Word-boundary regex: bare `status`, not `delivery_status`.
      expect(sqlTemplate).not.toMatch(/[^_a-z]status\s*=/);
    });

    it('should embed the full RETRY_DELAYS backoff ladder in the claim SQL', () => {
      const caseSql = OutboxPollingSource.buildBackoffCaseSql();

      // Same ladder as backend PubSubOutboxService: 10s ... 48h
      for (const delay of [10, 30, 60, 300, 900, 3600, 14400, 43200, 86400]) {
        expect(caseSql).toContain(`THEN ${delay}`);
      }
      expect(caseSql).toContain('ELSE 172800');
      expect(caseSql).toContain('LEAST(delivery_attempts, 10)');
    });

    it('should pass claimed rows to the handler as BrokerEventMessages', async () => {
      const handler = jest.fn(async (msg: BrokerEventMessage) => msg.ack());
      await startWithoutTimers(source, handler);
      mockTx.$queryRaw.mockResolvedValue([claimedRow]);

      await source.pollOnce();

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
    });
  });

  // ===========================================================================
  // ack()
  // ===========================================================================

  describe('ack', () => {
    it('should mark the row DELIVERED within the claim transaction', async () => {
      const handler = jest.fn(async (msg: BrokerEventMessage) => msg.ack());
      await startWithoutTimers(source, handler);
      mockTx.$queryRaw.mockResolvedValue([claimedRow]);

      await source.pollOnce();

      expect(mockTx.pubSubOutboxEvent.update).toHaveBeenCalledWith({
        where: { id: 'evt-1' },
        data: {
          deliveryStatus: 'DELIVERED',
          deliveryAttempts: { increment: 1 },
          lastDeliveryAttemptAt: expect.any(Date),
        },
      });
    });

    it('should never touch the GCP publish lifecycle columns', async () => {
      const handler = jest.fn(async (msg: BrokerEventMessage) => msg.ack());
      await startWithoutTimers(source, handler);
      mockTx.$queryRaw.mockResolvedValue([claimedRow]);

      await source.pollOnce();

      const updateData = mockTx.pubSubOutboxEvent.update.mock.calls[0][0].data;
      for (const publishColumn of [
        'status',
        'attempts',
        'lastAttemptAt',
        'publishedAt',
        'lastError',
        'messageId',
      ]) {
        expect(updateData).not.toHaveProperty(publishColumn);
      }
    });

    it('should ignore a second ack/nack on the same message', async () => {
      const handler = jest.fn(async (msg: BrokerEventMessage) => {
        await msg.ack();
        await msg.nack();
      });
      await startWithoutTimers(source, handler);
      mockTx.$queryRaw.mockResolvedValue([claimedRow]);

      await source.pollOnce();

      expect(mockTx.pubSubOutboxEvent.update).toHaveBeenCalledTimes(1);
    });
  });

  // ===========================================================================
  // nack()
  // ===========================================================================

  describe('nack', () => {
    it('should increment deliveryAttempts and keep PENDING for retryable failures', async () => {
      const handler = jest.fn(async (msg: BrokerEventMessage) =>
        msg.nack(true, 'HTTP 500'),
      );
      await startWithoutTimers(source, handler);
      mockTx.$queryRaw.mockResolvedValue([{ ...claimedRow, deliveryAttempts: 2 }]);

      await source.pollOnce();

      expect(mockTx.pubSubOutboxEvent.update).toHaveBeenCalledWith({
        where: { id: 'evt-1' },
        data: {
          deliveryStatus: 'PENDING',
          deliveryAttempts: 3,
          lastDeliveryAttemptAt: expect.any(Date),
          lastDeliveryError: 'HTTP 500',
        },
      });
    });

    it('should mark FAILED when retries are exhausted', async () => {
      const handler = jest.fn(async (msg: BrokerEventMessage) => msg.nack(true));
      await startWithoutTimers(source, handler);
      // deliveryAttempts=9 -> this nack is the 10th and final attempt
      mockTx.$queryRaw.mockResolvedValue([{ ...claimedRow, deliveryAttempts: 9 }]);

      await source.pollOnce();

      expect(mockTx.pubSubOutboxEvent.update).toHaveBeenCalledWith({
        where: { id: 'evt-1' },
        data: expect.objectContaining({
          deliveryStatus: 'FAILED',
          deliveryAttempts: 10,
        }),
      });
    });

    it('should mark FAILED immediately when nack is non-retryable', async () => {
      const handler = jest.fn(async (msg: BrokerEventMessage) => msg.nack(false));
      await startWithoutTimers(source, handler);
      mockTx.$queryRaw.mockResolvedValue([claimedRow]);

      await source.pollOnce();

      expect(mockTx.pubSubOutboxEvent.update).toHaveBeenCalledWith({
        where: { id: 'evt-1' },
        data: expect.objectContaining({
          deliveryStatus: 'FAILED',
          deliveryAttempts: 1,
        }),
      });
    });

    it('should auto-nack (retryable) when the handler throws', async () => {
      const handler = jest.fn(async () => {
        throw new Error('boom');
      });
      await startWithoutTimers(source, handler);
      mockTx.$queryRaw.mockResolvedValue([claimedRow]);

      await source.pollOnce();

      expect(mockTx.pubSubOutboxEvent.update).toHaveBeenCalledWith({
        where: { id: 'evt-1' },
        data: expect.objectContaining({
          deliveryStatus: 'PENDING',
          deliveryAttempts: 1,
        }),
      });
    });
  });

  // ===========================================================================
  // skip()
  // ===========================================================================

  describe('skip', () => {
    it('should mark the row SKIPPED with the reason', async () => {
      const handler = jest.fn(async (msg: BrokerEventMessage) =>
        msg.skip('webhooks disabled'),
      );
      await startWithoutTimers(source, handler);
      mockTx.$queryRaw.mockResolvedValue([claimedRow]);

      await source.pollOnce();

      expect(mockTx.pubSubOutboxEvent.update).toHaveBeenCalledWith({
        where: { id: 'evt-1' },
        data: {
          deliveryStatus: 'SKIPPED',
          lastDeliveryError: 'webhooks disabled',
        },
      });
    });
  });

  // ===========================================================================
  // Lifecycle
  // ===========================================================================

  describe('lifecycle', () => {
    it('should throw when started twice', async () => {
      await startWithoutTimers(source, jest.fn());

      await expect(startWithoutTimers(source, jest.fn())).rejects.toThrow(
        'already started',
      );
    });
  });

  /**
   * start() kicks off the setTimeout loop, which we don't want in unit tests.
   * Start, then immediately clear the pending timer while keeping the
   * registered handler so pollOnce() can be driven manually.
   */
  async function startWithoutTimers(
    src: OutboxPollingSource,
    handler: (msg: BrokerEventMessage) => Promise<void>,
  ): Promise<void> {
    jest.useFakeTimers();
    try {
      await src.start(handler);
    } finally {
      jest.clearAllTimers();
      jest.useRealTimers();
    }
  }
});
