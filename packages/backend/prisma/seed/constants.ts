// =============================================================================
// SEED CONSTANTS
// =============================================================================

/** bcrypt cost factor used everywhere we hash a seeded secret/password. */
export const SALT_ROUNDS = 12;

/**
 * System tenant roles — always seeded, always required before any membership
 * can reference a `tenant_role`. Kept here as the single source of truth for
 * both the standalone seed and the docker bootstrap path.
 */
export const SYSTEM_TENANT_ROLES = [
  {
    name: 'Owner',
    slug: 'owner',
    description: 'Full control over the tenant. Cannot be removed if last owner.',
    permissions: ['tenant:*'],
  },
  {
    name: 'Admin',
    slug: 'admin',
    description: 'Operational management of the tenant.',
    permissions: [
      'tenant:view',
      'tenant:manage',
      'members:view',
      'members:invite',
      'members:remove',
      'members:manage-roles',
      'licenses:view',
      'licenses:manage',
      'service-accounts:view',
      'service-accounts:manage',
      'domains:view',
      'domains:manage',
      'billing:view',
      'app-access:view',
      'app-access:manage',
      'tenant:sso:manage',
      'audit:view',
    ],
  },
  {
    name: 'Member',
    slug: 'member',
    description: 'Standard tenant membership with minimal permissions.',
    permissions: ['tenant:view', 'members:view', 'licenses:view', 'app-access:view'],
  },
  {
    name: 'Billing Admin',
    slug: 'billing-admin',
    description:
      'Manages subscriptions, license seats, and billing without full tenant control.',
    permissions: [
      'tenant:view',
      'members:view',
      'licenses:view',
      'licenses:manage',
      'licenses:provision',
      'billing:view',
      'billing:manage',
      'app-access:view',
      'app-access:manage',
    ],
  },
];
