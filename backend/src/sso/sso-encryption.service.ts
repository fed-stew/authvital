import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

/**
 * Handles encryption/decryption of SSO provider client secrets
 * Uses AES-256-GCM for authenticated encryption
 * 
 * Encryption key is derived from SIGNING_KEY_SECRET with a domain separator,
 * ensuring SSO secrets use a different key than JWT signing.
 */
@Injectable()
export class SsoEncryptionService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly keyLength = 32; // 256 bits
  private readonly ivLength = 16;
  private readonly tagLength = 16;
  private readonly encryptionKey: Buffer;

  constructor(private readonly configService: ConfigService) {
    const signingSecret = this.configService.getOrThrow<string>('SIGNING_KEY_SECRET');

    // Derive encryption key from signing secret with domain separator
    // This ensures SSO secrets use a different key than JWT signing
    this.encryptionKey = crypto
      .createHash('sha256')
      .update(signingSecret + ':sso-secrets')
      .digest();
  }

  /**
   * Encrypt a client secret for storage
   * Returns base64-encoded string: iv + tag + ciphertext
   */
  encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(this.ivLength);
    const cipher = crypto.createCipheriv(this.algorithm, this.encryptionKey, iv);

    let encrypted = cipher.update(plaintext, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);

    const tag = cipher.getAuthTag();

    // Combine: IV (16) + Tag (16) + Ciphertext
    const combined = Buffer.concat([iv, tag, encrypted]);
    return combined.toString('base64');
  }

  /**
   * Decrypt a client secret from storage
   */
  decrypt(encryptedBase64: string): string {
    const combined = Buffer.from(encryptedBase64, 'base64');

    const iv = combined.subarray(0, this.ivLength);
    const tag = combined.subarray(this.ivLength, this.ivLength + this.tagLength);
    const ciphertext = combined.subarray(this.ivLength + this.tagLength);

    const decipher = crypto.createDecipheriv(this.algorithm, this.encryptionKey, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(ciphertext);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return decrypted.toString('utf8');
  }
}
