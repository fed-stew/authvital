/**
 * Standard Tenant-Level Permissions
 *
 * These permissions control what actions a user can perform within a tenant,
 * regardless of the specific application. They are included in the JWT's
 * `tenant_permissions` claim.
 *
 * @packageDocumentation
 */

/**
 * All available tenant-level permissions.
 *
 * These are organized by category:
 * - Tenant Settings: `tenant:*`
 * - Member Management: `members:*`
 * - License Management: `licenses:*`
 * - Service Accounts: `service-accounts:*`
 * - Domains: `domains:*`
 * - Billing: `billing:*`
 * - Application Access: `app-access:*`
 * - SSO Configuration: `tenant:sso:*`
 *
 * @example
 * ```ts
 * import { TENANT_PERMISSIONS } from '@authvital/shared';
 *
 * // Check if user has permission
 * if (userPermissions.includes(TENANT_PERMISSIONS.MEMBERS_INVITE)) {
 *   // Allow invite
 * }
 * ```
 */
export const TENANT_PERMISSIONS = {
  // ─────────────────────────────────────────────────────────────────────────────
  // Tenant Settings
  // ─────────────────────────────────────────────────────────────────────────────
  /** View tenant information and settings */
  TENANT_VIEW: 'tenant:view',
  /** Modify tenant settings */
  TENANT_MANAGE: 'tenant:manage',
  /** Delete the tenant */
  TENANT_DELETE: 'tenant:delete',

  // ─────────────────────────────────────────────────────────────────────────────
  // Member Management
  // ─────────────────────────────────────────────────────────────────────────────
  /** View tenant members */
  MEMBERS_VIEW: 'members:view',
  /** Send invitations to new members */
  MEMBERS_INVITE: 'members:invite',
  /** Remove members from the tenant */
  MEMBERS_REMOVE: 'members:remove',
  /** Assign/change member roles */
  MEMBERS_MANAGE_ROLES: 'members:manage-roles',

  // ─────────────────────────────────────────────────────────────────────────────
  // License Management
  // ─────────────────────────────────────────────────────────────────────────────
  /** View license information and assignments */
  LICENSES_VIEW: 'licenses:view',
  /** Grant/revoke licenses to users */
  LICENSES_MANAGE: 'licenses:manage',
  /** Purchase/provision new subscriptions */
  LICENSES_PROVISION: 'licenses:provision',

  // ─────────────────────────────────────────────────────────────────────────────
  // Service Accounts
  // ─────────────────────────────────────────────────────────────────────────────
  /** View service accounts and API keys */
  SERVICE_ACCOUNTS_VIEW: 'service-accounts:view',
  /** Create/modify/delete service accounts */
  SERVICE_ACCOUNTS_MANAGE: 'service-accounts:manage',

  // ─────────────────────────────────────────────────────────────────────────────
  // Domains
  // ─────────────────────────────────────────────────────────────────────────────
  /** View domain claims */
  DOMAINS_VIEW: 'domains:view',
  /** Add/verify/remove domains */
  DOMAINS_MANAGE: 'domains:manage',

  // ─────────────────────────────────────────────────────────────────────────────
  // Billing
  // ─────────────────────────────────────────────────────────────────────────────
  /** View billing information and invoices */
  BILLING_VIEW: 'billing:view',
  /** Modify payment methods and subscriptions */
  BILLING_MANAGE: 'billing:manage',

  // ─────────────────────────────────────────────────────────────────────────────
  // Application Access
  // ─────────────────────────────────────────────────────────────────────────────
  /** View application access settings */
  APP_ACCESS_VIEW: 'app-access:view',
  /** Manage application access for users */
  APP_ACCESS_MANAGE: 'app-access:manage',

  // ─────────────────────────────────────────────────────────────────────────────
  // SSO Configuration
  // ─────────────────────────────────────────────────────────────────────────────
  /** Configure SSO providers */
  SSO_MANAGE: 'tenant:sso:manage',
} as const;

/**
 * Type representing any valid tenant permission value.
 *
 * @example
 * ```ts
 * function checkPermission(permission: TenantPermission): boolean {
 *   // ...
 * }
 * ```
 */
export type TenantPermission =
  (typeof TENANT_PERMISSIONS)[keyof typeof TENANT_PERMISSIONS];

/**
 * All permissions - granted to tenant owners.
 *
 * Owners have complete control over the tenant.
 */
export const OWNER_PERMISSIONS: TenantPermission[] = Object.values(
  TENANT_PERMISSIONS,
);

/**
 * Admin permissions - operational management of the tenant.
 *
 * Admins can manage most aspects of the tenant but cannot:
 * - Delete the tenant
 * - Provision new subscriptions
 * - Manage billing
 */
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

/**
 * Member permissions - basic read access.
 *
 * Regular members can only view information, not modify it.
 */
export const MEMBER_PERMISSIONS: TenantPermission[] = [
  TENANT_PERMISSIONS.TENANT_VIEW,
  TENANT_PERMISSIONS.MEMBERS_VIEW,
  TENANT_PERMISSIONS.LICENSES_VIEW,
  TENANT_PERMISSIONS.APP_ACCESS_VIEW,
];
