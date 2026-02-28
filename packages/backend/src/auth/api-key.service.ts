import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  UnauthorizedException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import * as bcrypt from "bcrypt";
import * as crypto from "crypto";

export interface ApiKeyValidationResult {
  userId: string;
  user: {
    id: string;
    email: string | null;
  };
  keyId: string;
  keyName: string;
  permissions: string[];
}

@Injectable()
export class ApiKeyService {
  private readonly SALT_ROUNDS = 12;
  private readonly KEY_PREFIX = "sk_live_";
  private readonly KEY_BYTES = 32;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generate a new API key for a user
   * Returns the raw key ONCE - it cannot be retrieved again
   */
  async generateApiKey(
    userId: string,
    name: string,
    permissions: string[] = [],
    expiresAt?: Date,
    description?: string,
  ): Promise<{ key: string; keyId: string; prefix: string }> {
    // Verify user exists
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    // Generate secure random bytes
    const randomBytes = crypto.randomBytes(this.KEY_BYTES);
    const keyBody = randomBytes.toString("base64url"); // URL-safe base64
    const rawKey = `${this.KEY_PREFIX}${keyBody}`;

    // Create display prefix (first 8 chars after sk_live_)
    const displayPrefix = `${this.KEY_PREFIX}${keyBody.substring(0, 8)}`;

    // Hash the full key for storage
    const keyHash = await bcrypt.hash(rawKey, this.SALT_ROUNDS);

    // Store in database
    const apiKey = await this.prisma.apiKey.create({
      data: {
        userId,
        name,
        description,
        keyHash,
        prefix: displayPrefix,
        permissions,
        expiresAt,
      },
    });

    return {
      key: rawKey, // Return ONCE - never stored in plain text
      keyId: apiKey.id,
      prefix: displayPrefix,
    };
  }

  /**
   * Validate an API key and check subscription status
   * Updates lastUsedAt asynchronously
   */
  async validateApiKey(rawKey: string): Promise<ApiKeyValidationResult> {
    // Basic format check
    if (!rawKey.startsWith(this.KEY_PREFIX)) {
      throw new UnauthorizedException("Invalid API key format");
    }

    // Extract prefix for candidate lookup (optimization)
    const keyBody = rawKey.slice(this.KEY_PREFIX.length);
    const searchPrefix = `${this.KEY_PREFIX}${keyBody.substring(0, 8)}`;

    // Find candidate keys by prefix
    const candidates = await this.prisma.apiKey.findMany({
      where: {
        prefix: searchPrefix,
        isActive: true,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            memberships: {
              where: { status: "ACTIVE" },
              include: {
                tenant: {
                  include: {
                    appSubscriptions: {
                      where: { status: { in: ["ACTIVE", "TRIALING"] } },
                      include: {
                        licenseType: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (candidates.length === 0) {
      throw new UnauthorizedException("Invalid API key");
    }

    // Find matching key by hash comparison
    let matchedKey: (typeof candidates)[0] | null = null;
    for (const candidate of candidates) {
      const isMatch = await bcrypt.compare(rawKey, candidate.keyHash);
      if (isMatch) {
        matchedKey = candidate;
        break;
      }
    }

    if (!matchedKey) {
      throw new UnauthorizedException("Invalid API key");
    }

    // Check expiration
    if (matchedKey.expiresAt && matchedKey.expiresAt < new Date()) {
      throw new UnauthorizedException("API key has expired");
    }

    // LICENSE POOL: Check if tenant has any active subscriptions
    // Note: In License Pool model, having a subscription doesn't mean user has access.
    // Actual access is checked via LicenseAssignment, but we can verify tenant is "active"
    matchedKey.user.memberships.some((membership: any) => {
      return membership.tenant.appSubscriptions.some(
        (sub: any) => sub.status === "ACTIVE" || sub.status === "TRIALING",
      );
    });

    // Note: We now allow users without plans (free tier)
    // Uncomment below to enforce plan requirement
    // if (!hasValidPlan && matchedKey.user.memberships.length > 0) {
    //   throw new ForbiddenException('No active plan. Please subscribe to continue.');
    // }

    // Update lastUsedAt asynchronously (don't block response)
    this.updateLastUsed(matchedKey.id).catch((err) =>
      console.error("Failed to update API key lastUsedAt:", err),
    );

    return {
      userId: matchedKey.user.id,
      user: {
        id: matchedKey.user.id,
        email: matchedKey.user.email,
      },
      keyId: matchedKey.id,
      keyName: matchedKey.name,
      permissions: matchedKey.permissions,
    };
  }

  /**
   * Update lastUsedAt timestamp (fire and forget)
   */
  private async updateLastUsed(keyId: string): Promise<void> {
    await this.prisma.apiKey.update({
      where: { id: keyId },
      data: { lastUsedAt: new Date() },
    });
  }

  /**
   * List all API keys for a user (without exposing hashes)
   */
  async listUserApiKeys(userId: string) {
    const keys = await this.prisma.apiKey.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        prefix: true,
        permissions: true,
        isActive: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return keys;
  }

  /**
   * Revoke (delete) an API key
   */
  async revokeApiKey(keyId: string, userId: string): Promise<void> {
    const key = await this.prisma.apiKey.findUnique({
      where: { id: keyId },
    });

    if (!key) {
      throw new NotFoundException("API key not found");
    }

    if (key.userId !== userId) {
      throw new ForbiddenException("You do not own this API key");
    }

    await this.prisma.apiKey.delete({
      where: { id: keyId },
    });
  }

  /**
   * Update API key (name, permissions, active status)
   */
  async updateApiKey(
    keyId: string,
    userId: string,
    updates: {
      name?: string;
      permissions?: string[];
      isActive?: boolean;
    },
  ) {
    const key = await this.prisma.apiKey.findUnique({
      where: { id: keyId },
    });

    if (!key) {
      throw new NotFoundException("API key not found");
    }

    if (key.userId !== userId) {
      throw new ForbiddenException("You do not own this API key");
    }

    return this.prisma.apiKey.update({
      where: { id: keyId },
      data: updates,
      select: {
        id: true,
        name: true,
        prefix: true,
        permissions: true,
        isActive: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true,
      },
    });
  }

  /**
   * Check if user has permission via API key
   */
  hasPermission(keyPermissions: string[], requiredPermission: string): boolean {
    // Wildcard support: "*" grants all, "resource:*" grants all actions on resource
    if (keyPermissions.includes("*")) {
      return true;
    }

    // Check exact match
    if (keyPermissions.includes(requiredPermission)) {
      return true;
    }

    // Check wildcard for resource (e.g., "users:*" matches "users:read")
    const [resource] = requiredPermission.split(":");
    if (keyPermissions.includes(`${resource}:*`)) {
      return true;
    }

    return false;
  }
}
