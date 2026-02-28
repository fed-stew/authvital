import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

/**
 * KeyEncryptionService: Encrypts/decrypts private keys using AES-256-GCM
 * 
 * Uses SIGNING_KEY_SECRET environment variable as the Master Key (KEK).
 * Format: iv:authTag:encryptedContent (stored as single string)
 * 
 * SECURITY: Never logs private keys or master key!
 */
@Injectable()
export class KeyEncryptionService implements OnModuleInit {
  private readonly logger = new Logger(KeyEncryptionService.name);
  private masterKey!: Buffer;

  private readonly ALGORITHM = 'aes-256-gcm';
  private readonly IV_LENGTH = 16; // 128 bits
  private readonly AUTH_TAG_LENGTH = 16; // 128 bits

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    // SIGNING_KEY_SECRET is validated at startup - this is a safety check
    const secret = this.configService.getOrThrow<string>('SIGNING_KEY_SECRET');

    // Validate format: must be 64-character hex string (32 bytes)
    if (!/^[a-fA-F0-9]{64}$/.test(secret)) {
      throw new Error(
        'SIGNING_KEY_SECRET must be a 64-character hex string (32 bytes). ' +
        `Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
      );
    }

    this.masterKey = Buffer.from(secret, 'hex');
    this.logger.log('🔐 Key encryption service initialized');
  }

  /**
   * Encrypt a private key using AES-256-GCM
   * Returns format: iv:authTag:encryptedContent (hex encoded)
   */
  encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(this.IV_LENGTH);
    const cipher = crypto.createCipheriv(this.ALGORITHM, this.masterKey, iv);
    
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    // Format: iv:authTag:encryptedContent
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  /**
   * Decrypt a private key using AES-256-GCM
   * Expects format: iv:authTag:encryptedContent (hex encoded)
   */
  decrypt(ciphertext: string): string {
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

  /**
   * Check if the service is properly initialized
   */
  isInitialized(): boolean {
    return !!this.masterKey;
  }
}
