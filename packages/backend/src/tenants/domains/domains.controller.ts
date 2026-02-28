import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { DomainsService } from './domains.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantAccessGuard } from '../guards';
import { IsString, IsNotEmpty } from 'class-validator';

/**
 * DTO for registering a domain
 */
export class RegisterDomainDto {
  @IsString()
  @IsNotEmpty()
  domainName!: string;
}

/**
 * DomainsController - REST API for domain verification
 *
 * Routes are prefixed with /api/tenants/:tenantId/domains
 */
@Controller('tenants/:tenantId/domains')
@UseGuards(JwtAuthGuard, TenantAccessGuard)
export class DomainsController {
  constructor(private readonly domainsService: DomainsService) {}

  /**
   * POST /api/tenants/:tenantId/domains
   * Register a new domain for verification
   */
  @Post()
  async registerDomain(
    @Param('tenantId') tenantId: string,
    @Body() dto: RegisterDomainDto,
  ) {
    return this.domainsService.registerDomain(tenantId, dto.domainName);
  }

  /**
   * GET /api/tenants/:tenantId/domains
   * Get all domains for a tenant
   */
  @Get()
  async getTenantDomains(@Param('tenantId') tenantId: string) {
    return this.domainsService.getTenantDomains(tenantId);
  }

  /**
   * GET /api/tenants/:tenantId/domains/:domainId
   * Get a single domain
   */
  @Get(':domainId')
  async getDomain(@Param('domainId') domainId: string) {
    return this.domainsService.getDomain(domainId);
  }

  /**
   * POST /api/tenants/:tenantId/domains/:domainId/verify
   * Trigger domain verification (checks DNS TXT records)
   */
  @Post(':domainId/verify')
  async verifyDomain(@Param('domainId') domainId: string) {
    return this.domainsService.verifyDomain(domainId);
  }

  /**
   * DELETE /api/tenants/:tenantId/domains/:domainId
   * Delete/remove a domain
   */
  @Delete(':domainId')
  @HttpCode(HttpStatus.OK)
  async deleteDomain(@Param('domainId') domainId: string) {
    return this.domainsService.deleteDomain(domainId);
  }
}
