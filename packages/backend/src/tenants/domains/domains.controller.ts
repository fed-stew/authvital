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
import { TenantAccessGuard, TenantIdentifierGuard } from '../guards';
import { PermissionGuard } from '../../authorization/guards/permission.guard';
import { RequirePermission } from '../../authorization/decorators/require-permission.decorator';
import { TENANT_PERMISSIONS } from '../../authorization/constants';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
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
@UseGuards(JwtAuthGuard, TenantIdentifierGuard, TenantAccessGuard, PermissionGuard)
export class DomainsController {
  constructor(private readonly domainsService: DomainsService) {}

  /**
   * POST /api/tenants/:tenantId/domains
   * Register a new domain for verification
   */
  @Post()
  @RequirePermission(TENANT_PERMISSIONS.DOMAINS_MANAGE)
  async registerDomain(
    @Param('tenantId') tenantId: string,
    @Body() dto: RegisterDomainDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.domainsService.registerDomain(tenantId, dto.domainName, userId);
  }

  /**
   * GET /api/tenants/:tenantId/domains
   * Get all domains for a tenant
   */
  @Get()
  @RequirePermission(TENANT_PERMISSIONS.DOMAINS_VIEW)
  async getTenantDomains(@Param('tenantId') tenantId: string) {
    return this.domainsService.getTenantDomains(tenantId);
  }

  /**
   * GET /api/tenants/:tenantId/domains/:domainId
   * Get a single domain
   */
  @Get(':domainId')
  @RequirePermission(TENANT_PERMISSIONS.DOMAINS_VIEW)
  async getDomain(@Param('domainId') domainId: string) {
    return this.domainsService.getDomain(domainId);
  }

  /**
   * POST /api/tenants/:tenantId/domains/:domainId/verify
   * Trigger domain verification (checks DNS TXT records)
   */
  @Post(':domainId/verify')
  @RequirePermission(TENANT_PERMISSIONS.DOMAINS_MANAGE)
  async verifyDomain(
    @Param('domainId') domainId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.domainsService.verifyDomain(domainId, userId);
  }

  /**
   * DELETE /api/tenants/:tenantId/domains/:domainId
   * Delete/remove a domain
   */
  @Delete(':domainId')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(TENANT_PERMISSIONS.DOMAINS_MANAGE)
  async deleteDomain(
    @Param('domainId') domainId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.domainsService.deleteDomain(domainId, userId);
  }
}
