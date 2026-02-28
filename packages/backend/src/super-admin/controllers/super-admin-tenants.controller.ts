import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SuperAdminGuard } from '../guards/super-admin.guard';
import { AdminTenantsService } from '../services/admin-tenants.service';
import { AdminServiceAccountsService } from '../services/admin-service-accounts.service';
import { DomainsService } from '../../tenants/domains/domains.service';
import { TenantRolesService } from '../../authorization';
import { MfaService } from '../../auth/mfa/mfa.service';

@Controller('super-admin/tenants')
@UseGuards(SuperAdminGuard)
export class SuperAdminTenantsController {
  constructor(
    private readonly tenantsService: AdminTenantsService,
    private readonly serviceAccountsService: AdminServiceAccountsService,
    private readonly domainsService: DomainsService,
    private readonly tenantRolesService: TenantRolesService,
    private readonly mfaService: MfaService,
  ) {}

  @Get()
  async getAllTenants(
    @Query('search') search?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.tenantsService.getTenants({
      search,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Post()
  async createTenant(@Body() dto: { name: string; slug: string; ownerEmail?: string }) {
    return this.tenantsService.createTenant(dto);
  }

  @Get(':id')
  async getTenantDetail(@Param('id') id: string) {
    return this.tenantsService.getTenant(id);
  }

  @Put(':id')
  async updateTenant(
    @Param('id') id: string,
    @Body() dto: { name?: string; slug?: string; initiateLoginUri?: string | null },
  ) {
    return this.tenantsService.updateTenant(id, dto);
  }

  @Delete(':id')
  async deleteTenant(@Param('id') id: string) {
    return this.tenantsService.deleteTenant(id);
  }

  @Delete(':tenantId/members/:membershipId')
  async removeTenantMember(
    @Param('tenantId') tenantId: string,
    @Param('membershipId') membershipId: string,
  ) {
    return this.tenantsService.removeTenantMember(tenantId, membershipId);
  }

  @Get(':tenantId/available-users')
  async getAvailableUsersForTenant(@Param('tenantId') tenantId: string) {
    return this.tenantsService.getAvailableUsersForTenant(tenantId);
  }

  @Post(':tenantId/invite')
  async inviteUserToTenant(
    @Param('tenantId') tenantId: string,
    @Body('email') email: string,
  ) {
    return this.tenantsService.inviteUserToTenant(tenantId, email);
  }

  // MFA Policy
  @Get(':tenantId/mfa-policy')
  async getTenantMfaPolicy(@Param('tenantId') tenantId: string) {
    return this.mfaService.getTenantMfaPolicy(tenantId);
  }

  @Put(':tenantId/mfa-policy')
  @HttpCode(HttpStatus.OK)
  async updateTenantMfaPolicy(
    @Param('tenantId') tenantId: string,
    @Body() dto: { policy: 'DISABLED' | 'OPTIONAL' | 'ENCOURAGED' | 'REQUIRED'; gracePeriodDays?: number },
  ) {
    return this.mfaService.updateTenantMfaPolicy(tenantId, dto.policy, dto.gracePeriodDays);
  }

  @Get(':tenantId/mfa-stats')
  async getTenantMfaStats(@Param('tenantId') tenantId: string) {
    return this.mfaService.getTenantMfaStats(tenantId);
  }

  // Service Accounts
  @Get(':tenantId/service-accounts')
  async listServiceAccounts(@Param('tenantId') tenantId: string) {
    return this.serviceAccountsService.listTenantServiceAccounts(tenantId);
  }

  @Post(':tenantId/service-accounts')
  async createServiceAccount(
    @Param('tenantId') tenantId: string,
    @Body() dto: { name: string; roleIds?: string[]; description?: string },
  ) {
    return this.serviceAccountsService.createServiceAccount(
      tenantId, dto.name, dto.roleIds || [], dto.description,
    );
  }

  @Put(':tenantId/service-accounts/:serviceAccountId/roles')
  async updateServiceAccountRoles(
    @Param('tenantId') tenantId: string,
    @Param('serviceAccountId') serviceAccountId: string,
    @Body('roleIds') roleIds: string[],
  ) {
    return this.serviceAccountsService.updateServiceAccountRoles(tenantId, serviceAccountId, roleIds);
  }

  @Delete(':tenantId/service-accounts/:serviceAccountId')
  async revokeServiceAccount(
    @Param('tenantId') tenantId: string,
    @Param('serviceAccountId') serviceAccountId: string,
  ) {
    return this.serviceAccountsService.revokeServiceAccount(tenantId, serviceAccountId);
  }
}
