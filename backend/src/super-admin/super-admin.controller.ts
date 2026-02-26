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
  Request,
  Res,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { Response } from 'express';
import { SuperAdminGuard } from './guards/super-admin.guard';
import { LoginDto } from './dto/login.dto';
import { CreateSuperAdminDto } from './dto/create-super-admin.dto';
import {
  AdminAuthService,
  AdminUsersService,
  AdminTenantsService,
  AdminServiceAccountsService,
  AdminApplicationsService,
  AdminInstanceService,
  AdminSsoService,
} from './services';
import { SsoProviderType } from '@prisma/client';
import { DomainsService } from '../tenants/domains/domains.service';
import { TenantRolesService } from '../authorization';
import { MfaService } from '../auth/mfa/mfa.service';
import { getBaseCookieOptions } from '../common/utils/cookie.utils';

/**
 * Cookie options for super admin session (24h expiry - shorter than regular users)
 */
const getSuperAdminCookieOptions = () => ({
  ...getBaseCookieOptions(),
  maxAge: 24 * 60 * 60 * 1000, // 24 hours
});

@Controller("super-admin")
export class SuperAdminController {
  constructor(
    private readonly authService: AdminAuthService,
    private readonly usersService: AdminUsersService,
    private readonly tenantsService: AdminTenantsService,
    private readonly serviceAccountsService: AdminServiceAccountsService,
    private readonly applicationsService: AdminApplicationsService,
    private readonly instanceService: AdminInstanceService,
    private readonly domainsService: DomainsService,
    private readonly tenantRolesService: TenantRolesService,
    private readonly mfaService: MfaService,
    private readonly ssoService: AdminSsoService,
  ) {}

  // ===========================================================================
  // AUTH (Public)
  // ===========================================================================

  @Post("login")
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto.email, dto.password);
    
    // If MFA is required, return challenge token (don't set cookie yet)
    if (result.mfaRequired || result.mfaSetupRequired) {
      return {
        mfaRequired: result.mfaRequired,
        mfaSetupRequired: result.mfaSetupRequired,
        mfaChallengeToken: result.mfaChallengeToken,
      };
    }
    
    // No MFA - set httpOnly cookie for super admin session
    res.cookie('super_admin_session', result.accessToken, getSuperAdminCookieOptions());
    
    // Return admin info (but NOT the token - it's in the cookie)
    return {
      admin: result.admin,
      mustChangePassword: result.mustChangePassword,
    };
  }

  @Post('mfa/verify')
  @HttpCode(HttpStatus.OK)
  async verifyMfa(
    @Body() dto: { challengeToken: string; code: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.verifyMfaAndLogin(dto.challengeToken, dto.code);
    
    // Set httpOnly cookie for super admin session
    res.cookie('super_admin_session', result.accessToken, getSuperAdminCookieOptions());
    
    return {
      admin: result.admin,
      mustChangePassword: result.mustChangePassword,
    };
  }

  @Post('mfa/setup')
  @UseGuards(SuperAdminGuard)
  async setupMfa(@Request() req: { user: { id: string } }) {
    const admin = await this.authService.getProfile(req.user.id);
    return this.mfaService.generateSetup(admin.email);
  }

  @Post('mfa/enable')
  @UseGuards(SuperAdminGuard)
  @HttpCode(HttpStatus.OK)
  async enableMfa(
    @Request() req: { user: { id: string } },
    @Body() dto: { secret: string; code: string; backupCodes: string[] },
  ) {
    return this.mfaService.enableMfaForSuperAdmin(
      req.user.id,
      dto.secret,
      dto.code,
      dto.backupCodes,
    );
  }

  @Delete('mfa/disable')
  @UseGuards(SuperAdminGuard)
  @HttpCode(HttpStatus.OK)
  async disableMfa(
    @Request() req: { user: { id: string } },
    @Body() dto: { code: string },
  ) {
    return this.mfaService.disableMfaForSuperAdmin(req.user.id, dto.code);
  }

  @Get('mfa/status')
  @UseGuards(SuperAdminGuard)
  async getMfaStatus(@Request() req: { user: { id: string } }) {
    return this.mfaService.getSuperAdminMfaStatus(req.user.id);
  }

  @Put('settings/mfa-policy')
  @UseGuards(SuperAdminGuard)
  @HttpCode(HttpStatus.OK)
  async updateMfaPolicy(
    @Request() req: { user: { id: string } },
    @Body() dto: { required: boolean },
  ) {
    // If trying to enable MFA requirement, check if current admin has MFA set up
    if (dto.required) {
      const adminMfaStatus = await this.mfaService.getSuperAdminMfaStatus(req.user.id);
      if (!adminMfaStatus.enabled) {
        throw new BadRequestException(
          'You must set up MFA for your own account before requiring it for all admins'
        );
      }
    }
    
    await this.mfaService.setSuperAdminMfaRequired(dto.required);
    return { success: true, superAdminMfaRequired: dto.required };
  }

  @Get('settings/mfa-policy')
  @UseGuards(SuperAdminGuard)
  async getMfaPolicy() {
    const required = await this.mfaService.isSuperAdminMfaRequired();
    return { superAdminMfaRequired: required };
  }

  @Post('change-password')
  @UseGuards(SuperAdminGuard)
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @Request() req: { user: { id: string } },
    @Body() dto: { currentPassword: string; newPassword: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.changePassword(
      req.user.id,
      dto.currentPassword,
      dto.newPassword,
    );

    // Update cookie with new token (in case we want to invalidate old sessions)
    res.cookie(
      "super_admin_session",
      result.accessToken,
      getSuperAdminCookieOptions(),
    );

    return { success: true };
  }

  @Post("logout")
  @HttpCode(HttpStatus.OK)
  async logout(@Res({ passthrough: true }) res: Response) {
    // Clear the super admin cookie
    res.clearCookie("super_admin_session", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/",
    });
    return { success: true };
  }

  // ===========================================================================
  // PROTECTED ROUTES
  // ===========================================================================

  @Get("profile")
  @UseGuards(SuperAdminGuard)
  async getProfile(@Request() req: { user: { id: string } }) {
    return this.authService.getProfile(req.user.id);
  }

  @Post("create-admin")
  @UseGuards(SuperAdminGuard)
  async createSuperAdmin(@Body() dto: CreateSuperAdminDto) {
    return this.authService.createSuperAdmin({
      email: dto.email,
      password: dto.password,
      givenName: dto.givenName,
      familyName: dto.familyName,
      displayName: dto.displayName,
    });
  }

  @Get('admins')
  @UseGuards(SuperAdminGuard)
  async getSuperAdmins() {
    return this.authService.getSuperAdmins();
  }

  @Delete('admins/:id')
  @UseGuards(SuperAdminGuard)
  async deleteSuperAdmin(
    @Param('id') adminId: string,
    @Request() req: { user: { id: string } },
  ) {
    return this.authService.deleteSuperAdmin(adminId, req.user.id);
  }

  @Get("stats")
  @UseGuards(SuperAdminGuard)
  async getSystemStats() {
    return this.instanceService.getSystemStats();
  }

  // ===========================================================================
  // USER MANAGEMENT
  // ===========================================================================

  @Get("users")
  @UseGuards(SuperAdminGuard)
  async getAllUsers(
    @Query("search") search?: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    return this.usersService.getUsers({
      search,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Post("users")
  @UseGuards(SuperAdminGuard)
  async createUser(
    @Body()
    dto: {
      givenName?: string;
      familyName?: string;
      email?: string;
      phone?: string;
      password?: string;
    },
  ) {
    return this.usersService.createUser(dto);
  }

  @Put("users/:id")
  @UseGuards(SuperAdminGuard)
  async updateUser(
    @Param("id") id: string,
    @Body()
    dto: {
      givenName?: string;
      familyName?: string;
      email?: string;
      phone?: string;
    },
  ) {
    return this.usersService.updateUser(id, dto);
  }

  @Delete("users/:id")
  @UseGuards(SuperAdminGuard)
  async deleteUser(@Param("id") id: string) {
    return this.usersService.deleteUser(id);
  }

  @Get("users/:id")
  @UseGuards(SuperAdminGuard)
  async getUserDetail(@Param("id") id: string) {
    return this.usersService.getUser(id);
  }

  @Post("users/:id/send-password-reset")
  @UseGuards(SuperAdminGuard)
  async sendUserPasswordReset(@Param("id") id: string) {
    return this.usersService.sendUserPasswordReset(id);
  }

  // ===========================================================================
  // TENANT MANAGEMENT
  // ===========================================================================

  @Get("tenants")
  @UseGuards(SuperAdminGuard)
  async getAllTenants(
    @Query("search") search?: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    return this.tenantsService.getTenants({
      search,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Post("tenants")
  @UseGuards(SuperAdminGuard)
  async createTenant(
    @Body() dto: { name: string; slug: string; ownerEmail?: string },
  ) {
    return this.tenantsService.createTenant(dto);
  }

  @Get("tenants/:id")
  @UseGuards(SuperAdminGuard)
  async getTenantDetail(@Param("id") id: string) {
    return this.tenantsService.getTenant(id);
  }

  @Put("tenants/:id")
  @UseGuards(SuperAdminGuard)
  async updateTenant(
    @Param("id") id: string,
    @Body()
    dto: {
      name?: string;
      slug?: string;
      /** Override initiateLoginUri for this tenant (takes precedence over instance template) */
      initiateLoginUri?: string | null;
    },
  ) {
    return this.tenantsService.updateTenant(id, dto);
  }

  @Delete("tenants/:id")
  @UseGuards(SuperAdminGuard)
  async deleteTenant(@Param("id") id: string) {
    return this.tenantsService.deleteTenant(id);
  }

  @Delete("tenants/:tenantId/members/:membershipId")
  @UseGuards(SuperAdminGuard)
  async removeTenantMember(
    @Param("tenantId") tenantId: string,
    @Param("membershipId") membershipId: string,
  ) {
    return this.tenantsService.removeTenantMember(tenantId, membershipId);
  }

  @Put("memberships/:membershipId/roles")
  @UseGuards(SuperAdminGuard)
  async updateMemberRoles(
    @Param("membershipId") membershipId: string,
    @Body("roleIds") roleIds: string[],
  ) {
    return this.tenantsService.updateMemberRoles(membershipId, roleIds);
  }

  @Put("memberships/:membershipId/status")
  @UseGuards(SuperAdminGuard)
  async updateMembershipStatus(
    @Param("membershipId") membershipId: string,
    @Body("status") status: "ACTIVE" | "SUSPENDED" | "INVITED",
  ) {
    return this.tenantsService.updateMembershipStatus(membershipId, status);
  }

  @Get("tenants/:tenantId/available-users")
  @UseGuards(SuperAdminGuard)
  async getAvailableUsersForTenant(@Param("tenantId") tenantId: string) {
    return this.tenantsService.getAvailableUsersForTenant(tenantId);
  }

  @Post("tenants/:tenantId/invite")
  @UseGuards(SuperAdminGuard)
  async inviteUserToTenant(
    @Param("tenantId") tenantId: string,
    @Body("email") email: string,
  ) {
    return this.tenantsService.inviteUserToTenant(tenantId, email);
  }

  // ===========================================================================
  // TENANT MFA POLICY MANAGEMENT
  // ===========================================================================

  /**
   * Get MFA policy for a specific tenant
   */
  @Get('tenants/:tenantId/mfa-policy')
  @UseGuards(SuperAdminGuard)
  async getTenantMfaPolicy(@Param('tenantId') tenantId: string) {
    return this.mfaService.getTenantMfaPolicy(tenantId);
  }

  /**
   * Update MFA policy for a specific tenant
   */
  @Put('tenants/:tenantId/mfa-policy')
  @UseGuards(SuperAdminGuard)
  @HttpCode(HttpStatus.OK)
  async updateTenantMfaPolicy(
    @Param('tenantId') tenantId: string,
    @Body() dto: { 
      policy: 'DISABLED' | 'OPTIONAL' | 'ENCOURAGED' | 'REQUIRED';
      gracePeriodDays?: number;
    },
  ) {
    return this.mfaService.updateTenantMfaPolicy(
      tenantId,
      dto.policy,
      dto.gracePeriodDays,
    );
  }

  /**
   * Get MFA compliance stats for a tenant
   */
  @Get('tenants/:tenantId/mfa-stats')
  @UseGuards(SuperAdminGuard)
  async getTenantMfaStats(@Param('tenantId') tenantId: string) {
    return this.mfaService.getTenantMfaStats(tenantId);
  }

  // ===========================================================================
  // SERVICE ACCOUNTS (Tenant API Keys)
  // ===========================================================================

  @Get("tenants/:tenantId/service-accounts")
  @UseGuards(SuperAdminGuard)
  async listServiceAccounts(@Param("tenantId") tenantId: string) {
    return this.serviceAccountsService.listTenantServiceAccounts(tenantId);
  }

  @Post("tenants/:tenantId/service-accounts")
  @UseGuards(SuperAdminGuard)
  async createServiceAccount(
    @Param("tenantId") tenantId: string,
    @Body()
    dto: {
      name: string;
      roleIds?: string[];
      description?: string;
    },
  ) {
    return this.serviceAccountsService.createServiceAccount(
      tenantId,
      dto.name,
      dto.roleIds || [],
      dto.description,
    );
  }

  @Put("tenants/:tenantId/service-accounts/:serviceAccountId/roles")
  @UseGuards(SuperAdminGuard)
  async updateServiceAccountRoles(
    @Param("tenantId") tenantId: string,
    @Param("serviceAccountId") serviceAccountId: string,
    @Body("roleIds") roleIds: string[],
  ) {
    return this.serviceAccountsService.updateServiceAccountRoles(
      tenantId,
      serviceAccountId,
      roleIds,
    );
  }

  @Delete("tenants/:tenantId/service-accounts/:serviceAccountId")
  @UseGuards(SuperAdminGuard)
  async revokeServiceAccount(
    @Param("tenantId") tenantId: string,
    @Param("serviceAccountId") serviceAccountId: string,
  ) {
    return this.serviceAccountsService.revokeServiceAccount(
      tenantId,
      serviceAccountId,
    );
  }

  // ===========================================================================
  // APPLICATION MANAGEMENT
  // ===========================================================================

  @Get("applications")
  @UseGuards(SuperAdminGuard)
  async getAllApplications() {
    return this.applicationsService.getApplications();
  }

  @Post("applications")
  @UseGuards(SuperAdminGuard)
  async createApplication(
    @Body()
    dto: {
      name: string;
      clientId?: string;
      description?: string;
      redirectUris?: string[];
      postLogoutRedirectUri?: string;
      initiateLoginUri?: string;
      // Licensing
      availableFeatures?: Array<{
        key: string;
        name: string;
        description?: string;
      }>;
      allowMixedLicensing?: boolean;
      // Licensing configuration
      licensingMode?: "FREE" | "PER_SEAT" | "TENANT_WIDE";
      accessMode?: "AUTOMATIC" | "MANUAL_AUTO_GRANT" | "MANUAL_NO_DEFAULT" | "DISABLED";
      defaultLicenseTypeId?: string;
      defaultSeatCount?: number;
      autoProvisionOnSignup?: boolean;
      autoGrantToOwner?: boolean;
      // Branding
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

  @Put("applications/:id")
  @UseGuards(SuperAdminGuard)
  async updateApplication(
    @Param("id") id: string,
    @Body()
    dto: {
      name?: string;
      description?: string;
      redirectUris?: string[];
      postLogoutRedirectUri?: string;
      initiateLoginUri?: string;
      accessTokenTtl?: number;
      refreshTokenTtl?: number;
      isActive?: boolean;
      // Licensing
      availableFeatures?: Array<{
        key: string;
        name: string;
        description?: string;
      }>;
      allowMixedLicensing?: boolean;
      // Licensing configuration
      licensingMode?: "FREE" | "PER_SEAT" | "TENANT_WIDE";
      accessMode?: "AUTOMATIC" | "MANUAL_AUTO_GRANT" | "MANUAL_NO_DEFAULT" | "DISABLED";
      defaultLicenseTypeId?: string;
      defaultSeatCount?: number;
      autoProvisionOnSignup?: boolean;
      autoGrantToOwner?: boolean;
      // Branding
      brandingName?: string;
      brandingLogoUrl?: string;
      brandingIconUrl?: string;
      brandingPrimaryColor?: string;
      brandingBackgroundColor?: string;
      brandingAccentColor?: string;
      brandingSupportUrl?: string;
      brandingPrivacyUrl?: string;
      brandingTermsUrl?: string;
      // Webhook configuration
      webhookUrl?: string | null;
      webhookEnabled?: boolean;
      webhookEvents?: string[];
    },
  ) {
    return this.applicationsService.updateApplication(id, dto);
  }

  @Post("applications/:id/regenerate-secret")
  @UseGuards(SuperAdminGuard)
  async regenerateClientSecret(@Param("id") id: string) {
    const secret = await this.applicationsService.regenerateClientSecret(id);
    return {
      clientSecret: secret,
      warning: "Store this secret securely. It will not be shown again.",
    };
  }

  @Delete("applications/:id/revoke-secret")
  @UseGuards(SuperAdminGuard)
  async revokeClientSecret(@Param("id") id: string) {
    await this.applicationsService.revokeClientSecret(id);
    return {
      success: true,
      message:
        "Client secret revoked. M2M authentication is now disabled for this application.",
    };
  }

  @Delete("applications/:id")
  @UseGuards(SuperAdminGuard)
  async deleteApplication(@Param("id") id: string) {
    return this.applicationsService.deleteApplication(id);
  }

  // ===========================================================================
  // ROLE MANAGEMENT (Per Application)
  // Roles are now simple: name, slug, description - no permissions
  // ===========================================================================

  @Post("applications/:appId/roles")
  @UseGuards(SuperAdminGuard)
  async createRole(
    @Param("appId") appId: string,
    @Body()
    dto: {
      name: string;
      slug: string;
      description?: string;
      isDefault?: boolean;
    },
  ) {
    return this.applicationsService.createRole(
      appId,
      dto.name,
      dto.slug,
      dto.description,
      dto.isDefault,
    );
  }

  @Put("roles/:id")
  @UseGuards(SuperAdminGuard)
  async updateRole(
    @Param("id") id: string,
    @Body()
    dto: {
      name?: string;
      slug?: string;
      description?: string;
      isDefault?: boolean;
    },
  ) {
    return this.applicationsService.updateRole(id, dto);
  }

  @Delete("roles/:id")
  @UseGuards(SuperAdminGuard)
  async deleteRole(@Param("id") id: string) {
    return this.applicationsService.deleteRole(id);
  }

  @Post("roles/:id/set-default")
  @UseGuards(SuperAdminGuard)
  async setDefaultRole(@Param("id") id: string) {
    return this.applicationsService.setDefaultRole(id);
  }

  // ===========================================================================
  // DOMAIN MANAGEMENT
  // ===========================================================================

  @Get("domains/tenant/:tenantId")
  @UseGuards(SuperAdminGuard)
  async getTenantDomains(@Param("tenantId") tenantId: string) {
    return this.domainsService.getTenantDomains(tenantId);
  }

  @Post("domains/register")
  @UseGuards(SuperAdminGuard)
  async registerDomain(@Body() dto: { tenantId: string; domainName: string }) {
    return this.domainsService.registerDomain(dto.tenantId, dto.domainName);
  }

  @Post("domains/:domainId/verify")
  @UseGuards(SuperAdminGuard)
  async verifyDomain(@Param("domainId") domainId: string) {
    return this.domainsService.verifyDomain(domainId);
  }

  @Delete("domains/:domainId")
  @UseGuards(SuperAdminGuard)
  async deleteDomain(@Param("domainId") domainId: string) {
    return this.domainsService.deleteDomain(domainId);
  }

  // =========================================================================
  // TENANT ROLE MANAGEMENT
  // =========================================================================

  /**
   * Get all tenant roles
   */
  @Get("tenant-roles")
  async getTenantRoles() {
    return this.tenantRolesService.getTenantRoles();
  }

  /**
   * Get a membership's tenant roles
   */
  @Get("memberships/:membershipId/tenant-roles")
  async getMembershipTenantRoles(@Param("membershipId") membershipId: string) {
    return this.tenantRolesService.getMembershipTenantRoles(membershipId);
  }

  /**
   * Assign a tenant role to a membership
   */
  @Post("memberships/:membershipId/tenant-roles")
  async assignTenantRole(
    @Param("membershipId") membershipId: string,
    @Body() body: { tenantRoleSlug: string },
  ) {
    await this.tenantRolesService.assignTenantRole(
      membershipId,
      body.tenantRoleSlug,
    );
    const roles =
      await this.tenantRolesService.getMembershipTenantRoles(membershipId);
    return {
      success: true,
      message: "Tenant role assigned successfully",
      roles,
    };
  }

  /**
   * Remove a tenant role from a membership
   */
  @Delete("memberships/:membershipId/tenant-roles/:roleSlug")
  async removeTenantRole(
    @Param("membershipId") membershipId: string,
    @Param("roleSlug") roleSlug: string,
  ) {
    await this.tenantRolesService.removeTenantRole(membershipId, roleSlug);
    return { success: true, message: "Tenant role removed successfully" };
  }

  // ===========================================================================
  // SSO CONFIGURATION
  // ===========================================================================

  @Get('sso/providers')
  @UseGuards(SuperAdminGuard)
  async getSsoProviders() {
    return this.ssoService.getAllProviders();
  }

  @Get('sso/providers/:provider')
  @UseGuards(SuperAdminGuard)
  async getSsoProvider(@Param('provider') provider: string) {
    return this.ssoService.getProvider(provider.toUpperCase() as SsoProviderType);
  }

  @Post('sso/providers')
  @UseGuards(SuperAdminGuard)
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
  @UseGuards(SuperAdminGuard)
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
    return this.ssoService.updateProvider(
      provider.toUpperCase() as SsoProviderType,
      dto,
    );
  }

  @Delete('sso/providers/:provider')
  @UseGuards(SuperAdminGuard)
  async deleteSsoProvider(@Param('provider') provider: string) {
    return this.ssoService.deleteProvider(provider.toUpperCase() as SsoProviderType);
  }

  @Post('sso/providers/:provider/test')
  @UseGuards(SuperAdminGuard)
  async testSsoProvider(@Param('provider') provider: string) {
    return this.ssoService.testProvider(provider.toUpperCase() as SsoProviderType);
  }
}
