import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

/**
 * KeyReaderService — READ-ONLY access to the backend's signing keys.
 *
 * Replicates ONLY the decrypt+sign path of the backend's
 * KeyManagerService/KeyEncryptionService (packages/backend/src/oauth/):
 *  - Prefers the ACTIVE WEBHOOK-purpose key from `signing_keys` (dedicated
 *    webhook keypair — the broker never needs JWT token-signing material).
 *  - Falls back to the ACTIVE TOKEN key when no webhook key exists yet
 *    (mid-rotation / upgrade windows must never break delivery; core
 *    generates the webhook key on its next startup).
 *  - Decrypts the private key with AES-256-GCM using MASTER_SECRET
 *    (identical wire format: `iv:authTag:ciphertext`, hex encoded).
 *  - Signs with RSA-SHA256, base64 output — byte-identical to the backend's
 *    signPayload() in sync-event.service.ts / system-webhook.service.ts.
 *
 * Key GENERATION and ROTATION stay in core. If no active key exists or
 * decryption fails (MASTER_SECRET mismatch), this service throws — the
 * broker must never self-heal by minting keys.
 */
@Injectable()
export class KeyReaderService implements OnModuleInit {
  private readonly logger = new Logger(KeyReaderService.name);

  private masterKey!: Buffer;

  // Same cache strategy as the backend's KeyManagerService (60s TTL) so a
  // rotation in core is picked up within a minute.
  private cachedKey: { kid: string; privateKey: crypto.KeyObject } | null =
    null;
  private cacheExpiresAt = 0;
  private readonly CACHE_TTL_MS = 60 * 1000;

  private readonly ALGORITHM = 'aes-256-gcm';

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit(): void {
    const secret = this.configService.getOrThrow<string>('MASTER_SECRET');

    if (!/^[a-fA-F0-9]{64}$/.test(secret)) {
      throw new Error(
        'MASTER_SECRET must be a 64-character hex string (32 bytes) — ' +
          'use the same value as the AuthVital backend.',
      );
    }

    this.masterKey = Buffer.from(secret, 'hex');
    this.logger.log(' Key reader initialized (read-only, no key generation)');
  }

  /**
   * Sign an input string with the active key.
   * RSA-SHA256, base64 — byte-identical to the backend's signPayload().
   */
  async sign(input: string): Promise<{ signature: string; kid: string }> {
    const { kid, privateKey } = await this.getActiveKey();

    const sign = crypto.createSign('RSA-SHA256');
    sign.update(input);
    const signature = sign.sign(privateKey, 'base64');

    return { signature, kid };
  }

  /**
   * Load (and cache) the ACTIVE signing key.
   * Preference order: WEBHOOK purpose > any other ACTIVE key (fallback for
   * upgrade windows where the dedicated webhook key does not exist yet).
   */
  private async getActiveKey(): Promise<{
    kid: string;
    privateKey: crypto.KeyObject;
  }> {
    if (this.cachedKey && Date.now() < this.cacheExpiresAt) {
      return this.cachedKey;
    }

    let activeKey = await this.prisma.signingKey.findFirst({
      where: { status: 'ACTIVE', purpose: 'WEBHOOK' },
    });

    if (!activeKey) {
      activeKey = await this.prisma.signingKey.findFirst({
        where: { status: 'ACTIVE' },
      });
      if (activeKey) {
        this.logger.warn(
          `No ACTIVE WEBHOOK-purpose key found — falling back to ` +
            `${activeKey.purpose} key ${activeKey.kid} (core generates the ` +
            `dedicated webhook key on its next startup)`,
        );
      }
    }

    if (!activeKey) {
      // Never generate here — the backend owns key lifecycle. Retryable:
      // core self-heals on its next boot/rotation tick.
      throw new Error(
        'No ACTIVE signing key found — the AuthVital backend owns key generation',
      );
    }

    const pem = this.decrypt(activeKey.privateKey);

    this.cachedKey = {
      kid: activeKey.kid,
      privateKey: crypto.createPrivateKey(pem),
    };
    this.cacheExpiresAt = Date.now() + this.CACHE_TTL_MS;

    return this.cachedKey;
  }

  /**
   * AES-256-GCM decrypt — mirrors KeyEncryptionService.decrypt() exactly
   * (format `iv:authTag:ciphertext`, hex). Throws on tampering/mismatch.
   */
  private decrypt(ciphertext: string): string {
    const parts = ciphertext.split(':');

    if (parts.length !== 3) {
      throw new Error('Invalid encrypted key format');
    }

    const [ivHex, authTagHex, encryptedHex] = parts;

    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const encrypted = Buffer.from(encryptedHex, 'hex');

    const decipher = crypto.createDecipheriv(this.ALGORITHM, this.masterKey, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return decrypted.toString('utf8');
  }
}
