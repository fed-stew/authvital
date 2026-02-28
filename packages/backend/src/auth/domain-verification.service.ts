import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as dns from 'dns';
import { promisify } from 'util';
import * as crypto from 'crypto';

const resolveTxt = promisify(dns.resolveTxt);

export interface DomainVerificationResult {
  success: boolean;
  domain: {
    id: string;
    domainName: string;
    isVerified: boolean;
    verifiedAt: Date | null;
  };
  message: string;
}

export interface UserMigrationResult {
  migratedCount: number;
  users: Array<{
    id: string;
    email: string;
    previousTenantId: string | null;
  }>;
}

@Injectable()
export class DomainVerificationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Initiate domain verification for a tenant
   * Creates or returns existing domain record with verification token
   */
  async initiateDomainVerification(
    tenantId: string,
    domainName: string,
    userId: string,
  ) {
    // Validate user is owner of tenant
    await this.validateTenantOwnership(tenantId, userId);

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    // Check if domain is already verified by another tenant in the instance
    const existingVerified = await this.prisma.domain.findFirst({
      where: {
        domainName: domainName.toLowerCase(),
        isVerified: true,
        NOT: {
          tenantId,
        },
      },
      include: {
        tenant: true,
      },
    });

    if (existingVerified) {
      throw new ConflictException(
        `Domain is already verified by tenant: ${existingVerified.tenant.name}`,
      );
    }

    // Get or create domain record
    let domain = await this.prisma.domain.findFirst({
      where: {
        domainName: domainName.toLowerCase(),
        tenantId,
      },
    });

    if (!domain) {
      const verificationToken = this.generateVerificationToken();
      domain = await this.prisma.domain.create({
        data: {
          domainName: domainName.toLowerCase(),
          verificationToken,
          isVerified: false,
          tenantId,
        },
      });
    }

    return {
      domain: {
        id: domain.id,
        domainName: domain.domainName,
        isVerified: domain.isVerified,
        verifiedAt: domain.verifiedAt,
      },
      verificationToken: domain.verificationToken,
      dnsInstructions: this.getDnsInstructions(domain.domainName, domain.verificationToken),
    };
  }

  /**
   * Verify domain via DNS TXT record
   */
  async verifyDomain(
    domainId: string,
    userId: string,
  ): Promise<DomainVerificationResult> {
    const domain = await this.prisma.domain.findUnique({
      where: { id: domainId },
      include: {
        tenant: true,
      },
    });

    if (!domain) {
      throw new NotFoundException('Domain not found');
    }

    // Validate user is owner of tenant
    await this.validateTenantOwnership(domain.tenantId, userId);

    if (domain.isVerified) {
      return {
        success: true,
        domain: {
          id: domain.id,
          domainName: domain.domainName,
          isVerified: true,
          verifiedAt: domain.verifiedAt,
        },
        message: 'Domain is already verified',
      };
    }

    // Check DNS TXT record
    const isVerified = await this.checkDnsTxtRecord(
      domain.domainName,
      domain.verificationToken,
    );

    if (!isVerified) {
      return {
        success: false,
        domain: {
          id: domain.id,
          domainName: domain.domainName,
          isVerified: false,
          verifiedAt: null,
        },
        message: 'DNS TXT record not found or does not match verification token',
      };
    }

    // Mark domain as verified
    const updatedDomain = await this.prisma.domain.update({
      where: { id: domainId },
      data: {
        isVerified: true,
        verifiedAt: new Date(),
      },
    });

    return {
      success: true,
      domain: {
        id: updatedDomain.id,
        domainName: updatedDomain.domainName,
        isVerified: true,
        verifiedAt: updatedDomain.verifiedAt,
      },
      message: 'Domain verified successfully',
    };
  }

  /**
   * Find users with email matching a verified domain that can be migrated
   */
  async findMigratableUsers(domainId: string, userId: string) {
    const domain = await this.prisma.domain.findUnique({
      where: { id: domainId },
      include: {
        tenant: true,
      },
    });

    if (!domain) {
      throw new NotFoundException('Domain not found');
    }

    if (!domain.isVerified) {
      throw new BadRequestException('Domain must be verified before migrating users');
    }

    // Validate user is owner of tenant
    await this.validateTenantOwnership(domain.tenantId, userId);

    // Find all users with this email domain who are NOT already members of this tenant
    const users = await this.prisma.user.findMany({
      where: {
        email: {
          endsWith: `@${domain.domainName}`,
        },
        isMachine: false,
        // Exclude users already in this tenant
        NOT: {
          memberships: {
            some: {
              tenantId: domain.tenantId,
            },
          },
        },
      },
      select: {
        id: true,
        email: true,
        givenName: true,
        familyName: true,
        memberships: {
          where: {},  // Get all memberships
          select: {
            tenant: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });

    return {
      domain: {
        id: domain.id,
        domainName: domain.domainName,
      },
      targetTenant: {
        id: domain.tenant.id,
        name: domain.tenant.name,
      },
      migratableUsers: users.map((user) => ({
        id: user.id,
        email: user.email,
        givenName: user.givenName,
        familyName: user.familyName,
        currentTenants: user.memberships.map((m) => m.tenant),
      })),
      count: users.length,
    };
  }

  /**
   * Migrate users with matching email domain to the verified tenant
   * Options:
   *   - addToTenant: Add users as members (keep existing memberships)
   *   - transferOwnership: Transfer tenant ownership if they own a single-person tenant
   */
  async migrateUsers(
    domainId: string,
    userIds: string[],
    userId: string,
    options: {
      removeFromOldTenants?: boolean;
    } = {},
  ): Promise<UserMigrationResult> {
    const domain = await this.prisma.domain.findUnique({
      where: { id: domainId },
      include: {
        tenant: true,
      },
    });

    if (!domain) {
      throw new NotFoundException('Domain not found');
    }

    if (!domain.isVerified) {
      throw new BadRequestException('Domain must be verified before migrating users');
    }

    // Validate user is owner of tenant
    await this.validateTenantOwnership(domain.tenantId, userId);

    // Get users to migrate
    const users = await this.prisma.user.findMany({
      where: {
        id: { in: userIds },
        email: {
          endsWith: `@${domain.domainName}`,
        },
        isMachine: false,
      },
      include: {
        memberships: {
          include: {
            tenant: true,
          },
        },
      },
    });

    const results: UserMigrationResult['users'] = [];

    await this.prisma.$transaction(async (tx) => {
      for (const user of users) {
        // Check if already a member
        const existingMembership = user.memberships.find(
          (m) => m.tenantId === domain.tenantId,
        );

        if (existingMembership) {
          continue; // Skip if already a member
        }

        // Get previous tenant (if any owned)
        // Find if user owns any tenant (has 'owner' TenantRole)
        const previousTenant = user.memberships[0];  // Just use first membership for logging

        // Optionally remove from old tenants
        if (options.removeFromOldTenants) {
          await tx.membership.deleteMany({
            where: {
              userId: user.id,
              tenantId: { not: domain.tenantId },
            },
          });
        }

        // Create new membership
        await tx.membership.create({
          data: {
            userId: user.id,
            tenantId: domain.tenantId,
            status: 'ACTIVE',
            joinedAt: new Date(),
          },
        });

        results.push({
          id: user.id,
          email: user.email!,
          previousTenantId: previousTenant?.tenantId || null,
        });
      }
    });

    return {
      migratedCount: results.length,
      users: results,
    };
  }

  /**
   * Validate that user is an owner of the tenant
   */
  private async validateTenantOwnership(tenantId: string, userId: string) {
    const membership = await this.prisma.membership.findFirst({
      where: {
        tenantId,
        userId,
        status: 'ACTIVE',
        membershipTenantRoles: {
          some: {
            tenantRole: {
              slug: 'owner',
            },
          },
        },
      },
    });

    if (!membership) {
      throw new ForbiddenException('You must be a tenant owner to perform this action');
    }
  }

  /**
   * Check DNS TXT record for verification token
   */
  private async checkDnsTxtRecord(
    domainName: string,
    expectedToken: string,
  ): Promise<boolean> {
    try {
      // Check _idp-verification.domain.com
      const records = await resolveTxt(`_idp-verification.${domainName}`);
      
      // TXT records are returned as arrays of strings
      for (const record of records) {
        const value = record.join('');
        if (value === expectedToken) {
          return true;
        }
      }
      return false;
    } catch (error) {
      // DNS lookup failed (NXDOMAIN, SERVFAIL, etc.)
      return false;
    }
  }

  /**
   * Generate verification token
   */
  private generateVerificationToken(): string {
    return `idp-verify-${crypto.randomBytes(16).toString('hex')}`;
  }

  /**
   * Get DNS setup instructions
   */
  private getDnsInstructions(domainName: string, token: string) {
    return {
      type: 'TXT',
      host: `_idp-verification.${domainName}`,
      value: token,
      instructions: [
        `Add a TXT record to your DNS settings:`,
        `Host/Name: _idp-verification`,
        `Value: ${token}`,
        `TTL: 300 (or your DNS provider's minimum)`,
        ``,
        `Note: DNS changes can take up to 48 hours to propagate, but usually complete within minutes.`,
      ],
    };
  }
}
