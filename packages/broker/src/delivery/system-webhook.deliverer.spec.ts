import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BrokerEventMessage } from '../transport/event-source.interface';
import { CircuitBreakerService } from './circuit-breaker.service';
import { KeyReaderService } from './key-reader.service';
import { SystemWebhookDeliverer } from './system-webhook.deliverer';
import { UrlGuardService } from './url-guard.service';

describe('SystemWebhookDeliverer', () => {
  const wirePayload = {
    event: 'tenant.created',
    timestamp: '2025-01-01T00:00:00.000Z',
    data: { tenant_id: 'tenant-123', name: 'Acme' },
  };

  const webhookA = {
    id: 'wh-a',
    url: 'https://a.example.com/hook',
    headers: null,
    isActive: true,
    events: ['tenant.created'],
  };
  const webhookB = {
    id: 'wh-b',
    url: 'https://b.example.com/hook',
    headers: { 'X-Custom': 'yes' },
    isActive: true,
    events: ['tenant.created'],
  };

  const message: BrokerEventMessage = {
    id: 'outbox-2',
    eventType: 'tenant.created',
    eventSource: 'system_webhook',
    tenantId: 'tenant-123',
    applicationId: null,
    payload: wirePayload as unknown as Record<string, unknown>,
    orderingKey: 'tenant-123',
    ack: jest.fn(),
    skip: jest.fn(),
    nack: jest.fn(),
  };

  const mockPrisma = {
    systemWebhook: { findMany: jest.fn(), update: jest.fn() },
    systemWebhookDelivery: { create: jest.fn() },
    pubSubOutboxEvent: { findUnique: jest.fn() },
  };
  const mockKeyReader = { sign: jest.fn() };
  const mockUrlGuard = { checkUrl: jest.fn() };
  const mockBreaker = {
    canAttempt: jest.fn(),
    recordSuccess: jest.fn(),
    recordFailure: jest.fn(),
  };

  let deliverer: SystemWebhookDeliverer;
  let fetchMock: jest.Mock;

  const okResponse = () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    text: async () => 'ok',
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    mockPrisma.systemWebhook.findMany.mockResolvedValue([webhookA]);
    mockPrisma.systemWebhook.update.mockResolvedValue({});
    mockPrisma.systemWebhookDelivery.create.mockResolvedValue({});
    mockKeyReader.sign.mockResolvedValue({ signature: 'sig-b64', kid: 'kid-1' });
    mockUrlGuard.checkUrl.mockResolvedValue({ allowed: true });
    mockBreaker.canAttempt.mockReturnValue(true);

    fetchMock = jest.fn().mockResolvedValue(okResponse());
    global.fetch = fetchMock as unknown as typeof fetch;

    deliverer = new SystemWebhookDeliverer(
      mockPrisma as unknown as PrismaService,
      mockKeyReader as unknown as KeyReaderService,
      mockUrlGuard as unknown as UrlGuardService,
      mockBreaker as unknown as CircuitBreakerService,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ===========================================================================
  // Target selection & wire format
  // ===========================================================================

  it('should skip when no active webhooks subscribe to the event', async () => {
    mockPrisma.systemWebhook.findMany.mockResolvedValue([]);

    const result = await deliverer.deliver(message);

    expect(result.outcome).toBe('skipped');
    expect(mockPrisma.systemWebhook.findMany).toHaveBeenCalledWith({
      where: { isActive: true, events: { has: 'tenant.created' } },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('should POST the exact backend wire format (body-only signature, X-Webhook-* headers)', async () => {
    const result = await deliverer.deliver(message);

    expect(result).toEqual({ outcome: 'delivered' });

    const body = JSON.stringify(wirePayload);
    // Signature input is the BODY ONLY — system webhooks have no
    // timestamp prefix (parity with SystemWebhookService.signPayload)
    expect(mockKeyReader.sign).toHaveBeenCalledWith(body);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(webhookA.url);
    expect(init.body).toBe(body);
    expect(init.headers).toEqual({
      'Content-Type': 'application/json',
      'X-Webhook-Signature': 'sig-b64',
      'X-Webhook-Key-Id': 'kid-1',
      'X-Webhook-Event': 'tenant.created',
      'X-Webhook-Timestamp': '2025-01-01T00:00:00.000Z',
    });
  });

  it('should merge per-webhook custom headers', async () => {
    mockPrisma.systemWebhook.findMany.mockResolvedValue([webhookB]);

    await deliverer.deliver(message);

    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({
      'X-Custom': 'yes',
      'X-Webhook-Signature': 'sig-b64',
    });
  });

  // ===========================================================================
  // Bookkeeping parity
  // ===========================================================================

  it('should log the delivery and reset failureCount on success', async () => {
    await deliverer.deliver(message);

    expect(mockPrisma.systemWebhookDelivery.create).toHaveBeenCalledWith({
      data: {
        webhookId: 'wh-a',
        event: 'tenant.created',
        payload: wirePayload,
        status: 200,
        response: 'ok',
        duration: expect.any(Number),
        error: null,
      },
    });
    expect(mockPrisma.systemWebhook.update).toHaveBeenCalledWith({
      where: { id: 'wh-a' },
      data: {
        lastTriggeredAt: expect.any(Date),
        lastStatus: 200,
        failureCount: 0,
      },
    });
  });

  it('should increment failureCount and record the error on failure', async () => {
    fetchMock.mockRejectedValue(new Error('socket hang up'));

    await deliverer.deliver(message);

    expect(mockPrisma.systemWebhookDelivery.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        webhookId: 'wh-a',
        status: null,
        error: 'socket hang up',
      }),
    });
    expect(mockPrisma.systemWebhook.update).toHaveBeenCalledWith({
      where: { id: 'wh-a' },
      data: expect.objectContaining({
        lastStatus: null,
        failureCount: { increment: 1 },
      }),
    });
  });

  // ===========================================================================
  // Partial-failure semantics across multiple targets
  // ===========================================================================

  it('should succeed only when ALL targets succeed', async () => {
    mockPrisma.systemWebhook.findMany.mockResolvedValue([webhookA, webhookB]);

    const result = await deliverer.deliver(message);

    expect(result).toEqual({ outcome: 'delivered' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('should nack retryably when at least one target fails retryably (5xx)', async () => {
    mockPrisma.systemWebhook.findMany.mockResolvedValue([webhookA, webhookB]);
    fetchMock
      .mockResolvedValueOnce(okResponse())
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        text: async () => 'down',
      });

    const result = await deliverer.deliver(message);

    expect(result).toMatchObject({ outcome: 'failed', retryable: true });
    // The succeeded target's stats were still written (at-least-once:
    // it will legitimately receive the event again on redelivery)
    expect(mockPrisma.systemWebhook.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'wh-a' } }),
    );
  });

  it('should treat 429 as retryable', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      text: async () => 'slow down',
    });

    const result = await deliverer.deliver(message);

    expect(result).toMatchObject({ outcome: 'failed', retryable: true });
  });

  it('should fail non-retryably when the only failures are 4xx rejections', async () => {
    mockPrisma.systemWebhook.findMany.mockResolvedValue([webhookA, webhookB]);
    fetchMock
      .mockResolvedValueOnce(okResponse())
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: async () => 'no thanks',
      });

    const result = await deliverer.deliver(message);

    expect(result).toMatchObject({ outcome: 'failed', retryable: false });
  });

  // ===========================================================================
  // Hardening
  // ===========================================================================

  it('should block SSRF targets per-webhook and log the block', async () => {
    mockUrlGuard.checkUrl.mockResolvedValue({
      allowed: false,
      reason: 'resolves to private/restricted address 169.254.169.254',
    });

    const result = await deliverer.deliver(message);

    expect(result).toMatchObject({ outcome: 'failed', retryable: false });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockPrisma.systemWebhookDelivery.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        error: expect.stringContaining('[SSRF_BLOCKED]'),
      }),
    });
  });

  it('should refuse without attempting (retryable) while the circuit is open', async () => {
    mockBreaker.canAttempt.mockReturnValue(false);

    const result = await deliverer.deliver(message);

    expect(result).toMatchObject({ outcome: 'failed', retryable: true });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockPrisma.systemWebhookDelivery.create).not.toHaveBeenCalled();
  });

  // ===========================================================================
  // Payload resolution
  // ===========================================================================

  it('should recover the full payload from the outbox row for Pub/Sub messages', async () => {
    const pubsubMessage: BrokerEventMessage = {
      ...message,
      payload: { tenant_id: 'tenant-123', name: 'Acme' }, // inner data only
    };
    mockPrisma.pubSubOutboxEvent.findUnique.mockResolvedValue({
      payload: wirePayload,
    });

    const result = await deliverer.deliver(pubsubMessage);

    expect(result.outcome).toBe('delivered');
    expect(fetchMock.mock.calls[0][1].body).toBe(JSON.stringify(wirePayload));
  });
});
