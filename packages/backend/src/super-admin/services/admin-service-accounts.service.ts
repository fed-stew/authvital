import {
  Injectable,
  NotFoundException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { ApiKeyService } from '../../auth/api-key.service';

/**
 * Handles service account (machine user) operations for tenants.
 * Service accounts are machine users with API keys for programmatic access.
 */
@Injectable()
export class AdminServiceAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => ApiKeyService))
    private readonly apiKeyService: ApiKeyService,
  ) {}

  /**
   * Create a service account (machine user) for a tenant
   * Returns the API key ONCE - it cannot be retrieved again
   */
  async createServiceAccount(
    tenantId: string,
    name: string,
    roleIds: string[] = [],
    description?: string,
  ) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const uuid = crypto.randomUUID();
    const serviceEmail = `service+${uuid}@system.local`;

    const machineUser = await this.prisma.user.create({
      data: {
        email: serviceEmail,
        passwordHash: null,
        isMachine: true,
        displayName: name,
        nickname: description || null,
      },
    });

    const membership = await this.prisma.membership.create({
      data: {
        userId: machineUser.id,
        tenantId: tenantId,
        status: 'ACTIVE',
        joinedAt: new Date(),
      },
    });

    if (roleIds.length > 0) {
      const validRoles = await this.prisma.role.findMany({
        where: { id: { in: roleIds } },
      });

      if (validRoles.length > 0) {
        await this.prisma.membershipRole.createMany({
          data: validRoles.map((role) => ({
            membershipId: membership.id,
            roleId: role.id,
          })),
        });
      }
    }

    const apiKeyResult = await this.apiKeyService.generateApiKey(
      machineUser.id,
      name,
      ['*'],
      undefined,
      description,
    );

    return {
      success: true,
      serviceAccount: {
        id: machineUser.id,
        name,
        description,
        email: serviceEmail,
        membershipId: membership.id,
        createdAt: machineUser.createdAt,
      },
      apiKey: {
        key: apiKeyResult.key,
        keyId: apiKeyResult.keyId,
        prefix: apiKeyResult.prefix,
      },
      warning: 'Store this API key securely. It will not be shown again.',
    };
  }

  /**
   * List service accounts for a tenant
   */
  async listTenantServiceAccounts(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const serviceAccounts = await this.prisma.membership.findMany({
      where: {
        tenantId,
        user: { isMachine: true },
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            displayName: true,
            nickname: true,
            createdAt: true,
            apiKeys: {
              select: {
                id: true,
                name: true,
                prefix: true,
                description: true,
                lastUsedAt: true,
                isActive: true,
                createdAt: true,
              },
            },
          },
        },
        membershipRoles: {
          include: {
            role: {
              select: {
                id: true,
                name: true,
                slug: true,
                application: {
                  select: { id: true, name: true },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return serviceAccounts.map((sa) => ({
      id: sa.user.id,
      membershipId: sa.id,
      name: sa.user.displayName || 'Unnamed',
      description: sa.user.nickname || undefined,
      email: sa.user.email,
      createdAt: sa.user.createdAt,
      apiKey: sa.user.apiKeys[0] || null,
      roles: sa.membershipRoles.map((mr) => ({
        id: mr.role.id,
        name: mr.role.name,
        application: mr.role.application,
      })),
    }));
  }

  /**
   * Revoke (delete) a service account
   */
  async revokeServiceAccount(tenantId: string, serviceAccountId: string) {
    const membership = await this.prisma.membership.findFirst({
      where: {
        tenantId,
        user: {
          id: serviceAccountId,
          isMachine: true,
        },
      },
      include: {
        user: true,
      },
    });

    if (!membership) {
      throw new NotFoundException('Service account not found in this tenant');
    }

    await this.prisma.user.delete({
      where: { id: serviceAccountId },
    });

    return {
      success: true,
      message: 'Service account revoked',
    };
  }

  /**
   * Update service account roles
   */
  async updateServiceAccountRoles(
    tenantId: string,
    serviceAccountId: string,
    roleIds: string[],
  ) {
    const membership = await this.prisma.membership.findFirst({
      where: {
        tenantId,
        user: {
          id: serviceAccountId,
          isMachine: true,
        },
      },
    });

    if (!membership) {
      throw new NotFoundException('Service account not found in this tenant');
    }

    await this.prisma.membershipRole.deleteMany({
      where: { membershipId: membership.id },
    });

    if (roleIds.length > 0) {
      const validRoles = await this.prisma.role.findMany({
        where: { id: { in: roleIds } },
      });

      if (validRoles.length > 0) {
        await this.prisma.membershipRole.createMany({
          data: validRoles.map((role) => ({
            membershipId: membership.id,
            roleId: role.id,
          })),
        });
      }
    }

    return { success: true, message: 'Roles updated' };
  }
}
