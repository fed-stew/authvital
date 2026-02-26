import {
  RequireAnyPermission,
  RequirePermission,
  RequirePermissions,
  REQUIRED_ANY_PERMISSION_KEY,
  REQUIRED_PERMISSION_KEY,
  REQUIRED_PERMISSIONS_KEY,
} from "./require-permission.decorator";

describe("require-permission decorators", () => {
  class TestController {
    @RequirePermission("members:invite")
    single() {
      return true;
    }

    @RequirePermissions(["members:view", "licenses:manage"])
    all() {
      return true;
    }

    @RequireAnyPermission(["domains:verify", "licenses:manage"])
    any() {
      return true;
    }
  }

  it("sets single permission metadata", () => {
    const value = Reflect.getMetadata(
      REQUIRED_PERMISSION_KEY,
      TestController.prototype.single,
    );
    expect(value).toBe("members:invite");
  });

  it("sets all-required permissions metadata", () => {
    const value = Reflect.getMetadata(
      REQUIRED_PERMISSIONS_KEY,
      TestController.prototype.all,
    );
    expect(value).toEqual(["members:view", "licenses:manage"]);
  });

  it("sets any-required permissions metadata", () => {
    const value = Reflect.getMetadata(
      REQUIRED_ANY_PERMISSION_KEY,
      TestController.prototype.any,
    );
    expect(value).toEqual(["domains:verify", "licenses:manage"]);
  });
});
