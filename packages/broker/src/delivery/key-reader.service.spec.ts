import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { KeyReaderService } from './key-reader.service';

/**
 * Proves byte-compatibility with the backend:
 *  - encrypts a real RSA private key EXACTLY like KeyEncryptionService
 *    (AES-256-GCM, iv:authTag:cipher hex, MASTER_SECRET hex key),
 *  - lets KeyReaderService decrypt + sign,
 *  - verifies the signature with the matching public key the way receivers
 *    do (crypto.verify RSA-SHA256 over the raw input).
 */
describe('KeyReaderService', () => {
  const masterSecret = crypto.randomBytes(32).toString('hex');

  // Real RSA key pair, PEM-encoded like KeyManagerService generates.
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  /** Encrypt exactly like the backend's KeyEncryptionService.encrypt(). */
  function encryptLikeBackend(plaintext: string): string {
    const key = Buffer.from(masterSecret, 'hex');
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  const mockPrisma = {
    signingKey: { findFirst: jest.fn() },
  };

  const mockConfig = {
    getOrThrow: jest.fn(),
  };

  let service: KeyReaderService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

    mockConfig.getOrThrow.mockReturnValue(masterSecret);
    mockPrisma.signingKey.findFirst.mockResolvedValue({
      kid: 'key_test_1',
      privateKey: encryptLikeBackend(privateKey),
      publicKey,
      status: 'ACTIVE',
      purpose: 'WEBHOOK',
      algorithm: 'RS256',
    });

    service = new KeyReaderService(
      mockPrisma as unknown as PrismaService,
      mockConfig as unknown as ConfigService,
    );
    service.onModuleInit();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should reject a malformed MASTER_SECRET', () => {
    mockConfig.getOrThrow.mockReturnValue('not-hex');
    const bad = new KeyReaderService(
      mockPrisma as unknown as PrismaService,
      mockConfig as unknown as ConfigService,
    );
    expect(() => bad.onModuleInit()).toThrow('64-character hex');
  });

  it('should decrypt the backend-encrypted key and produce a verifiable RSA-SHA256 signature', async () => {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const body = JSON.stringify({ id: 'evt-1', type: 'user.created' });
    const input = `${timestamp}.${body}`;

    const { signature, kid } = await service.sign(input);

    expect(kid).toBe('key_test_1');
    // Verify exactly like examples/bff-express/src/webhooks.ts does.
    const verified = crypto.verify(
      'RSA-SHA256',
      Buffer.from(input),
      crypto.createPublicKey(publicKey),
      Buffer.from(signature, 'base64'),
    );
    expect(verified).toBe(true);
  });

  it('should throw (never generate) when no ACTIVE key exists', async () => {
    mockPrisma.signingKey.findFirst.mockResolvedValue(null);

    await expect(service.sign('anything')).rejects.toThrow(
      'No ACTIVE signing key',
    );
  });

  it('should throw when the key was encrypted with a different MASTER_SECRET', async () => {
    const otherSecret = crypto.randomBytes(32).toString('hex');
    const key = Buffer.from(otherSecret, 'hex');
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let encrypted = cipher.update(privateKey, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    mockPrisma.signingKey.findFirst.mockResolvedValue({
      kid: 'key_test_2',
      privateKey: `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${encrypted}`,
      status: 'ACTIVE',
    });

    await expect(service.sign('anything')).rejects.toThrow();
  });

  it('should cache the decrypted key across sign calls', async () => {
    await service.sign('one');
    await service.sign('two');

    expect(mockPrisma.signingKey.findFirst).toHaveBeenCalledTimes(1);
  });

  // ===========================================================================
  // Key preference order: WEBHOOK purpose > token-key fallback
  // ===========================================================================

  describe('key preference', () => {
    it('should prefer the ACTIVE WEBHOOK-purpose key', async () => {
      const { kid } = await service.sign('input');

      expect(kid).toBe('key_test_1');
      expect(mockPrisma.signingKey.findFirst).toHaveBeenCalledWith({
        where: { status: 'ACTIVE', purpose: 'WEBHOOK' },
      });
      // Found on the first (webhook) query — no fallback lookup
      expect(mockPrisma.signingKey.findFirst).toHaveBeenCalledTimes(1);
    });

    it('should fall back to the ACTIVE token key when no webhook key exists yet', async () => {
      const warnSpy = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      mockPrisma.signingKey.findFirst
        .mockResolvedValueOnce(null) // WEBHOOK query — nothing yet
        .mockResolvedValueOnce({
          kid: 'key_token_1',
          privateKey: encryptLikeBackend(privateKey),
          publicKey,
          status: 'ACTIVE',
          purpose: 'TOKEN',
          algorithm: 'RS256',
        });

      const { kid, signature } = await service.sign('input');

      expect(kid).toBe('key_token_1');
      // Second query is the unfiltered ACTIVE fallback
      expect(mockPrisma.signingKey.findFirst).toHaveBeenNthCalledWith(2, {
        where: { status: 'ACTIVE' },
      });
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('falling back'),
      );
      // Fallback key still produces a valid signature
      const verified = crypto.verify(
        'RSA-SHA256',
        Buffer.from('input'),
        crypto.createPublicKey(publicKey),
        Buffer.from(signature, 'base64'),
      );
      expect(verified).toBe(true);
    });

    it('should throw when no ACTIVE key of any purpose exists', async () => {
      mockPrisma.signingKey.findFirst.mockResolvedValue(null);

      await expect(service.sign('input')).rejects.toThrow(
        'No ACTIVE signing key',
      );
    });
  });
});
