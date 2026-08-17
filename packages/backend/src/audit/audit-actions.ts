/**
 * Canonical audit action + target-type identifiers.
 *
 * Single source of truth so producers (services that emit audit entries) and
 * any future consumers (filters, dashboards) never drift on free-form strings.
 * Values are stable `domain.verb` tokens — DO NOT rename once shipped, or
 * historical rows become unqueryable.
 */
export const AUDIT_ACTIONS = {
  MEMBER_ROLE_CHANGED: 'member.role_changed',
  MEMBER_REMOVED: 'member.removed',
  MEMBER_STATUS_CHANGED: 'member.status_changed',

  INVITE_CREATED: 'invite.created',
  INVITE_REVOKED: 'invite.revoked',

  APP_ACCESS_GRANTED: 'app_access.granted',
  APP_ACCESS_REVOKED: 'app_access.revoked',
  APP_ROLE_CHANGED: 'app_access.role_changed',

  LICENSE_GRANTED: 'license.granted',
  LICENSE_REVOKED: 'license.revoked',
  LICENSE_CHANGED: 'license.changed',

  SUBSCRIPTION_PROVISIONED: 'subscription.provisioned',
  SUBSCRIPTION_RESIZED: 'subscription.resized',
  SUBSCRIPTION_CANCELED: 'subscription.canceled',

  SSO_CONFIG_UPDATED: 'sso.config_updated',
  SSO_CONFIG_REMOVED: 'sso.config_removed',

  DOMAIN_ADDED: 'domain.added',
  DOMAIN_VERIFIED: 'domain.verified',
  DOMAIN_REMOVED: 'domain.removed',

  TENANT_SETTINGS_UPDATED: 'tenant.settings_updated',
  MFA_POLICY_UPDATED: 'tenant.mfa_policy_updated',
  MFA_ENROLLMENT_INTERRUPT: 'mfa.enrollment_interrupt',
  MFA_ENROLLMENT_RESUMED: 'mfa.enrollment_resumed',
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export const AUDIT_TARGET_TYPES = {
  MEMBERSHIP: 'membership',
  INVITATION: 'invitation',
  APP_ACCESS: 'app_access',
  LICENSE_ASSIGNMENT: 'license_assignment',
  SUBSCRIPTION: 'subscription',
  SSO_CONFIG: 'sso_config',
  DOMAIN: 'domain',
  TENANT: 'tenant',
  USER: 'user',
} as const;

export type AuditTargetType =
  (typeof AUDIT_TARGET_TYPES)[keyof typeof AUDIT_TARGET_TYPES];
