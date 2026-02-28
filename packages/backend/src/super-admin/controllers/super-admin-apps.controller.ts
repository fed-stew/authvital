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
import { SuperAdminGuard } from '../guards/super-admin.guard';
import { AdminApplicationsService } from '../services/admin-applications.service';
import { AdminInstanceService } from '../services/admin-instance.service';

@Controller('super-admin')
@UseGuards(SuperAdminGuard)
export class SuperAdminAppsController {
  constructor(
    private readonly applicationsService: AdminApplicationsService,
    private readonly instanceService: AdminInstanceService,
  ) {}

  @Get('stats')
  async getSystemStats() {
    return this.instanceService.getSystemStats();
  }

  @Get('applications')
  async getAllApplications() {
    return this.applicationsService.getApplications();
  }

  @Post('applications')
  async createApplication(
    @Body() dto: {
      name: string;
      clientId?: string;
      description?: string;
      redirectUris?: string[];
      postLogoutRedirectUri?: string;
      initiateLoginUri?: string;
      availableFeatures?: Array<{ key: string; name: string; description?: string }>;
      allowMixedLicensing?: boolean;
      licensingMode?: 'FREE' | 'PER_SEAT' | 'TENANT_WIDE';
      accessMode?: 'AUTOMATIC' | 'MANUAL_AUTO_GRANT' | 'MANUAL_NO_DEFAULT' | 'DISABLED';
      defaultLicenseTypeId?: string;
      defaultSeatCount?: number;
      autoProvisionOnSignup?: boolean;
      autoGrantToOwner?: boolean;
      brandingName?: string;
      brandingLogoUrl?: string;
      brandingIconUrl?: string;
      brandingPrimaryColor?: string;
      brandingBackgroundColor?: string;
      brandingAccentColor?: string;
      brandingSupportUrl?: string;
      brandingPrivacyUrl?: string;
      brandingTermsUrl?: string;
    },
  ) {
    return this.applicationsService.createApplication(dto);
  }

  @Put('applications/:id')
  async updateApplication(
    @Param('id') id: string,
    @Body() dto: {
      name?: string;
      description?: string;
      redirectUris?: string[];
      postLogoutRedirectUri?: string;
      initiateLoginUri?: string;
      accessTokenTtl?: number;
      refreshTokenTtl?: number;
      isActive?: boolean;
      availableFeatures?: Array<{ key: string; name: string; description?: string }>;
      allowMixedLicensing?: boolean;
      licensingMode?: 'FREE' | 'PER_SEAT' | 'TENANT_WIDE';
      accessMode?: 'AUTOMATIC' | 'MANUAL_AUTO_GRANT' | 'MANUAL_NO_DEFAULT' | 'DISABLED';
      defaultLicenseTypeId?: string;
      defaultSeatCount?: number;
      autoProvisionOnSignup?: boolean;
      autoGrantToOwner?: boolean;
      brandingName?: string;
      brandingLogoUrl?: string;
      brandingIconUrl?: string;
      brandingPrimaryColor?: string;
      brandingBackgroundColor?: string;
      brandingAccentColor?: string;
      brandingSupportUrl?: string;
      brandingPrivacyUrl?: string;
      brandingTermsUrl?: string;
      webhookUrl?: string | null;
      webhookEnabled?: boolean;
      webhookEvents?: string[];
    },
  ) {
    return this.applicationsService.updateApplication(id, dto);
  }

  @Post('applications/:id/regenerate-secret')
  async regenerateClientSecret(@Param('id') id: string) {
    const secret = await this.applicationsService.regenerateClientSecret(id);
    return { clientSecret: secret, warning: 'Store this secret securely. It will not be shown again.' };
  }

  @Delete('applications/:id/revoke-secret')
  async revokeClientSecret(@Param('id') id: string) {
    await this.applicationsService.revokeClientSecret(id);
    return { success: true, message: 'Client secret revoked. M2M authentication is now disabled for this application.' };
  }

  @Delete('applications/:id')
  async deleteApplication(@Param('id') id: string) {
    return this.applicationsService.deleteApplication(id);
  }

  // Role Management
  @Post('applications/:appId/roles')
  async createRole(
    @Param('appId') appId: string,
    @Body() dto: { name: string; slug: string; description?: string; isDefault?: boolean },
  ) {
    return this.applicationsService.createRole(appId, dto.name, dto.slug, dto.description, dto.isDefault);
  }

  @Put('roles/:id')
  async updateRole(
    @Param('id') id: string,
    @Body() dto: { name?: string; slug?: string; description?: string; isDefault?: boolean },
  ) {
    return this.applicationsService.updateRole(id, dto);
  }

  @Delete('roles/:id')
  async deleteRole(@Param('id') id: string) {
    return this.applicationsService.deleteRole(id);
  }

  @Post('roles/:id/set-default')
  async setDefaultRole(@Param('id') id: string) {
    return this.applicationsService.setDefaultRole(id);
  }
}
