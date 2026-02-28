import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

export interface CreateInstanceApiKeyDto {
  name: string;
  description?: string;
  permissions?: string[];
  expiresAt?: Date;
}

@Injectable()
export class InstanceApiKeyService {
  private readonly SALT_ROUNDS = 12;
  private readonly KEY_PREFIX = 'ik_live_';

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generate a new instance API key
   * Returns the full key only once - it cannot be retrieved later
   */
  async createApiKey(dto: CreateInstanceApiKeyDto): Promise<{
    key: string;
    record: {
      id: string;
      prefix: string;
      name: string;
      permissions: string[];
      createdAt: Date;
    };
  }> {
    // Generate secure random key
    const randomPart = crypto.randomBytes(32).toString('hex');
    const fullKey = `${this.KEY_PREFIX}${randomPart}`;
    const prefix = fullKey.substring(0, 12); // "ik_live_xxxx"

    // Hash for storage
    const keyHash = await bcrypt.hash(fullKey, this.SALT_ROUNDS);

    const record = await this.prisma.instanceApiKey.create({
      data: {
        keyHash,
        prefix,
        name: dto.name,
        description: dto.description,
        permissions: dto.permissions || ['instance:*'],
        expiresAt: dto.expiresAt,
      },
    });

    return {
      key: fullKey, // Only returned once!
      record: {
        id: record.id,
        prefix: record.prefix,
        name: record.name,
        permissions: record.permissions,
        createdAt: record.createdAt,
      },
    };
  }

  /**
   * Validate an API key and return the record if valid
   */
  async validateApiKey(key: string): Promise<{
    id: string;
    name: string;
    permissions: string[];
  } | null> {
    if (!key.startsWith(this.KEY_PREFIX)) {
      return null;
    }

    // Find all active keys and check against each (necessary because bcrypt)
    const keys = await this.prisma.instanceApiKey.findMany({
      where: {
        isActive: true,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
    });

    for (const record of keys) {
      const isValid = await bcrypt.compare(key, record.keyHash);
      if (isValid) {
        // Update last used timestamp
        await this.prisma.instanceApiKey.update({
          where: { id: record.id },
          data: { lastUsedAt: new Date() },
        });

        return {
          id: record.id,
          name: record.name,
          permissions: record.permissions,
        };
      }
    }

    return null;
  }

  /**
   * List all API keys (without the actual key values)
   */
  async listApiKeys() {
    return this.prisma.instanceApiKey.findMany({
      select: {
        id: true,
        prefix: true,
        name: true,
        description: true,
        permissions: true,
        lastUsedAt: true,
        expiresAt: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Revoke an API key
   */
  async revokeApiKey(id: string) {
    const key = await this.prisma.instanceApiKey.findUnique({
      where: { id },
    });

    if (!key) {
      throw new NotFoundException('API key not found');
    }

    await this.prisma.instanceApiKey.update({
      where: { id },
      data: { isActive: false },
    });

    return { success: true, message: 'API key revoked' };
  }

  /**
   * Delete an API key permanently
   */
  async deleteApiKey(id: string) {
    const key = await this.prisma.instanceApiKey.findUnique({
      where: { id },
    });

    if (!key) {
      throw new NotFoundException('API key not found');
    }

    await this.prisma.instanceApiKey.delete({
      where: { id },
    });

    return { success: true, message: 'API key deleted' };
  }
}
