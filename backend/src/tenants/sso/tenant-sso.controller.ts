import {
  Controller,
  Get,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantAccessGuard } from '../guards/tenant-access.guard';
import { PermissionGuard } from '../../authorization/guards/permission.guard';
import { RequirePermission } from '../../authorization/decorators/require-permission.decorator';
import { TenantSsoConfigService, TenantSsoConfigDto } from '../../sso/tenant-sso-config.service';
import { SsoProviderType } from '@prisma/client';

@Controller('tenants/:tenantId/sso')
@UseGuards(JwtAuthGuard, TenantAccessGuard)
export class TenantSsoController {
  constructor(
    private readonly tenantSsoConfigService: TenantSsoConfigService,
  ) {}

  /**
   * Get tenant's SSO configuration
   */
  @Get('config')
  async getTenantSsoConfig(@Param('tenantId') tenantId: string) {
    const configs = await this.tenantSsoConfigService.getTenantSsoConfigs(tenantId);
    const enabledProviders = await this.tenantSsoConfigService.getEnabledProvidersForTenant(tenantId);
    
    return {
      configs,
      availableProviders: enabledProviders,
    };
  }

  /**
   * Get effective SSO config for a specific provider
   */
  @Get('config/:provider')
  async getProviderConfig(
    @Param('tenantId') tenantId: string,
    @Param('provider') provider: string,
  ) {
    const config = await this.tenantSsoConfigService.getEffectiveSsoConfig(
      tenantId,
      provider.toUpperCase() as SsoProviderType,
    );
    
    if (!config) {
      return { enabled: false, provider: provider.toUpperCase() };
    }

    // Don't expose secrets
    return {
      provider: config.provider,
      enabled: config.enabled,
      enforced: config.enforced,
      allowedDomains: config.allowedDomains,
      hasCustomCredentials: config.source === 'tenant',
    };
  }

  /**
   * Update tenant's SSO configuration for a provider
   * Requires tenant:sso:manage permission
   */
  @Put('config/:provider')
  @UseGuards(PermissionGuard)
  @RequirePermission('tenant:sso:manage')
  async updateTenantSsoConfig(
    @Param('tenantId') tenantId: string,
    @Param('provider') provider: string,
    @Body() dto: {
      enabled?: boolean;
      clientId?: string | null;
      clientSecret?: string | null;
      enforced?: boolean;
      allowedDomains?: string[];
    },
  ) {
    return this.tenantSsoConfigService.upsertTenantSsoConfig(tenantId, {
      provider: provider.toUpperCase() as SsoProviderType,
      ...dto,
    });
  }

  /**
   * Remove tenant's SSO configuration override (revert to instance defaults)
   * Requires tenant:sso:manage permission
   */
  @Delete('config/:provider')
  @UseGuards(PermissionGuard)
  @RequirePermission('tenant:sso:manage')
  async deleteTenantSsoConfig(
    @Param('tenantId') tenantId: string,
    @Param('provider') provider: string,
  ) {
    return this.tenantSsoConfigService.deleteTenantSsoConfig(
      tenantId,
      provider.toUpperCase() as SsoProviderType,
    );
  }

  /**
   * Check if SSO is enforced for this tenant
   */
  @Get('enforced')
  async isSsoEnforced(@Param('tenantId') tenantId: string) {
    const enforced = await this.tenantSsoConfigService.isSsoEnforcedForTenant(tenantId);
    return { enforced };
  }
}
