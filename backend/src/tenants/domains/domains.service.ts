import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { randomUUID } from 'crypto';
import * as dns from 'dns';

/**
 * DomainsService handles domain verification for enterprise features
 * Uses DNS TXT record verification method
 */
@Injectable()
export class DomainsService {
  private readonly logger = new Logger(DomainsService.name);
  private readonly DNS_TIMEOUT_MS = 10000; // 10 seconds

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Register a new domain for verification
   * Generates a cryptographically secure verification token
   */
  async registerDomain(tenantId: string, domainName: string) {
    const normalizedDomain = domainName.toLowerCase().trim();

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    // Check if domain is already verified by ANY tenant
    const existingVerifiedDomain = await this.prisma.domain.findFirst({
      where: {
        domainName: normalizedDomain,
        isVerified: true,
      },
      include: {
        tenant: {
          select: { id: true, name: true },
        },
      },
    });

    if (existingVerifiedDomain) {
      throw new ConflictException(
        `Domain "${normalizedDomain}" is already verified by another organization`,
      );
    }

    // Check if this tenant already has this domain registered
    const existingDomainForTenant = await this.prisma.domain.findUnique({
      where: {
        domainName_tenantId: {
          domainName: normalizedDomain,
          tenantId,
        },
      },
    });

    if (existingDomainForTenant) {
      return this.formatDomainResponse(existingDomainForTenant);
    }

    const verificationToken = `idp-verify-${randomUUID()}`;

    const domain = await this.prisma.domain.create({
      data: {
        domainName: normalizedDomain,
        verificationToken,
        tenantId,
        isVerified: false,
      },
    });

    this.logger.log(
      `Domain "${normalizedDomain}" registered for tenant ${tenantId}`,
    );

    return this.formatDomainResponse(domain);
  }

  /**
   * Verify a domain by checking DNS TXT records
   */
  async verifyDomain(domainId: string) {
    const domain = await this.prisma.domain.findUnique({
      where: { id: domainId },
    });

    if (!domain) {
      throw new NotFoundException('Domain not found');
    }

    if (domain.isVerified) {
      return {
        success: true,
        message: 'Domain is already verified',
        domain: this.formatDomainResponse(domain),
      };
    }

    try {
      const txtRecords = await this.resolveTxtWithTimeout(
        domain.domainName,
        this.DNS_TIMEOUT_MS,
      );

      this.logger.debug(
        `TXT records for ${domain.domainName}: ${JSON.stringify(txtRecords)}`,
      );

      const flattenedRecords = txtRecords.flat();
      const tokenFound = flattenedRecords.some((record) =>
        record.includes(domain.verificationToken),
      );

      if (!tokenFound) {
        throw new BadRequestException({
          message: 'Verification failed: TXT record not found',
          tip: 'DNS propagation can take up to 48 hours. Please wait and try again.',
          expectedRecord: {
            type: 'TXT',
            name: '@',
            value: domain.verificationToken,
          },
          foundRecords: flattenedRecords.slice(0, 10),
        });
      }

      const verifiedDomain = await this.prisma.domain.update({
        where: { id: domainId },
        data: {
          isVerified: true,
          verifiedAt: new Date(),
        },
      });

      this.logger.log(`Domain "${domain.domainName}" verified successfully`);

      return {
        success: true,
        message: 'Domain verified successfully!',
        domain: this.formatDomainResponse(verifiedDomain),
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      const dnsError = error as NodeJS.ErrnoException;
      this.logger.warn(
        `DNS lookup failed for ${domain.domainName}: ${dnsError.code}`,
      );

      throw new BadRequestException({
        message: this.getDnsErrorMessage(dnsError.code),
        tip: 'Please ensure the domain exists and DNS is properly configured.',
        code: dnsError.code,
      });
    }
  }

  /**
   * Get all domains for a tenant
   */
  async getTenantDomains(tenantId: string) {
    const domains = await this.prisma.domain.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });

    return domains.map((d) => this.formatDomainResponse(d));
  }

  /**
   * Get a single domain by ID
   */
  async getDomain(domainId: string) {
    const domain = await this.prisma.domain.findUnique({
      where: { id: domainId },
    });

    if (!domain) {
      throw new NotFoundException('Domain not found');
    }

    return this.formatDomainResponse(domain);
  }

  /**
   * Delete a domain
   */
  async deleteDomain(domainId: string) {
    const domain = await this.prisma.domain.findUnique({
      where: { id: domainId },
    });

    if (!domain) {
      throw new NotFoundException('Domain not found');
    }

    await this.prisma.domain.delete({
      where: { id: domainId },
    });

    this.logger.log(`Domain "${domain.domainName}" deleted`);

    return { success: true, message: 'Domain removed successfully' };
  }

  /**
   * Resolve TXT records with a timeout
   */
  private resolveTxtWithTimeout(
    domain: string,
    timeoutMs: number,
  ): Promise<string[][]> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject({ code: 'ETIMEOUT' });
      }, timeoutMs);

      dns.promises
        .resolveTxt(domain)
        .then((records) => {
          clearTimeout(timer);
          resolve(records);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * Get human-readable DNS error message
   */
  private getDnsErrorMessage(code: string | undefined): string {
    const errorMessages: Record<string, string> = {
      ENODATA: 'No TXT records found for this domain',
      ENOTFOUND: 'Domain not found. Please check the domain name.',
      ETIMEOUT: 'DNS lookup timed out. Please try again.',
      ESERVFAIL: 'DNS server error. Please try again later.',
      ECONNREFUSED: 'Could not connect to DNS server.',
    };

    return errorMessages[code || ''] || `DNS lookup failed (${code})`;
  }

  /**
   * Format domain response with helpful display fields
   */
  private formatDomainResponse(domain: {
    id: string;
    domainName: string;
    verificationToken: string;
    isVerified: boolean;
    verifiedAt: Date | null;
    createdAt: Date;
  }) {
    return {
      id: domain.id,
      domainName: domain.domainName,
      isVerified: domain.isVerified,
      verifiedAt: domain.verifiedAt,
      createdAt: domain.createdAt,
      verification: {
        token: domain.verificationToken,
        txtRecord: {
          type: 'TXT',
          name: '@',
          value: domain.verificationToken,
        },
        instructions: `Add a TXT record to your DNS settings with the value: ${domain.verificationToken}`,
      },
    };
  }
}
