import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { KeyManagerService } from './key-manager.service';

describe('KeyManagerService — dedicated webhook signing keys (purpose)', () => {
  // Real PEM key material so createPrivateKey/createPublicKey work.
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const tokenKeyRow = {
    id: 'id-token',
    kid: 'kid-token',
    privateKey: 'encrypted-token',
    publicKey,
    algorithm: 'RS256',
    status: 'ACTIVE',
    purpose: 'TOKEN',
    createdAt: new Date(),
  };

  const webhookKeyRow = {
    ...tokenKeyRow,
    id: 'id-webhook',
    kid: 'kid-webhook',
    privateKey: 'encrypted-webhook',
    purpose: 'WEBHOOK',
  };

  const mockTx = {
    $queryRaw: jest.fn(),
    signingKey: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
    },
  };

  const mockPrisma = {
    signingKey: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      groupBy: jest.fn(),
    },
    applicationClient: { findMany: jest.fn() },
    $transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(mockTx)),
  };

  const mockKeyEncryption = {
    encrypt: jest.fn().mockReturnValue('encrypted'),
    decrypt: jest.fn().mockReturnValue(privateKey),
  };

  const mockConfig = { get: jest.fn().mockReturnValue(undefined) };

  let service: KeyManagerService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    mockKeyEncryption.encrypt.mockReturnValue('encrypted');
    mockKeyEncryption.decrypt.mockReturnValue(privateKey);
    mockTx.$queryRaw.mockResolvedValue([{ pg_try_advisory_xact_lock: true }]);
    mockTx.signingKey.findFirst.mockResolvedValue(null);
    mockTx.signingKey.updateMany.mockResolvedValue({ count: 0 });
    mockTx.signingKey.create.mockResolvedValue({});
    mockPrisma.applicationClient.findMany.mockResolvedValue([]);

    service = new KeyManagerService(
      mockPrisma as any,
      mockKeyEncryption as any,
      mockConfig as unknown as ConfigService,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ===========================================================================
  // Generation scoping
  // ===========================================================================

  it('should demote ONLY same-purpose keys when generating a WEBHOOK key', async () => {
    await service.generateKey('WEBHOOK' as any);

    expect(mockTx.signingKey.updateMany).toHaveBeenCalledWith({
      where: { status: 'ACTIVE', purpose: 'WEBHOOK' },
      data: { status: 'PASSIVE' },
    });
    expect(mockTx.signingKey.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ purpose: 'WEBHOOK', status: 'ACTIVE' }),
    });
  });

  it('should default to TOKEN purpose (pre-existing behavior)', async () => {
    await service.generateKey();

    expect(mockTx.signingKey.updateMany).toHaveBeenCalledWith({
      where: { status: 'ACTIVE', purpose: 'TOKEN' },
      data: { status: 'PASSIVE' },
    });
  });

  // ===========================================================================
  // Startup: both purposes ensured
  // ===========================================================================

  it('should ensure an ACTIVE key for BOTH purposes on startup', async () => {
    const generateSpy = jest
      .spyOn(service, 'generateKey')
      .mockResolvedValue({ kid: 'new-kid' });
    mockPrisma.signingKey.findFirst.mockResolvedValue(null); // nothing exists

    await service.onModuleInit();

    expect(generateSpy).toHaveBeenCalledWith('TOKEN');
    expect(generateSpy).toHaveBeenCalledWith('WEBHOOK');
  });

  it('should generate only the missing WEBHOOK key when TOKEN already exists (upgrade path)', async () => {
    const generateSpy = jest
      .spyOn(service, 'generateKey')
      .mockResolvedValue({ kid: 'new-kid' });
    mockPrisma.signingKey.findFirst.mockImplementation(({ where }: any) =>
      Promise.resolve(where.purpose === 'TOKEN' ? tokenKeyRow : null),
    );

    await service.onModuleInit();

    expect(generateSpy).toHaveBeenCalledWith('WEBHOOK');
    expect(generateSpy).not.toHaveBeenCalledWith('TOKEN');
  });

  // ===========================================================================
  // Retrieval per purpose
  // ===========================================================================

  it('getSigningKey should fetch the TOKEN key by default', async () => {
    mockPrisma.signingKey.findFirst.mockResolvedValue(tokenKeyRow);

    const key = await service.getSigningKey();

    expect(key.kid).toBe('kid-token');
    expect(mockPrisma.signingKey.findFirst).toHaveBeenCalledWith({
      where: { status: 'ACTIVE', purpose: 'TOKEN' },
    });
  });

  it('getWebhookSigningKey should fetch the WEBHOOK key', async () => {
    mockPrisma.signingKey.findFirst.mockResolvedValue(webhookKeyRow);

    const key = await service.getWebhookSigningKey();

    expect(key.kid).toBe('kid-webhook');
    expect(mockPrisma.signingKey.findFirst).toHaveBeenCalledWith({
      where: { status: 'ACTIVE', purpose: 'WEBHOOK' },
    });
  });

  it('should cache TOKEN and WEBHOOK keys independently', async () => {
    mockPrisma.signingKey.findFirst
      .mockResolvedValueOnce(tokenKeyRow)
      .mockResolvedValueOnce(webhookKeyRow);

    const token1 = await service.getSigningKey();
    const webhook1 = await service.getWebhookSigningKey();
    const token2 = await service.getSigningKey();
    const webhook2 = await service.getWebhookSigningKey();

    expect(token1.kid).toBe('kid-token');
    expect(webhook1.kid).toBe('kid-webhook');
    expect(token2.kid).toBe('kid-token');
    expect(webhook2.kid).toBe('kid-webhook');
    // Two DB hits total — one per purpose, rest served from cache
    expect(mockPrisma.signingKey.findFirst).toHaveBeenCalledTimes(2);
  });

  // ===========================================================================
  // Rotation cadence covers both purposes
  // ===========================================================================

  it('checkAndRotateIfNeeded should rotate an over-age WEBHOOK key with the same cadence', async () => {
    const oldDate = new Date(Date.now() - 31 * 24 * 3600 * 1000); // 31 days
    mockPrisma.signingKey.findFirst.mockImplementation(({ where }: any) => {
      if (where.purpose === 'TOKEN') {
        return Promise.resolve({ ...tokenKeyRow, createdAt: new Date() });
      }
      return Promise.resolve({ ...webhookKeyRow, createdAt: oldDate });
    });
    const rotateSpy = jest
      .spyOn(service, 'rotateKeys')
      .mockResolvedValue({ newKid: 'x', demotedKid: null });

    const result = await service.checkAndRotateIfNeeded();

    expect(result.rotated).toBe(true);
    expect(rotateSpy).toHaveBeenCalledWith('WEBHOOK');
    expect(rotateSpy).not.toHaveBeenCalledWith('TOKEN');
  });

  // ===========================================================================
  // JWKS publication
  // ===========================================================================

  it('getPublicJWKS should include keys of ALL purposes (webhook receivers look up by kid)', async () => {
    mockPrisma.signingKey.findMany.mockResolvedValue([
      { kid: 'kid-token', publicKey, algorithm: 'RS256', status: 'ACTIVE' },
      { kid: 'kid-webhook', publicKey, algorithm: 'RS256', status: 'ACTIVE' },
    ]);

    const jwks = await service.getPublicJWKS();

    const kids = jwks.keys.map((k) => k.kid);
    expect(kids).toContain('kid-token');
    expect(kids).toContain('kid-webhook');
    // The JWKS query must NOT filter by purpose
    const where = mockPrisma.signingKey.findMany.mock.calls[0][0].where;
    expect(where).not.toHaveProperty('purpose');
  });
});
