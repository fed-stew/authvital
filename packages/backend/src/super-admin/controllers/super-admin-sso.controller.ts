import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { SsoProviderType } from '@prisma/client';
import { SuperAdminGuard } from '../guards/super-admin.guard';
import { AdminSsoService } from '../services/admin-sso.service';
import { DomainsService } from '../../tenants/domains/domains.service';
import { TenantRolesService } from '../../authorization';

@Controller('super-admin')
@UseGuards(SuperAdminGuard)
export class SuperAdminSsoController {
  constructor(
    private readonly ssoService: AdminSsoService,
    private readonly domainsService: DomainsService,
    private readonly tenantRolesService: TenantRolesService,
  ) {}

  // Domain Management
  @Get('domains/tenant/:tenantId')
  async getTenantDomains(@Param('tenantId') tenantId: string) {
    return this.domainsService.getTenantDomains(tenantId);
  }

  @Post('domains/register')
  async registerDomain(@Body() dto: { tenantId: string; domainName: string }) {
    return this.domainsService.registerDomain(dto.tenantId, dto.domainName);
  }

  @Post('domains/:domainId/verify')
  async verifyDomain(@Param('domainId') domainId: string) {
    return this.domainsService.verifyDomain(domainId);
  }

  @Delete('domains/:domainId')
  async deleteDomain(@Param('domainId') domainId: string) {
    return this.domainsService.deleteDomain(domainId);
  }

  // Tenant Role Management
  @Get('tenant-roles')
  async getTenantRoles() {
    return this.tenantRolesService.getTenantRoles();
  }

  @Get('memberships/:membershipId/tenant-roles')
  async getMembershipTenantRoles(@Param('membershipId') membershipId: string) {
    return this.tenantRolesService.getMembershipTenantRoles(membershipId);
  }

  @Post('memberships/:membershipId/tenant-roles')
  async assignTenantRole(
    @Param('membershipId') membershipId: string,
    @Body() body: { tenantRoleSlug: string },
  ) {
    await this.tenantRolesService.assignTenantRole(membershipId, body.tenantRoleSlug);
    const roles = await this.tenantRolesService.getMembershipTenantRoles(membershipId);
    return { success: true, message: 'Tenant role assigned successfully', roles };
  }

  @Delete('memberships/:membershipId/tenant-roles/:roleSlug')
  async removeTenantRole(
    @Param('membershipId') membershipId: string,
    @Param('roleSlug') roleSlug: string,
  ) {
    await this.tenantRolesService.removeTenantRole(membershipId, roleSlug);
    return { success: true, message: 'Tenant role removed successfully' };
  }

  @Put('memberships/:membershipId/roles')
  async updateMemberRoles(
    @Param('membershipId') membershipId: string,
    @Body('roleIds') roleIds: string[],
  ) {
    // This endpoint is handled by AdminTenantsService
    // Keeping here for backwards compatibility routing
    throw new Error('Use /super-admin/tenants endpoints for member role updates');
  }

  @Put('memberships/:membershipId/status')
  async updateMembershipStatus(
    @Param('membershipId') membershipId: string,
    @Body('status') status: 'ACTIVE' | 'SUSPENDED' | 'INVITED',
  ) {
    throw new Error('Use /super-admin/tenants endpoints for membership status updates');
  }

  // SSO Configuration
  @Get('sso/providers')
  async getSsoProviders() {
    return this.ssoService.getAllProviders();
  }

  @Get('sso/providers/:provider')
  async getSsoProvider(@Param('provider') provider: string) {
    return this.ssoService.getProvider(provider.toUpperCase() as SsoProviderType);
  }

  @Post('sso/providers')
  async createSsoProvider(
    @Body() dto: {
      provider: string;
      clientId: string;
      clientSecret: string;
      enabled?: boolean;
      scopes?: string[];
      allowedDomains?: string[];
      autoCreateUser?: boolean;
      autoLinkExisting?: boolean;
    },
  ) {
    return this.ssoService.upsertProvider({
      ...dto,
      provider: dto.provider.toUpperCase() as SsoProviderType,
    });
  }

  @Put('sso/providers/:provider')
  async updateSsoProvider(
    @Param('provider') provider: string,
    @Body() dto: {
      clientId?: string;
      clientSecret?: string;
      enabled?: boolean;
      scopes?: string[];
      allowedDomains?: string[];
      autoCreateUser?: boolean;
      autoLinkExisting?: boolean;
    },
  ) {
    return this.ssoService.updateProvider(provider.toUpperCase() as SsoProviderType, dto);
  }

  @Delete('sso/providers/:provider')
  async deleteSsoProvider(@Param('provider') provider: string) {
    return this.ssoService.deleteProvider(provider.toUpperCase() as SsoProviderType);
  }

  @Post('sso/providers/:provider/test')
  async testSsoProvider(@Param('provider') provider: string) {
    return this.ssoService.testProvider(provider.toUpperCase() as SsoProviderType);
  }
}
