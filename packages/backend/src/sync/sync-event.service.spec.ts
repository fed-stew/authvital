import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma';
import { KeyService } from '../oauth/key.service';
import { PubSubOutboxService } from '../pubsub/pubsub-outbox.service';
import { SyncEventService } from './sync-event.service';
import { SyncEventType } from './types';

describe('SyncEventService — WEBHOOK_DELIVERY_MODE gating', () => {
  const application = {
    id: 'app-1',
    name: 'Test App',
    webhookUrl: 'https://receiver.example.com/hook',
    webhookEnabled: true,
    webhookEvents: [] as string[],
  };

  const mockTx = {
    syncEvent: { create: jest.fn() },
  };

  const mockPrisma = {
    syncEvent: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    application: { findUnique: jest.fn() },
    $transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(mockTx)),
  };

  const mockKeyService = { getActiveWebhookKey: jest.fn() };
  const mockOutbox = {
    enqueue: jest.fn(),
    enqueueWithTransaction: jest.fn(),
  };
  const mockConfig = { get: jest.fn() };

  let fetchMock: jest.Mock;

  function buildService(mode: string | undefined): SyncEventService {
    mockConfig.get.mockImplementation((key: string) =>
      key === 'WEBHOOK_DELIVERY_MODE' ? mode : undefined,
    );
    return new SyncEventService(
      mockPrisma as unknown as PrismaService,
      mockKeyService as unknown as KeyService,
      mockOutbox as unknown as PubSubOutboxService,
      mockConfig as unknown as ConfigService,
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    mockPrisma.application.findUnique.mockResolvedValue({ ...application });
    mockPrisma.syncEvent.create.mockResolvedValue({});
    mockPrisma.syncEvent.findMany.mockResolvedValue([]);
    mockTx.syncEvent.create.mockResolvedValue({});
    mockOutbox.enqueue.mockResolvedValue(undefined);
    mockOutbox.enqueueWithTransaction.mockResolvedValue(undefined);

    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ===========================================================================
  // Broker mode
  // ===========================================================================

  describe('broker mode', () => {
    let service: SyncEventService;

    beforeEach(() => {
      service = buildService('broker');
    });

    it('should write syncEvent + outbox atomically in ONE transaction', async () => {
      await service.emit(
        'user.created' as SyncEventType,
        'tenant-1',
        'app-1',
        { sub: 'user-1' },
      );

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      // syncEvent row written via the TRANSACTION client, not the root client
      expect(mockTx.syncEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          eventType: 'user.created',
          tenantId: 'tenant-1',
          applicationId: 'app-1',
          webhookStatus: 'PENDING',
        }),
      });
      expect(mockPrisma.syncEvent.create).not.toHaveBeenCalled();
      // outbox row written via the SAME transaction client
      expect(mockOutbox.enqueueWithTransaction).toHaveBeenCalledWith(
        mockTx,
        expect.objectContaining({
          eventType: 'user.created',
          eventSource: 'sync_event',
          orderingKey: 'tenant-1:app-1',
        }),
      );
      // Fire-and-forget enqueue must NOT be used in broker mode
      expect(mockOutbox.enqueue).not.toHaveBeenCalled();
    });

    it('should perform NO in-core delivery (no fetch, no deliverWebhook)', async () => {
      const deliverSpy = jest.spyOn(service, 'deliverWebhook');

      await service.emit(
        'user.created' as SyncEventType,
        'tenant-1',
        'app-1',
        { sub: 'user-1' },
      );
      // flush any stray microtasks
      await new Promise((resolve) => setImmediate(resolve));

      expect(deliverSpy).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('should propagate transaction failure — neither row survives a failed enqueue', async () => {
      mockOutbox.enqueueWithTransaction.mockRejectedValue(
        new Error('outbox insert failed'),
      );

      await expect(
        service.emit('user.created' as SyncEventType, 'tenant-1', 'app-1', {}),
      ).rejects.toThrow('outbox insert failed');

      // The syncEvent write happened inside the SAME (now rolled-back)
      // transaction; nothing was written via the root client.
      expect(mockPrisma.syncEvent.create).not.toHaveBeenCalled();
    });

    it('should still compute SKIPPED webhookStatus for the broker to reuse', async () => {
      mockPrisma.application.findUnique.mockResolvedValue({
        ...application,
        webhookEnabled: false,
      });

      await service.emit(
        'user.created' as SyncEventType,
        'tenant-1',
        'app-1',
        {},
      );

      expect(mockTx.syncEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ webhookStatus: 'SKIPPED' }),
      });
    });

    it('should early-return from the retry cron without touching the DB', async () => {
      await service.retryPendingWebhooks();

      expect(mockPrisma.syncEvent.findMany).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Legacy mode (default) — behavior byte-for-byte as before
  // ===========================================================================

  describe('legacy mode (default)', () => {
    let service: SyncEventService;

    beforeEach(() => {
      service = buildService(undefined); // unset env => legacy
    });

    it('should default to legacy for unknown mode values', async () => {
      const weird = buildService('carrier_pigeon');
      const deliverSpy = jest
        .spyOn(weird, 'deliverWebhook')
        .mockResolvedValue(true);

      await weird.emit('user.created' as SyncEventType, 'tenant-1', 'app-1', {});

      expect(deliverSpy).toHaveBeenCalled();
    });

    it('should write syncEvent directly and fire-and-forget the outbox enqueue', async () => {
      jest.spyOn(service, 'deliverWebhook').mockResolvedValue(true);

      await service.emit(
        'user.created' as SyncEventType,
        'tenant-1',
        'app-1',
        { sub: 'user-1' },
      );

      expect(mockPrisma.syncEvent.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      expect(mockOutbox.enqueue).toHaveBeenCalledTimes(1);
      expect(mockOutbox.enqueueWithTransaction).not.toHaveBeenCalled();
    });

    it('should trigger immediate in-core delivery for PENDING events', async () => {
      const deliverSpy = jest
        .spyOn(service, 'deliverWebhook')
        .mockResolvedValue(true);

      await service.emit(
        'user.created' as SyncEventType,
        'tenant-1',
        'app-1',
        {},
      );

      expect(deliverSpy).toHaveBeenCalledTimes(1);
    });

    it('should NOT trigger delivery for SKIPPED events', async () => {
      mockPrisma.application.findUnique.mockResolvedValue(null);
      const deliverSpy = jest
        .spyOn(service, 'deliverWebhook')
        .mockResolvedValue(true);

      await service.emit(
        'user.created' as SyncEventType,
        'tenant-1',
        'app-1',
        {},
      );

      expect(deliverSpy).not.toHaveBeenCalled();
    });

    it('should NOT abort emit when the fire-and-forget enqueue fails', async () => {
      jest.spyOn(service, 'deliverWebhook').mockResolvedValue(true);
      mockOutbox.enqueue.mockRejectedValue(new Error('pubsub down'));

      await expect(
        service.emit('user.created' as SyncEventType, 'tenant-1', 'app-1', {}),
      ).resolves.toBeUndefined();

      expect(mockPrisma.syncEvent.create).toHaveBeenCalled();
    });

    it('should run the retry cron', async () => {
      await service.retryPendingWebhooks();

      expect(mockPrisma.syncEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ webhookStatus: 'PENDING' }),
        }),
      );
    });
  });
});
