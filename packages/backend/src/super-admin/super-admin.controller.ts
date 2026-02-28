/**
 * @deprecated This controller has been split into multiple sub-controllers
 * for better maintainability. See:
 * - super-admin-auth.controller.ts - Authentication, MFA, password management
 * - super-admin-users.controller.ts - User management
 * - super-admin-tenants.controller.ts - Tenant management, MFA policies
 * - super-admin-apps.controller.ts - Application management, roles
 * - super-admin-sso.controller.ts - SSO configuration, domains
 *
 * Import from './controllers/index' for individual controllers.
 */
export * from './controllers';
