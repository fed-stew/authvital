import {
  resolveEffectiveTenantPermissions,
  membershipIsOwner,
} from './tenant-permissions.util';
import {
  TENANT_PERMISSIONS,
  ADMIN_PERMISSIONS,
  MEMBER_PERMISSIONS,
  BILLING_ADMIN_PERMISSIONS,
} from '@authvital/shared';

describe('resolveEffectiveTenantPermissions', () => {
  it('expands an owner (seeded ["tenant:*"]) to the FULL permission set', () => {
    const perms = resolveEffectiveTenantPermissions([
      { slug: 'owner', permissions: ['tenant:*'] },
    ]);
    // The whole point: owner must reach cross-namespace perms the wildcard
    // does NOT match on its own.
    expect(perms).toContain(TENANT_PERMISSIONS.LICENSES_MANAGE);
    expect(perms).toContain(TENANT_PERMISSIONS.LICENSES_PROVISION);
    expect(perms).toContain(TENANT_PERMISSIONS.MEMBERS_INVITE);
    expect(perms).toContain(TENANT_PERMISSIONS.DOMAINS_MANAGE);
    expect(perms).toContain(TENANT_PERMISSIONS.TENANT_DELETE);
  });

  it('returns the explicit set (de-duped) for a non-owner admin', () => {
    const perms = resolveEffectiveTenantPermissions([
      { slug: 'admin', permissions: ADMIN_PERMISSIONS as unknown as string[] },
    ]);
    expect(perms).toContain(TENANT_PERMISSIONS.LICENSES_MANAGE);
    // Admin cannot delete the tenant or provision.
    expect(perms).not.toContain(TENANT_PERMISSIONS.TENANT_DELETE);
    expect(perms).not.toContain(TENANT_PERMISSIONS.LICENSES_PROVISION);
  });

  it('gives a member only read-level license access', () => {
    const perms = resolveEffectiveTenantPermissions([
      { slug: 'member', permissions: MEMBER_PERMISSIONS as unknown as string[] },
    ]);
    expect(perms).toContain(TENANT_PERMISSIONS.LICENSES_VIEW);
    expect(perms).not.toContain(TENANT_PERMISSIONS.LICENSES_MANAGE);
  });

  it('gives a billing-admin provisioning + billing but NOT god rights', () => {
    const perms = resolveEffectiveTenantPermissions([
      { slug: 'billing-admin', permissions: BILLING_ADMIN_PERMISSIONS as unknown as string[] },
    ]);
    expect(perms).toContain(TENANT_PERMISSIONS.LICENSES_PROVISION);
    expect(perms).toContain(TENANT_PERMISSIONS.BILLING_MANAGE);
    // Not a god: cannot manage members, domains, or delete the tenant.
    expect(perms).not.toContain(TENANT_PERMISSIONS.MEMBERS_INVITE);
    expect(perms).not.toContain(TENANT_PERMISSIONS.DOMAINS_MANAGE);
    expect(perms).not.toContain(TENANT_PERMISSIONS.TENANT_DELETE);
  });

  it('owner + another role still yields the full owner set', () => {
    const perms = resolveEffectiveTenantPermissions([
      { slug: 'member', permissions: MEMBER_PERMISSIONS as unknown as string[] },
      { slug: 'owner', permissions: ['tenant:*'] },
    ]);
    expect(perms).toContain(TENANT_PERMISSIONS.TENANT_DELETE);
  });

  it('membershipIsOwner detects the owner role', () => {
    expect(membershipIsOwner([{ slug: 'owner' }])).toBe(true);
    expect(membershipIsOwner([{ slug: 'admin' }, { slug: 'member' }])).toBe(false);
  });
});
