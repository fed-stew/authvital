import { Injectable, OnModuleInit, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service";
import { KeyEncryptionService } from "./key-encryption.service";
import { SigningKeyStatus } from "@prisma/client";
import * as crypto from "crypto";
import * as jose from "jose";

/**
 * Decrypted signing key ready for use
 */
export interface SigningKeyPair {
  kid: string;
  privateKey: crypto.KeyObject;
  publicKey: crypto.KeyObject;
  algorithm: string;
}

/**
 * KeyManager: Database-backed signing key management with rotation support
 *
 * Features:
 * - Generates RSA 2048-bit key pairs
 * - Encrypts private keys at rest using AES-256-GCM
 * - Supports key rotation (ACTIVE -> PASSIVE -> ARCHIVED)
 * - Self-healing: auto-generates key if none exists
 * - Provides JWKS endpoint data for all active/passive keys
 * - Automatic cleanup of old passive keys
 */
@Injectable()
export class KeyManagerService implements OnModuleInit {
  private readonly logger = new Logger(KeyManagerService.name);

  // Cache the active key to avoid DB lookups on every request
  private cachedActiveKey: SigningKeyPair | null = null;
  private cacheExpiresAt = 0;
  private readonly CACHE_TTL_MS = 60 * 1000; // 1 minute cache

  // How long passive keys are kept before archiving (must be > max token lifetime)
  private readonly PASSIVE_KEY_LIFETIME_HOURS = 24;

  // Key rotation interval in seconds (default: 30 days)
  private readonly DEFAULT_ROTATION_INTERVAL_SECONDS = 30 * 24 * 60 * 60; // 30 days
  private readonly rotationIntervalSeconds;

  constructor(
    private readonly prisma: PrismaService,
    private readonly keyEncryption: KeyEncryptionService,
    private readonly configService: ConfigService,
  ) {
    // Load rotation interval from env or use default (30 days)
    const envInterval = this.configService.get<string>(
      "KEY_ROTATION_INTERVAL_SECONDS",
    );
    this.rotationIntervalSeconds = envInterval
      ? parseInt(envInterval, 10)
      : this.DEFAULT_ROTATION_INTERVAL_SECONDS;

    this.logger.log(
      `Key rotation interval: ${this.rotationIntervalSeconds} seconds ` +
        `(${Math.round(this.rotationIntervalSeconds / 86400)} days)`,
    );
  }

  async onModuleInit() {
    // Ensure we have an active signing key on startup
    await this.ensureActiveKey();
    // Check if rotation is needed on startup
    await this.checkAndRotateIfNeeded();
  }

  /**
   * Ensure an active key exists, generate one if not (self-healing)
   */
  private async ensureActiveKey(): Promise<void> {
    const activeKey = await this.prisma.signingKey.findFirst({
      where: { status: SigningKeyStatus.ACTIVE },
    });

    if (!activeKey) {
      this.logger.log("No active signing key found, generating new key...");
      await this.generateKey();
    } else {
      this.logger.log(`🔑 Active signing key loaded: ${activeKey.kid}`);
    }
  }

  // Advisory lock ID for key rotation (consistent across all instances)
  private readonly KEY_ROTATION_LOCK_ID = 8675309; // Just a unique number

  /**
   * Generate a new RSA key pair and save to database
   * - Uses PostgreSQL advisory lock to prevent concurrent rotation
   * - Demotes existing ACTIVE key to PASSIVE
   * - New key becomes ACTIVE
   */
  async generateKey(): Promise<{ kid: string }> {
    // Generate RSA 2048-bit key pair (do this outside the lock)
    const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });

    // Generate unique key ID
    const kid = `key_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;

    // Encrypt the private key before storing
    const encryptedPrivateKey = this.keyEncryption.encrypt(privateKey);

    // Use advisory lock + transaction to prevent race conditions in clustered deployments
    // pg_try_advisory_xact_lock returns true if lock acquired, false if already held
    const result = await this.prisma.$transaction(
      async (tx) => {
        // Try to acquire advisory lock (non-blocking)
        const lockResult = await tx.$queryRaw<
          [{ pg_try_advisory_xact_lock: boolean }]
        >`
        SELECT pg_try_advisory_xact_lock(${this.KEY_ROTATION_LOCK_ID})
      `;

        const lockAcquired = lockResult[0]?.pg_try_advisory_xact_lock;

        if (!lockAcquired) {
          // Another instance is rotating, skip
          this.logger.log(
            "🔒 Key rotation lock held by another instance, skipping...",
          );
          return { kid: null, skipped: true };
        }

        // Double-check: maybe another instance just finished rotating
        const currentActive = await tx.signingKey.findFirst({
          where: { status: SigningKeyStatus.ACTIVE },
          select: { kid: true, createdAt: true },
        });

        // If there's already an active key created in the last minute, skip
        if (currentActive) {
          const keyAgeMs = Date.now() - currentActive.createdAt.getTime();
          if (keyAgeMs < 60000) {
            // Less than 1 minute old
            this.logger.log(
              `🔒 Recent key exists (${currentActive.kid}), skipping rotation`,
            );
            return { kid: currentActive.kid, skipped: true };
          }
        }

        // Demote all existing ACTIVE keys to PASSIVE
        await tx.signingKey.updateMany({
          where: { status: SigningKeyStatus.ACTIVE },
          data: { status: SigningKeyStatus.PASSIVE },
        });

        // Create the new ACTIVE key
        await tx.signingKey.create({
          data: {
            kid,
            privateKey: encryptedPrivateKey,
            publicKey,
            algorithm: "RS256",
            status: SigningKeyStatus.ACTIVE,
          },
        });

        return { kid, skipped: false };
        // Advisory lock is automatically released when transaction commits
      },
      {
        isolationLevel: "Serializable", // Highest isolation for safety
        timeout: 10000, // 10 second timeout
      },
    );

    if (result.skipped) {
      return { kid: result.kid || "" };
    }

    // Invalidate cache
    this.cachedActiveKey = null;
    this.cacheExpiresAt = 0;

    this.logger.log(`🔑 Generated new signing key: ${kid}`);
    return { kid };
  }

  /**
   * Get the active signing key for JWT signing
   * Uses caching to minimize DB lookups
   * Self-heals by generating a key if none exists or decryption fails
   */
  async getSigningKey(): Promise<SigningKeyPair> {
    // Check cache first
    if (this.cachedActiveKey && Date.now() < this.cacheExpiresAt) {
      return this.cachedActiveKey;
    }

    // Fetch from database
    const activeKey = await this.prisma.signingKey.findFirst({
      where: { status: SigningKeyStatus.ACTIVE },
    });

    // Self-healing: generate key if none exists
    if (!activeKey) {
      this.logger.warn(
        "No active key found during signing, generating new key...",
      );
      await this.generateKey();
      return this.getSigningKey(); // Recursive call after generation
    }

    // Try to decrypt private key
    let decryptedPrivateKey: string;
    try {
      decryptedPrivateKey = this.keyEncryption.decrypt(activeKey.privateKey);
    } catch (error: any) {
      // Decryption failed - likely SIGNING_KEY_SECRET changed
      // This happens in dev when the secret is randomly generated each restart
      this.logger.warn(
        `Failed to decrypt key ${activeKey.kid}: ${error.message}. ` +
          "This usually means SIGNING_KEY_SECRET changed. Generating new key...",
      );
      // Archive the old key and generate a new one
      await this.prisma.signingKey.update({
        where: { id: activeKey.id },
        data: { status: SigningKeyStatus.ARCHIVED },
      });
      await this.generateKey();
      return this.getSigningKey(); // Recursive call after generation
    }

    // Convert to KeyObjects
    const keyPair: SigningKeyPair = {
      kid: activeKey.kid,
      privateKey: crypto.createPrivateKey(decryptedPrivateKey),
      publicKey: crypto.createPublicKey(activeKey.publicKey),
      algorithm: activeKey.algorithm,
    };

    // Update cache
    this.cachedActiveKey = keyPair;
    this.cacheExpiresAt = Date.now() + this.CACHE_TTL_MS;

    return keyPair;
  }

  /**
   * Get JWKS (JSON Web Key Set) containing all ACTIVE and PASSIVE keys
   * Used by the /.well-known/jwks.json endpoint
   */
  async getPublicJWKS(): Promise<{ keys: jose.JWK[] }> {
    // Fetch all keys that should be in JWKS (ACTIVE + PASSIVE)
    const keys = await this.prisma.signingKey.findMany({
      where: {
        status: {
          in: [SigningKeyStatus.ACTIVE, SigningKeyStatus.PASSIVE],
        },
        // Exclude expired keys
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: {
        kid: true,
        publicKey: true,
        algorithm: true,
        status: true,
      },
    });

    // Convert each public key to JWK format
    const jwks = await Promise.all(
      keys.map(async (key) => {
        const publicKeyObject = crypto.createPublicKey(key.publicKey);
        const jwk = await jose.exportJWK(publicKeyObject);

        return {
          ...jwk,
          kid: key.kid,
          alg: key.algorithm,
          use: "sig",
        };
      }),
    );

    return { keys: jwks };
  }

  /**
   * Check if the active key needs rotation based on KEY_ROTATION_INTERVAL_SECONDS
   * Rotates automatically if the key is older than the interval
   */
  async checkAndRotateIfNeeded(): Promise<{
    rotated: boolean;
    reason?: string;
  }> {
    const activeKey = await this.prisma.signingKey.findFirst({
      where: { status: SigningKeyStatus.ACTIVE },
      select: { kid: true, createdAt: true },
    });

    if (!activeKey) {
      return { rotated: false, reason: "No active key" };
    }

    const keyAgeSeconds = (Date.now() - activeKey.createdAt.getTime()) / 1000;

    if (keyAgeSeconds >= this.rotationIntervalSeconds) {
      this.logger.log(
        `Active key ${activeKey.kid} is ${Math.round(keyAgeSeconds / 86400)} days old, ` +
          `rotating (interval: ${Math.round(this.rotationIntervalSeconds / 86400)} days)...`,
      );
      await this.rotateKeys();
      return { rotated: true, reason: "Key age exceeded rotation interval" };
    }

    const daysUntilRotation = Math.round(
      (this.rotationIntervalSeconds - keyAgeSeconds) / 86400,
    );
    this.logger.debug(
      `Active key ${activeKey.kid} will rotate in ~${daysUntilRotation} days`,
    );

    return {
      rotated: false,
      reason: `Key not old enough (${daysUntilRotation} days until rotation)`,
    };
  }

  /**
   * Rotate keys: Generate new key, demote current active to passive
   * Call this periodically or on-demand for key rotation
   */
  async rotateKeys(): Promise<{ newKid: string; demotedKid: string | null }> {
    const currentActive = await this.prisma.signingKey.findFirst({
      where: { status: SigningKeyStatus.ACTIVE },
      select: { kid: true },
    });

    const { kid: newKid } = await this.generateKey();

    this.logger.log(
      `Key rotation complete: ${currentActive?.kid || "none"} -> ${newKid}`,
    );

    return {
      newKid,
      demotedKid: currentActive?.kid || null,
    };
  }

  /**
   * Cleanup old PASSIVE keys (older than PASSIVE_KEY_LIFETIME_HOURS)
   * Moves them to ARCHIVED status
   */
  async cleanup(): Promise<{ archivedCount: number }> {
    const cutoffDate = new Date();
    cutoffDate.setHours(
      cutoffDate.getHours() - this.PASSIVE_KEY_LIFETIME_HOURS,
    );

    const result = await this.prisma.signingKey.updateMany({
      where: {
        status: SigningKeyStatus.PASSIVE,
        updatedAt: { lt: cutoffDate },
      },
      data: {
        status: SigningKeyStatus.ARCHIVED,
      },
    });

    if (result.count > 0) {
      this.logger.log(`🧹 Archived ${result.count} old passive key(s)`);
    }

    return { archivedCount: result.count };
  }

  /**
   * Scheduled maintenance job - runs every hour
   * - Checks if key rotation is needed
   * - Cleans up old passive keys
   *
   * Uses advisory locks so only one instance rotates in clustered deployments.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async scheduledMaintenance(): Promise<void> {
    this.logger.debug("Running scheduled key maintenance...");

    // Check if rotation is needed
    await this.checkAndRotateIfNeeded();

    // Clean up old passive keys
    await this.cleanup();
  }

  /**
   * Revoke a specific key (e.g., if compromised)
   */
  async revokeKey(kid: string): Promise<void> {
    const key = await this.prisma.signingKey.findUnique({
      where: { kid },
    });

    if (!key) {
      throw new Error(`Key not found: ${kid}`);
    }

    if (key.status === SigningKeyStatus.ACTIVE) {
      // If revoking the active key, generate a new one first
      await this.generateKey();
    }

    await this.prisma.signingKey.update({
      where: { kid },
      data: { status: SigningKeyStatus.REVOKED },
    });

    // Invalidate cache if this was the cached key
    if (this.cachedActiveKey?.kid === kid) {
      this.cachedActiveKey = null;
      this.cacheExpiresAt = 0;
    }

    this.logger.warn(`Key revoked: ${kid}`);
  }

  /**
   * Get key statistics for monitoring
   */
  async getKeyStats(): Promise<{
    active: number;
    passive: number;
    archived: number;
    revoked: number;
    activeKid: string | null;
  }> {
    const counts = await this.prisma.signingKey.groupBy({
      by: ["status"],
      _count: true,
    });

    const activeKey = await this.prisma.signingKey.findFirst({
      where: { status: SigningKeyStatus.ACTIVE },
      select: { kid: true },
    });

    const stats = {
      active: 0,
      passive: 0,
      archived: 0,
      revoked: 0,
      activeKid: activeKey?.kid || null,
    };

    for (const item of counts) {
      const status = item.status.toLowerCase() as keyof typeof stats;
      if (status in stats && status !== "activeKid") {
        (stats as any)[status] = item._count;
      }
    }

    return stats;
  }
}
