import {
  hasTenantPermission,
  tenantPermissionMatches,
  DEFAULT_TENANT_ROLES,
  SYSTEM_TENANT_ROLE_SLUGS,
} from "./default-tenant-roles";

describe("default-tenant-roles helpers", () => {
  it("exposes expected system role slugs and role entries", () => {
    expect(SYSTEM_TENANT_ROLE_SLUGS).toEqual({
      OWNER: "owner",
      ADMIN: "admin",
      MEMBER: "member",
    });

    const slugs = DEFAULT_TENANT_ROLES.map((r) => r.slug);
    expect(slugs).toEqual(expect.arrayContaining(["owner", "admin", "member"]));
  });

  it("matches explicit wildcard namespaces", () => {
    expect(tenantPermissionMatches("tenant:*", "tenant:update")).toBe(true);
    expect(tenantPermissionMatches("members:*", "members:invite")).toBe(true);
    expect(tenantPermissionMatches("licenses:*", "licenses:assign")).toBe(true);
    expect(
      tenantPermissionMatches("service-accounts:*", "service-accounts:create"),
    ).toBe(true);
    expect(tenantPermissionMatches("domains:*", "domains:verify")).toBe(true);
    expect(tenantPermissionMatches("billing:*", "billing:view")).toBe(true);
    expect(tenantPermissionMatches("app-access:*", "app-access:grant")).toBe(
      true,
    );
  });

  it("matches generic :* wildcard and exact values", () => {
    expect(tenantPermissionMatches("custom:*", "custom:action")).toBe(true);
    expect(tenantPermissionMatches("custom:*", "other:action")).toBe(false);
    expect(tenantPermissionMatches("members:invite", "members:invite")).toBe(
      true,
    );
    expect(tenantPermissionMatches("members:invite", "members:remove")).toBe(
      false,
    );
  });

  it("hasTenantPermission returns true when any pattern matches", () => {
    const permissions = ["members:view", "licenses:*"];
    expect(hasTenantPermission(permissions, "licenses:assign")).toBe(true);
  });

  it("hasTenantPermission returns false when no patterns match", () => {
    const permissions = ["members:view", "domains:verify"];
    expect(hasTenantPermission(permissions, "licenses:assign")).toBe(false);
  });
});
