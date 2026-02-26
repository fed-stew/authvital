/**
 * Super Admin Services Barrel Export
 *
 * These services handle super admin operations, broken down by domain:
 * - AdminAuthService: Authentication, password management, admin CRUD
 * - AdminUsersService: User management across the instance
 * - AdminTenantsService: Tenant CRUD, members, domains, tenant roles
 * - AdminServiceAccountsService: Service account (machine user) management
 * - AdminApplicationsService: Application CRUD, OAuth config, branding
 * - AdminRolesService: Application role management
 * - AdminLicensingService: License types, subscriptions, assignments
 * - AdminInstanceService: System stats, instance config, API keys
 */

export * from './admin-auth.service';
export * from './admin-users.service';
export * from './admin-tenants.service';
export * from './admin-service-accounts.service';
export * from './admin-applications.service';
export * from './admin-roles.service';
export * from './admin-licensing.service';
export * from './admin-instance.service';
export * from './admin-sso.service';
