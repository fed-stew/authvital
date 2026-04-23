import { initContract } from '@ts-rest/core';
import { z } from 'zod';

// Schema imports
import {
  PaginationQuerySchema,
  SuccessResponseSchema,
  ErrorResponseSchema,
  IdSchema,
} from '../schemas/common.js';
import {
  LoginRequestSchema,
  LoginResponseSchema,
  MfaVerifyRequestSchema,
  MfaVerifyResponseSchema,
  MfaSetupResponseSchema,
  MfaEnableRequestSchema,
  MfaDisableRequestSchema,
  MfaStatusResponseSchema,
  MfaPolicyResponseSchema,
  UpdateMfaPolicyRequestSchema,
  ChangePasswordRequestSchema,
  ForgotPasswordRequestSchema,
  ResetPasswordRequestSchema,
  VerifyResetTokenRequestSchema,
  CreateSuperAdminRequestSchema,
  SuperAdminSchema,
} from '../schemas/auth.js';
import {
  InstanceMetaSchema,
  UpdateInstanceSchema,
  InstanceApiKeySchema,
  CreateInstanceApiKeySchema,
  CreateInstanceApiKeyResponseSchema,
} from '../schemas/instance.js';
import {
  UserSchema,
  UserDetailSchema,
  CreateUserRequestSchema,
  UpdateUserRequestSchema,
  UsersListResponseSchema,
} from '../schemas/users.js';
import {
  TenantSchema,
  TenantDetailSchema,
  TenantsListResponseSchema,
  CreateTenantRequestSchema,
  UpdateTenantRequestSchema,
  InviteToTenantRequestSchema,
  TenantMfaPolicyRequestSchema,
  TenantMfaPolicyResponseSchema,
  TenantMfaStatsResponseSchema,
  CreateServiceAccountRequestSchema,
  ServiceAccountSchema,
  UpdateServiceAccountRolesRequestSchema,
  TenantRoleSchema,
  AssignTenantRoleRequestSchema,
  RegisterDomainRequestSchema,
  DomainSchema,
} from '../schemas/tenants.js';
import {
  ApplicationWithRolesSchema,
  CreateApplicationRequestSchema,
  UpdateApplicationRequestSchema,
  CreateRoleRequestSchema,
  UpdateRoleRequestSchema,
  RoleSchema,
  RegenerateSecretResponseSchema,
} from '../schemas/applications.js';
import {
  LicenseTypeSchema,
  CreateLicenseTypeRequestSchema,
  UpdateLicenseTypeRequestSchema,
  AppSubscriptionSchema,
  ProvisionSubscriptionRequestSchema,
  UpdateSubscriptionQuantityRequestSchema,
  GrantLicenseRequestSchema,
  RevokeLicenseRequestSchema,
  ChangeLicenseTypeRequestSchema,
  BulkGrantLicenseRequestSchema,
  BulkRevokeLicenseRequestSchema,
  TenantLicenseOverviewSchema,
  AppSubscriptionStatsSchema,
  LicenseAssignmentSchema,
} from '../schemas/licensing.js';
import {
  SsoProviderSchema,
  CreateSsoProviderRequestSchema,
  UpdateSsoProviderRequestSchema,
} from '../schemas/sso.js';

const c = initContract();

// =============================================================================
// SUPER ADMIN CONTRACT
// =============================================================================

export const superAdminContract = c.router(
  {
    // =========================================================================
    // AUTH
    // =========================================================================

    login: {
      method: 'POST',
      path: '/login',
      body: LoginRequestSchema,
      responses: {
        200: LoginResponseSchema,
        401: ErrorResponseSchema,
      },
      summary: 'Login as super admin',
    },

    logout: {
      method: 'POST',
      path: '/logout',
      body: z.object({}),
      responses: {
        200: SuccessResponseSchema,
      },
      summary: 'Logout (clears session cookie)',
    },

    getProfile: {
      method: 'GET',
      path: '/profile',
      responses: {
        200: SuperAdminSchema,
      },
      summary: 'Get current admin profile',
    },

    changePassword: {
      method: 'POST',
      path: '/change-password',
      body: ChangePasswordRequestSchema,
      responses: {
        200: SuccessResponseSchema,
      },
      summary: 'Change current admin password',
    },

    forgotPassword: {
      method: 'POST',
      path: '/forgot-password',
      body: ForgotPasswordRequestSchema,
      responses: {
        200: SuccessResponseSchema,
      },
      summary: 'Request password reset email',
    },

    verifyResetToken: {
      method: 'POST',
      path: '/verify-reset-token',
      body: VerifyResetTokenRequestSchema,
      responses: {
        200: z.object({ valid: z.boolean(), email: z.string().optional() }),
      },
      summary: 'Verify a password reset token',
    },

    resetPassword: {
      method: 'POST',
      path: '/reset-password',
      body: ResetPasswordRequestSchema,
      responses: {
        200: SuccessResponseSchema,
      },
      summary: 'Reset password using token',
    },

    // =========================================================================
    // ADMIN ACCOUNTS
    // =========================================================================

    getAdmins: {
      method: 'GET',
      path: '/admins',
      responses: {
        200: z.array(SuperAdminSchema),
      },
      summary: 'List all super admin accounts',
    },

    createAdmin: {
      method: 'POST',
      path: '/create-admin',
      body: CreateSuperAdminRequestSchema,
      responses: {
        201: SuperAdminSchema,
      },
      summary: 'Create a new super admin account',
    },

    deleteAdmin: {
      method: 'DELETE',
      path: '/admins/:id',
      pathParams: z.object({ id: IdSchema }),
      body: z.object({}),
      responses: {
        200: SuccessResponseSchema,
      },
      summary: 'Delete a super admin account',
    },

    // =========================================================================
    // MFA
    // =========================================================================

    mfaSetup: {
      method: 'POST',
      path: '/mfa/setup',
      body: z.object({}),
      responses: {
        200: MfaSetupResponseSchema,
      },
      summary: 'Initialize MFA setup (returns QR + backup codes)',
    },

    mfaEnable: {
      method: 'POST',
      path: '/mfa/enable',
      body: MfaEnableRequestSchema,
      responses: {
        200: SuccessResponseSchema,
      },
      summary: 'Enable MFA after verification',
    },

    mfaDisable: {
      method: 'DELETE',
      path: '/mfa/disable',
      body: MfaDisableRequestSchema,
      responses: {
        200: SuccessResponseSchema,
      },
      summary: 'Disable MFA',
    },

    mfaVerify: {
      method: 'POST',
      path: '/mfa/verify',
      body: MfaVerifyRequestSchema,
      responses: {
        200: MfaVerifyResponseSchema,
      },
      summary: 'Verify MFA code during login',
    },

    mfaStatus: {
      method: 'GET',
      path: '/mfa/status',
      responses: {
        200: MfaStatusResponseSchema,
      },
      summary: 'Get current admin MFA status',
    },

    getMfaPolicy: {
      method: 'GET',
      path: '/settings/mfa-policy',
      responses: {
        200: MfaPolicyResponseSchema,
      },
      summary: 'Get instance-wide MFA policy for super admins',
    },

    updateMfaPolicy: {
      method: 'PUT',
      path: '/settings/mfa-policy',
      body: UpdateMfaPolicyRequestSchema,
      responses: {
        200: z.object({ success: z.literal(true), superAdminMfaRequired: z.boolean() }),
      },
      summary: 'Update instance-wide MFA policy for super admins',
    },

    // =========================================================================
    // SYSTEM STATS
    // =========================================================================

    getSystemStats: {
      method: 'GET',
      path: '/stats',
      responses: {
        200: z.object({
          users: z.number(),
          tenants: z.number(),
          applications: z.number(),
          activeLicenses: z.number(),
        }),
      },
      summary: 'Get system-wide statistics',
    },

    // =========================================================================
    // USERS
    // =========================================================================

    getUsers: {
      method: 'GET',
      path: '/users',
      query: PaginationQuerySchema,
      responses: {
        200: UsersListResponseSchema,
      },
      summary: 'List all users (paginated)',
    },

    createUser: {
      method: 'POST',
      path: '/users',
      body: CreateUserRequestSchema,
      responses: {
        201: UserSchema,
      },
      summary: 'Create a new user',
    },

    getUser: {
      method: 'GET',
      path: '/users/:id',
      pathParams: z.object({ id: IdSchema }),
      responses: {
        200: UserDetailSchema,
        404: ErrorResponseSchema,
      },
      summary: 'Get user details with memberships',
    },

    updateUser: {
      method: 'PUT',
      path: '/users/:id',
      pathParams: z.object({ id: IdSchema }),
      body: UpdateUserRequestSchema,
      responses: {
        200: UserSchema,
      },
      summary: 'Update a user',
    },

    deleteUser: {
      method: 'DELETE',
      path: '/users/:id',
      pathParams: z.object({ id: IdSchema }),
      body: z.object({}),
      responses: {
        200: SuccessResponseSchema,
      },
      summary: 'Delete a user',
    },

    sendUserPasswordReset: {
      method: 'POST',
      path: '/users/:id/send-password-reset',
      pathParams: z.object({ id: IdSchema }),
      body: z.object({}),
      responses: {
        200: SuccessResponseSchema,
      },
      summary: 'Send password reset email to user',
    },

    // =========================================================================
    // TENANTS
    // =========================================================================

    getTenants: {
      method: 'GET',
      path: '/tenants',
      query: PaginationQuerySchema,
      responses: {
        200: TenantsListResponseSchema,
      },
      summary: 'List all tenants (paginated)',
    },

    createTenant: {
      method: 'POST',
      path: '/tenants',
      body: CreateTenantRequestSchema,
      responses: {
        201: TenantSchema,
      },
      summary: 'Create a new tenant',
    },

    getTenant: {
      method: 'GET',
      path: '/tenants/:id',
      pathParams: z.object({ id: IdSchema }),
      responses: {
        200: TenantDetailSchema,
        404: ErrorResponseSchema,
      },
      summary: 'Get tenant details with members',
    },

    updateTenant: {
      method: 'PUT',
      path: '/tenants/:id',
      pathParams: z.object({ id: IdSchema }),
      body: UpdateTenantRequestSchema,
      responses: {
        200: TenantSchema,
      },
      summary: 'Update a tenant',
    },

    deleteTenant: {
      method: 'DELETE',
      path: '/tenants/:id',
      pathParams: z.object({ id: IdSchema }),
      body: z.object({}),
      responses: {
        200: SuccessResponseSchema,
      },
      summary: 'Delete a tenant',
    },

    removeTenantMember: {
      method: 'DELETE',
      path: '/tenants/:tenantId/members/:membershipId',
      pathParams: z.object({ tenantId: IdSchema, membershipId: IdSchema }),
      body: z.object({}),
      responses: {
        200: SuccessResponseSchema,
      },
      summary: 'Remove a member from a tenant',
    },

    getAvailableUsersForTenant: {
      method: 'GET',
      path: '/tenants/:tenantId/available-users',
      pathParams: z.object({ tenantId: IdSchema }),
      responses: {
        200: z.array(z.object({
          id: z.string(),
          email: z.string().nullable(),
          givenName: z.string().nullable(),
          familyName: z.string().nullable(),
        })),
      },
      summary: 'Get users not yet in this tenant',
    },

    inviteUserToTenant: {
      method: 'POST',
      path: '/tenants/:tenantId/invite',
      pathParams: z.object({ tenantId: IdSchema }),
      body: InviteToTenantRequestSchema,
      responses: {
        200: SuccessResponseSchema,
      },
      summary: 'Invite a user to a tenant',
    },

    // -------------------------------------------------------------------------
    // Tenant MFA
    // -------------------------------------------------------------------------

    getTenantMfaPolicy: {
      method: 'GET',
      path: '/tenants/:tenantId/mfa-policy',
      pathParams: z.object({ tenantId: IdSchema }),
      responses: {
        200: TenantMfaPolicyResponseSchema,
      },
      summary: 'Get tenant MFA policy',
    },

    updateTenantMfaPolicy: {
      method: 'PUT',
      path: '/tenants/:tenantId/mfa-policy',
      pathParams: z.object({ tenantId: IdSchema }),
      body: TenantMfaPolicyRequestSchema,
      responses: {
        200: TenantMfaPolicyResponseSchema,
      },
      summary: 'Update tenant MFA policy',
    },

    getTenantMfaStats: {
      method: 'GET',
      path: '/tenants/:tenantId/mfa-stats',
      pathParams: z.object({ tenantId: IdSchema }),
      responses: {
        200: TenantMfaStatsResponseSchema,
      },
      summary: 'Get tenant MFA enrollment stats',
    },

    // -------------------------------------------------------------------------
    // Service Accounts
    // -------------------------------------------------------------------------

    listServiceAccounts: {
      method: 'GET',
      path: '/tenants/:tenantId/service-accounts',
      pathParams: z.object({ tenantId: IdSchema }),
      responses: {
        200: z.array(ServiceAccountSchema),
      },
      summary: 'List service accounts for a tenant',
    },

    createServiceAccount: {
      method: 'POST',
      path: '/tenants/:tenantId/service-accounts',
      pathParams: z.object({ tenantId: IdSchema }),
      body: CreateServiceAccountRequestSchema,
      responses: {
        201: ServiceAccountSchema,
      },
      summary: 'Create a service account',
    },

    updateServiceAccountRoles: {
      method: 'PUT',
      path: '/tenants/:tenantId/service-accounts/:serviceAccountId/roles',
      pathParams: z.object({ tenantId: IdSchema, serviceAccountId: IdSchema }),
      body: UpdateServiceAccountRolesRequestSchema,
      responses: {
        200: ServiceAccountSchema,
      },
      summary: 'Update service account roles',
    },

    revokeServiceAccount: {
      method: 'DELETE',
      path: '/tenants/:tenantId/service-accounts/:serviceAccountId',
      pathParams: z.object({ tenantId: IdSchema, serviceAccountId: IdSchema }),
      body: z.object({}),
      responses: {
        200: SuccessResponseSchema,
      },
      summary: 'Revoke a service account',
    },

    // =========================================================================
    // APPLICATIONS
    // =========================================================================

    getApplications: {
      method: 'GET',
      path: '/applications',
      responses: {
        200: z.array(ApplicationWithRolesSchema),
      },
      summary: 'List all applications with roles',
    },

    createApplication: {
      method: 'POST',
      path: '/applications',
      body: CreateApplicationRequestSchema,
      responses: {
        201: ApplicationWithRolesSchema,
      },
      summary: 'Create an application',
    },

    updateApplication: {
      method: 'PUT',
      path: '/applications/:id',
      pathParams: z.object({ id: IdSchema }),
      body: UpdateApplicationRequestSchema,
      responses: {
        200: ApplicationWithRolesSchema,
      },
      summary: 'Update an application',
    },

    deleteApplication: {
      method: 'DELETE',
      path: '/applications/:id',
      pathParams: z.object({ id: IdSchema }),
      body: z.object({}),
      responses: {
        200: SuccessResponseSchema,
      },
      summary: 'Delete an application',
    },

    disableApplication: {
      method: 'POST',
      path: '/applications/:id/disable',
      pathParams: z.object({ id: IdSchema }),
      body: z.object({}),
      responses: {
        200: ApplicationWithRolesSchema,
      },
      summary: 'Disable an application',
    },

    enableApplication: {
      method: 'POST',
      path: '/applications/:id/enable',
      pathParams: z.object({ id: IdSchema }),
      body: z.object({}),
      responses: {
        200: ApplicationWithRolesSchema,
      },
      summary: 'Enable an application',
    },

    regenerateClientSecret: {
      method: 'POST',
      path: '/applications/:id/regenerate-secret',
      pathParams: z.object({ id: IdSchema }),
      body: z.object({}),
      responses: {
        200: RegenerateSecretResponseSchema,
      },
      summary: 'Regenerate client secret (shown once)',
    },

    revokeClientSecret: {
      method: 'DELETE',
      path: '/applications/:id/revoke-secret',
      pathParams: z.object({ id: IdSchema }),
      body: z.object({}),
      responses: {
        200: SuccessResponseSchema,
      },
      summary: 'Revoke client secret (disables M2M auth)',
    },

    // -------------------------------------------------------------------------
    // Application Roles
    // -------------------------------------------------------------------------

    createRole: {
      method: 'POST',
      path: '/applications/:appId/roles',
      pathParams: z.object({ appId: IdSchema }),
      body: CreateRoleRequestSchema,
      responses: {
        201: RoleSchema,
      },
      summary: 'Create a role for an application',
    },

    updateRole: {
      method: 'PUT',
      path: '/roles/:id',
      pathParams: z.object({ id: IdSchema }),
      body: UpdateRoleRequestSchema,
      responses: {
        200: RoleSchema,
      },
      summary: 'Update a role',
    },

    deleteRole: {
      method: 'DELETE',
      path: '/roles/:id',
      pathParams: z.object({ id: IdSchema }),
      body: z.object({}),
      responses: {
        200: SuccessResponseSchema,
      },
      summary: 'Delete a role',
    },

    setDefaultRole: {
      method: 'POST',
      path: '/roles/:id/set-default',
      pathParams: z.object({ id: IdSchema }),
      body: z.object({}),
      responses: {
        200: RoleSchema,
      },
      summary: 'Set a role as default for its application',
    },

    // =========================================================================
    // TENANT ROLES & MEMBERSHIPS
    // =========================================================================

    getTenantRoles: {
      method: 'GET',
      path: '/tenant-roles',
      responses: {
        200: z.array(TenantRoleSchema),
      },
      summary: 'List all tenant roles',
    },

    getMembershipTenantRoles: {
      method: 'GET',
      path: '/memberships/:membershipId/tenant-roles',
      pathParams: z.object({ membershipId: IdSchema }),
      responses: {
        200: z.array(TenantRoleSchema),
      },
      summary: 'Get tenant roles for a membership',
    },

    assignTenantRole: {
      method: 'POST',
      path: '/memberships/:membershipId/tenant-roles',
      pathParams: z.object({ membershipId: IdSchema }),
      body: AssignTenantRoleRequestSchema,
      responses: {
        200: z.object({
          success: z.literal(true),
          message: z.string(),
          roles: z.array(TenantRoleSchema),
        }),
      },
      summary: 'Assign a tenant role to a membership',
    },

    removeTenantRole: {
      method: 'DELETE',
      path: '/memberships/:membershipId/tenant-roles/:roleSlug',
      pathParams: z.object({ membershipId: IdSchema, roleSlug: z.string() }),
      body: z.object({}),
      responses: {
        200: SuccessResponseSchema,
      },
      summary: 'Remove a tenant role from a membership',
    },

    updateMemberRoles: {
      method: 'PUT',
      path: '/memberships/:membershipId/roles',
      pathParams: z.object({ membershipId: IdSchema }),
      body: z.object({ roleIds: z.array(z.string()) }),
      responses: {
        200: SuccessResponseSchema,
      },
      summary: 'Update app roles for a membership',
    },

    updateMembershipStatus: {
      method: 'PUT',
      path: '/memberships/:membershipId/status',
      pathParams: z.object({ membershipId: IdSchema }),
      body: z.object({ status: z.enum(['ACTIVE', 'SUSPENDED', 'INVITED']) }),
      responses: {
        200: SuccessResponseSchema,
      },
      summary: 'Update membership status',
    },

    // =========================================================================
    // DOMAINS
    // =========================================================================

    getTenantDomains: {
      method: 'GET',
      path: '/domains/tenant/:tenantId',
      pathParams: z.object({ tenantId: IdSchema }),
      responses: {
        200: z.array(DomainSchema),
      },
      summary: 'List domains for a tenant',
    },

    registerDomain: {
      method: 'POST',
      path: '/domains/register',
      body: RegisterDomainRequestSchema,
      responses: {
        201: DomainSchema,
      },
      summary: 'Register a domain for a tenant',
    },

    verifyDomain: {
      method: 'POST',
      path: '/domains/:domainId/verify',
      pathParams: z.object({ domainId: IdSchema }),
      body: z.object({}),
      responses: {
        200: DomainSchema,
      },
      summary: 'Verify domain ownership via DNS',
    },

    deleteDomain: {
      method: 'DELETE',
      path: '/domains/:domainId',
      pathParams: z.object({ domainId: IdSchema }),
      body: z.object({}),
      responses: {
        200: SuccessResponseSchema,
      },
      summary: 'Delete a domain',
    },

    // =========================================================================
    // SSO
    // =========================================================================

    getSsoProviders: {
      method: 'GET',
      path: '/sso/providers',
      responses: {
        200: z.array(SsoProviderSchema),
      },
      summary: 'List all SSO providers',
    },

    getSsoProvider: {
      method: 'GET',
      path: '/sso/providers/:provider',
      pathParams: z.object({ provider: z.string() }),
      responses: {
        200: SsoProviderSchema,
        404: ErrorResponseSchema,
      },
      summary: 'Get SSO provider config',
    },

    createSsoProvider: {
      method: 'POST',
      path: '/sso/providers',
      body: CreateSsoProviderRequestSchema,
      responses: {
        201: SsoProviderSchema,
      },
      summary: 'Create or upsert an SSO provider',
    },

    updateSsoProvider: {
      method: 'PUT',
      path: '/sso/providers/:provider',
      pathParams: z.object({ provider: z.string() }),
      body: UpdateSsoProviderRequestSchema,
      responses: {
        200: SsoProviderSchema,
      },
      summary: 'Update an SSO provider',
    },

    deleteSsoProvider: {
      method: 'DELETE',
      path: '/sso/providers/:provider',
      pathParams: z.object({ provider: z.string() }),
      body: z.object({}),
      responses: {
        200: SuccessResponseSchema,
      },
      summary: 'Delete an SSO provider',
    },

    testSsoProvider: {
      method: 'POST',
      path: '/sso/providers/:provider/test',
      pathParams: z.object({ provider: z.string() }),
      body: z.object({}),
      responses: {
        200: z.object({ success: z.boolean(), message: z.string() }),
      },
      summary: 'Test SSO provider connectivity',
    },
  },
  {
    pathPrefix: '/super-admin',
    strictStatusCodes: true,
  },
);
