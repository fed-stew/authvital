import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { KeyService } from '../oauth/key.service';
import { PubSubOutboxService } from '../pubsub/pubsub-outbox.service';
import { SystemWebhookService } from './system-webhook.service';
import type { TenantCreatedEventData } from '@authvital/shared';

describe('SystemWebhookService — WEBHOOK_DELIVERY_MODE gating', () => {
  // Canonical tenant.created payload — dispatch<T> is generic over the
  // shared contract, so this fixture is compile-time checked.
  const tenantCreatedData: TenantCreatedEventData = {
    tenant_id: 'tenant-1',
    name: 'Tenant One',
    slug: 'tenant-one',
    created_at: '2026-08-21T00:00:00.000Z',
    settings: {},
  };
  // Real key material so the legacy signPayload path works end-to-end.
  const { privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });

  const webhookRow = {
    id: 'wh-1',
    url: 'https://receiver.example.com/hook',
    headers: null,
    isActive: true,
    events: ['tenant.created'],
  };

  const mockPrisma = {
    systemWebhook: { findMany: jest.fn(), update: jest.fn() },
    systemWebhookDelivery: { create: jest.fn() },
  };
  const mockKeyService = { getActiveWebhookKey: jest.fn() };
  const mockOutbox = { enqueue: jest.fn() };
  const mockConfig = { get: jest.fn() };

  let fetchMock: jest.Mock;

  function buildService(mode: string | undefined): SystemWebhookService {
    mockConfig.get.mockImplementation((key: string) =>
      key === 'WEBHOOK_DELIVERY_MODE' ? mode : undefined,
    );
    return new SystemWebhookService(
      mockPrisma as unknown as PrismaService,
      mockKeyService as unknown as KeyService,
      mockOutbox as unknown as PubSubOutboxService,
      mockConfig as unknown as ConfigService,
    );
  }

  /** Flush the legacy fire-and-forget delivery chain. */
  async function flushAsync(): Promise<void> {
    for (let i = 0; i < 5; i++) {
      await new Promise((resolve) => setImmediate(resolve));
    }
  }

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    mockPrisma.systemWebhook.findMany.mockResolvedValue([webhookRow]);
    mockPrisma.systemWebhook.update.mockResolvedValue({});
    mockPrisma.systemWebhookDelivery.create.mockResolvedValue({});
    mockKeyService.getActiveWebhookKey.mockResolvedValue({
      kid: 'webhook-kid-1',
      privateKey,
      publicKey: null,
      algorithm: 'RS256',
    });
    mockOutbox.enqueue.mockResolvedValue(undefined);

    fetchMock = jest.fn().mockResolvedValue({
      status: 200,
      text: async () => 'ok',
    });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ===========================================================================
  // Broker mode
  // ===========================================================================

  describe('broker mode', () => {
    it('should ONLY enqueue to the outbox — no subscriber fan-out, no HTTP', async () => {
      const service = buildService('broker');

      await service.dispatch('tenant.created', tenantCreatedData);
      await flushAsync();

      expect(mockOutbox.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'tenant.created',
          eventSource: 'system_webhook',
          tenantId: 'tenant-1',
          orderingKey: 'tenant-1',
          // Payload carries event+timestamp — exactly what the broker's
          // payload-resolver requires for system webhooks.
          payload: expect.objectContaining({
            event: 'tenant.created',
            timestamp: expect.any(String),
          }),
        }),
      );
      expect(mockPrisma.systemWebhook.findMany).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('should log loudly but not throw when the load-bearing enqueue fails', async () => {
      const service = buildService('broker');
      const errorSpy = jest.spyOn(Logger.prototype, 'error');
      mockOutbox.enqueue.mockRejectedValue(new Error('db down'));

      await expect(
        service.dispatch('tenant.created', tenantCreatedData),
      ).resolves.toBeUndefined();

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('CRITICAL'),
      );
    });
  });

  // ===========================================================================
  // Legacy mode (default)
  // ===========================================================================

  describe('legacy mode (default)', () => {
    it('should enqueue AND deliver to subscribers in-core', async () => {
      const service = buildService(undefined);

      await service.dispatch('tenant.created', tenantCreatedData);
      await flushAsync();

      expect(mockOutbox.enqueue).toHaveBeenCalledTimes(1);
      expect(mockPrisma.systemWebhook.findMany).toHaveBeenCalledWith({
        where: { isActive: true, events: { has: 'tenant.created' } },
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toBe(webhookRow.url);
      // Signed with the dedicated webhook key (consistent kid with broker)
      expect(mockKeyService.getActiveWebhookKey).toHaveBeenCalled();
      expect(fetchMock.mock.calls[0][1].headers).toMatchObject({
        'X-Webhook-Key-Id': 'webhook-kid-1',
      });
      // Bookkeeping written as before
      expect(mockPrisma.systemWebhookDelivery.create).toHaveBeenCalled();
      expect(mockPrisma.systemWebhook.update).toHaveBeenCalled();
    });

    it('should skip HTTP when no subscribers exist', async () => {
      const service = buildService(undefined);
      mockPrisma.systemWebhook.findMany.mockResolvedValue([]);

      await service.dispatch('tenant.created', tenantCreatedData);
      await flushAsync();

      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
