import {
  ADMIN_PERMISSIONS,
  MEMBER_PERMISSIONS,
  OWNER_PERMISSIONS,
  TENANT_PERMISSIONS,
} from "./permissions";

describe("permissions constants", () => {
  it("OWNER_PERMISSIONS includes all tenant permissions", () => {
    expect(OWNER_PERMISSIONS).toHaveLength(
      Object.values(TENANT_PERMISSIONS).length,
    );
    expect(OWNER_PERMISSIONS).toEqual(
      expect.arrayContaining(Object.values(TENANT_PERMISSIONS)),
    );
  });

  it("ADMIN_PERMISSIONS includes key admin actions and excludes destructive tenant delete", () => {
    expect(ADMIN_PERMISSIONS).toEqual(
      expect.arrayContaining([
        TENANT_PERMISSIONS.MEMBERS_INVITE,
        TENANT_PERMISSIONS.LICENSES_MANAGE,
        TENANT_PERMISSIONS.DOMAINS_MANAGE,
      ]),
    );
    expect(ADMIN_PERMISSIONS).not.toContain(TENANT_PERMISSIONS.TENANT_DELETE);
  });

  it("MEMBER_PERMISSIONS is minimal subset", () => {
    expect(MEMBER_PERMISSIONS).toEqual([
      TENANT_PERMISSIONS.TENANT_VIEW,
      TENANT_PERMISSIONS.MEMBERS_VIEW,
      TENANT_PERMISSIONS.LICENSES_VIEW,
      TENANT_PERMISSIONS.APP_ACCESS_VIEW,
    ]);
  });
});
