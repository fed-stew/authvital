/**
 * Standard Tenant-Level Permissions
 *
 * These permissions control what actions a user can perform within a tenant,
 * regardless of the specific application. They are included in the JWT's
 * `tenant_permissions` claim.
 */

export const TENANT_PERMISSIONS = {
  // Tenant Settings
  TENANT_VIEW: 'tenant:view',
  TENANT_MANAGE: 'tenant:manage',
  TENANT_DELETE: 'tenant:delete',

  // Member Management
  MEMBERS_VIEW: 'members:view',
  MEMBERS_INVITE: 'members:invite',
  MEMBERS_REMOVE: 'members:remove',
  MEMBERS_MANAGE_ROLES: 'members:manage-roles',

  // License Management
  LICENSES_VIEW: 'licenses:view',
  LICENSES_MANAGE: 'licenses:manage', // Grant/revoke licenses to users
  LICENSES_PROVISION: 'licenses:provision', // Purchase/provision new subscriptions

  // Service Accounts
  SERVICE_ACCOUNTS_VIEW: 'service-accounts:view',
  SERVICE_ACCOUNTS_MANAGE: 'service-accounts:manage',

  // Domains
  DOMAINS_VIEW: 'domains:view',
  DOMAINS_MANAGE: 'domains:manage',

  // Billing
  BILLING_VIEW: 'billing:view',
  BILLING_MANAGE: 'billing:manage',

  // Application Access
  APP_ACCESS_VIEW: 'app-access:view',
  APP_ACCESS_MANAGE: 'app-access:manage',

  // SSO Configuration
  SSO_MANAGE: 'tenant:sso:manage',
} as const;

export type TenantPermission = typeof TENANT_PERMISSIONS[keyof typeof TENANT_PERMISSIONS];

/**
 * Permission sets for common roles
 */
export const OWNER_PERMISSIONS: TenantPermission[] = Object.values(TENANT_PERMISSIONS);

export const ADMIN_PERMISSIONS: TenantPermission[] = [
  TENANT_PERMISSIONS.TENANT_VIEW,
  TENANT_PERMISSIONS.TENANT_MANAGE,
  TENANT_PERMISSIONS.MEMBERS_VIEW,
  TENANT_PERMISSIONS.MEMBERS_INVITE,
  TENANT_PERMISSIONS.MEMBERS_REMOVE,
  TENANT_PERMISSIONS.MEMBERS_MANAGE_ROLES,
  TENANT_PERMISSIONS.LICENSES_VIEW,
  TENANT_PERMISSIONS.LICENSES_MANAGE,
  TENANT_PERMISSIONS.SERVICE_ACCOUNTS_VIEW,
  TENANT_PERMISSIONS.SERVICE_ACCOUNTS_MANAGE,
  TENANT_PERMISSIONS.DOMAINS_VIEW,
  TENANT_PERMISSIONS.DOMAINS_MANAGE,
  TENANT_PERMISSIONS.BILLING_VIEW,
  TENANT_PERMISSIONS.APP_ACCESS_VIEW,
  TENANT_PERMISSIONS.APP_ACCESS_MANAGE,
  TENANT_PERMISSIONS.SSO_MANAGE,
];

export const MEMBER_PERMISSIONS: TenantPermission[] = [
  TENANT_PERMISSIONS.TENANT_VIEW,
  TENANT_PERMISSIONS.MEMBERS_VIEW,
  TENANT_PERMISSIONS.LICENSES_VIEW,
  TENANT_PERMISSIONS.APP_ACCESS_VIEW,
];
