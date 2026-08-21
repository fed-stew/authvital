import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BrokerEventMessage } from '../transport/event-source.interface';
import { CircuitBreakerService } from './circuit-breaker.service';
import { KeyReaderService } from './key-reader.service';
import { SyncEventDeliverer } from './sync-event.deliverer';
import { UrlGuardService } from './url-guard.service';

describe('SyncEventDeliverer', () => {
  const fullPayload = {
    id: 'sync-evt-1',
    type: 'user.created',
    timestamp: '2025-01-01T00:00:00.000Z',
    tenant_id: 'tenant-123',
    application_id: 'app-1',
    data: { sub: 'user-1', email: 'a@b.co' },
  };

  const syncEventRow = {
    id: 'sync-evt-1',
    eventType: 'user.created',
    tenantId: 'tenant-123',
    applicationId: 'app-1',
    payload: fullPayload,
    webhookStatus: 'PENDING',
    webhookAttempts: 0,
    lastAttemptAt: null,
    deliveredAt: null,
    lastError: null,
  };

  const applicationRow = {
    id: 'app-1',
    name: 'Test App',
    webhookUrl: 'https://receiver.example.com/hook',
    webhookEnabled: true,
    webhookEvents: [] as string[],
  };

  const message: BrokerEventMessage = {
    id: 'outbox-1',
    eventType: 'user.created',
    eventSource: 'sync_event',
    tenantId: 'tenant-123',
    applicationId: 'app-1',
    payload: fullPayload as unknown as Record<string, unknown>,
    orderingKey: 'tenant-123:app-1',
    ack: jest.fn(),
    skip: jest.fn(),
    nack: jest.fn(),
  };

  const mockPrisma = {
    syncEvent: { findUnique: jest.fn(), update: jest.fn() },
    application: { findUnique: jest.fn() },
    pubSubOutboxEvent: { findUnique: jest.fn() },
  };
  const mockKeyReader = { sign: jest.fn() };
  const mockUrlGuard = { checkUrl: jest.fn() };
  const mockBreaker = {
    canAttempt: jest.fn(),
    recordSuccess: jest.fn(),
    recordFailure: jest.fn(),
  };

  let deliverer: SyncEventDeliverer;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    mockPrisma.syncEvent.findUnique.mockResolvedValue({ ...syncEventRow });
    mockPrisma.syncEvent.update.mockResolvedValue({});
    mockPrisma.application.findUnique.mockResolvedValue({ ...applicationRow });
    mockKeyReader.sign.mockResolvedValue({ signature: 'sig-b64', kid: 'kid-1' });
    mockUrlGuard.checkUrl.mockResolvedValue({ allowed: true });
    mockBreaker.canAttempt.mockReturnValue(true);

    fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => 'ok',
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    deliverer = new SyncEventDeliverer(
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
  // Happy path: wire format + write-back
  // ===========================================================================

  it('should POST the exact backend wire format and mark DELIVERED', async () => {
    const result = await deliverer.deliver(message);

    expect(result).toEqual({ outcome: 'delivered' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://receiver.example.com/hook');
    expect(init.method).toBe('POST');
    // Body is JSON.stringify(syncEvent.payload) — byte-identical to backend
    expect(init.body).toBe(JSON.stringify(fullPayload));
    expect(init.headers).toEqual({
      'Content-Type': 'application/json',
      'X-AuthVital-Signature': 'sig-b64',
      'X-AuthVital-Key-Id': 'kid-1',
      'X-AuthVital-Timestamp': expect.stringMatching(/^\d+$/),
      'X-AuthVital-Event-Id': 'sync-evt-1',
      'X-AuthVital-Event-Type': 'user.created',
    });

    // Signature input is `${timestamp}.${body}` — exactly what receivers verify
    const signedInput = mockKeyReader.sign.mock.calls[0][0] as string;
    expect(signedInput).toBe(
      `${init.headers['X-AuthVital-Timestamp']}.${init.body}`,
    );

    // Write-back shape identical to the backend's success path
    expect(mockPrisma.syncEvent.update).toHaveBeenCalledWith({
      where: { id: 'sync-evt-1' },
      data: {
        webhookStatus: 'DELIVERED',
        deliveredAt: expect.any(Date),
        webhookAttempts: { increment: 1 },
        lastAttemptAt: expect.any(Date),
      },
    });
    expect(mockBreaker.recordSuccess).toHaveBeenCalledWith(applicationRow.webhookUrl);
  });

  it('should RE-SIGN with a fresh timestamp on every attempt', async () => {
    const nowSpy = jest.spyOn(Date, 'now');

    nowSpy.mockReturnValue(1_700_000_000_000); // t0
    await deliverer.deliver(message);

    nowSpy.mockReturnValue(1_700_000_600_000); // t0 + 10 minutes
    mockPrisma.syncEvent.findUnique.mockResolvedValue({ ...syncEventRow });
    await deliverer.deliver(message);

    const firstInput = mockKeyReader.sign.mock.calls[0][0] as string;
    const secondInput = mockKeyReader.sign.mock.calls[1][0] as string;

    expect(firstInput.split('.')[0]).toBe('1700000000');
    expect(secondInput.split('.')[0]).toBe('1700000600');
    expect(firstInput).not.toBe(secondInput);
    // Same body, different timestamp — proof the signature is fresh
    expect(firstInput.substring(firstInput.indexOf('.'))).toBe(
      secondInput.substring(secondInput.indexOf('.')),
    );
  });

  // ===========================================================================
  // Skip paths (parity with backend guards)
  // ===========================================================================

  it('should skip without fetching when webhookStatus is not PENDING', async () => {
    mockPrisma.syncEvent.findUnique.mockResolvedValue({
      ...syncEventRow,
      webhookStatus: 'DELIVERED',
    });

    const result = await deliverer.deliver(message);

    expect(result.outcome).toBe('skipped');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockPrisma.syncEvent.update).not.toHaveBeenCalled();
  });

  it('should mark SKIPPED when the application is missing', async () => {
    mockPrisma.application.findUnique.mockResolvedValue(null);

    const result = await deliverer.deliver(message);

    expect(result.outcome).toBe('skipped');
    expect(mockPrisma.syncEvent.update).toHaveBeenCalledWith({
      where: { id: 'sync-evt-1' },
      data: { webhookStatus: 'SKIPPED' },
    });
  });

  it('should mark SKIPPED when webhooks are disabled or URL missing', async () => {
    mockPrisma.application.findUnique.mockResolvedValue({
      ...applicationRow,
      webhookEnabled: false,
    });

    const result = await deliverer.deliver(message);

    expect(result.outcome).toBe('skipped');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('should mark SKIPPED when the event does not match the filter', async () => {
    mockPrisma.application.findUnique.mockResolvedValue({
      ...applicationRow,
      webhookEvents: ['invite.*', 'license.assigned'],
    });

    const result = await deliverer.deliver(message);

    expect(result.outcome).toBe('skipped');
    expect(mockPrisma.syncEvent.update).toHaveBeenCalledWith({
      where: { id: 'sync-evt-1' },
      data: { webhookStatus: 'SKIPPED' },
    });
  });

  it('should deliver when the filter matches via wildcard', async () => {
    mockPrisma.application.findUnique.mockResolvedValue({
      ...applicationRow,
      webhookEvents: ['user.*'],
    });

    const result = await deliverer.deliver(message);

    expect(result.outcome).toBe('delivered');
  });

  // ===========================================================================
  // Hardening
  // ===========================================================================

  it('should fail non-retryably and mark FAILED when the SSRF guard blocks', async () => {
    mockUrlGuard.checkUrl.mockResolvedValue({
      allowed: false,
      reason: 'resolves to private/restricted address 10.0.0.5',
    });

    const result = await deliverer.deliver(message);

    expect(result).toMatchObject({ outcome: 'failed', retryable: false });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockPrisma.syncEvent.update).toHaveBeenCalledWith({
      where: { id: 'sync-evt-1' },
      data: expect.objectContaining({
        webhookStatus: 'FAILED',
        lastError: expect.stringContaining('[SSRF_BLOCKED]'),
      }),
    });
  });

  it('should fail retryably WITHOUT touching the sync event when the circuit is open', async () => {
    mockBreaker.canAttempt.mockReturnValue(false);

    const result = await deliverer.deliver(message);

    expect(result).toMatchObject({ outcome: 'failed', retryable: true });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockPrisma.syncEvent.update).not.toHaveBeenCalled();
  });

  // ===========================================================================
  // Failure write-backs
  // ===========================================================================

  it('should write back PENDING with categorized error on HTTP failure', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: async () => 'boom',
    });

    const result = await deliverer.deliver(message);

    expect(result).toMatchObject({ outcome: 'failed', retryable: true });
    expect(mockPrisma.syncEvent.update).toHaveBeenCalledWith({
      where: { id: 'sync-evt-1' },
      data: {
        webhookStatus: 'PENDING',
        webhookAttempts: 1,
        lastAttemptAt: expect.any(Date),
        lastError: expect.stringContaining('[HTTP_ERROR] HTTP 500'),
      },
    });
    expect(mockBreaker.recordFailure).toHaveBeenCalledWith(applicationRow.webhookUrl);
  });

  it('should mark FAILED and non-retryable on the 5th attempt', async () => {
    mockPrisma.syncEvent.findUnique.mockResolvedValue({
      ...syncEventRow,
      webhookAttempts: 4, // this attempt is #5 of MAX 5
    });
    fetchMock.mockRejectedValue(
      Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }),
    );

    const result = await deliverer.deliver(message);

    expect(result).toMatchObject({ outcome: 'failed', retryable: false });
    expect(mockPrisma.syncEvent.update).toHaveBeenCalledWith({
      where: { id: 'sync-evt-1' },
      data: expect.objectContaining({
        webhookStatus: 'FAILED',
        webhookAttempts: 5,
        lastError: expect.stringContaining('[CONNECTION_REFUSED]'),
      }),
    });
  });

  // ===========================================================================
  // Payload resolution (Pub/Sub transport carries inner data only)
  // ===========================================================================

  it('should recover the full payload from the outbox row for Pub/Sub messages', async () => {
    const pubsubMessage: BrokerEventMessage = {
      ...message,
      payload: { sub: 'user-1' }, // inner data only — no id/type
    };
    mockPrisma.pubSubOutboxEvent.findUnique.mockResolvedValue({
      payload: fullPayload,
    });

    const result = await deliverer.deliver(pubsubMessage);

    expect(result.outcome).toBe('delivered');
    expect(mockPrisma.pubSubOutboxEvent.findUnique).toHaveBeenCalledWith({
      where: { id: 'outbox-1' },
      select: { payload: true },
    });
    expect(fetchMock.mock.calls[0][1].body).toBe(JSON.stringify(fullPayload));
  });

  it('should fail non-retryably when the full payload cannot be resolved', async () => {
    const pubsubMessage: BrokerEventMessage = {
      ...message,
      payload: { sub: 'user-1' },
    };
    mockPrisma.pubSubOutboxEvent.findUnique.mockResolvedValue(null);

    const result = await deliverer.deliver(pubsubMessage);

    expect(result).toMatchObject({ outcome: 'failed', retryable: false });
  });
});
