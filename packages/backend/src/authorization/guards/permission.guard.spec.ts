import { ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import {
  REQUIRED_ANY_PERMISSION_KEY,
  REQUIRED_PERMISSION_KEY,
  REQUIRED_PERMISSIONS_KEY,
} from "../decorators/require-permission.decorator";
import { PermissionGuard } from "./permission.guard";

describe("PermissionGuard", () => {
  const mockReflector = {
    get: jest.fn(),
  } as unknown as Reflector;

  const createContext = (request: any = {}, handler = jest.fn()) => ({
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handler,
  });

  let guard: PermissionGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new PermissionGuard(mockReflector);
  });

  const setMetadata = ({
    single,
    all,
    any,
  }: {
    single?: string;
    all?: string[];
    any?: string[];
  }) => {
    (mockReflector.get as jest.Mock).mockImplementation((key: string) => {
      if (key === REQUIRED_PERMISSION_KEY) return single;
      if (key === REQUIRED_PERMISSIONS_KEY) return all;
      if (key === REQUIRED_ANY_PERMISSION_KEY) return any;
      return undefined;
    });
  };

  it("throws when request.user is missing", () => {
    setMetadata({});
    const context = createContext({});

    expect(() => guard.canActivate(context as any)).toThrow(
      new ForbiddenException("No authenticated user"),
    );
  });

  it("allows when no permission metadata exists", () => {
    setMetadata({});
    const context = createContext({
      user: { sub: "u1", tenant_permissions: [] },
    });

    expect(guard.canActivate(context as any)).toBe(true);
  });

  it("enforces single required permission and allows match", () => {
    setMetadata({ single: "members:invite" });
    const context = createContext({
      user: {
        sub: "u1",
        tenant_id: "t1",
        tenant_permissions: ["members:invite"],
      },
      params: { tenantId: "t1" },
    });

    expect(guard.canActivate(context as any)).toBe(true);
  });

  it("rejects single required permission when missing", () => {
    setMetadata({ single: "members:invite" });
    const context = createContext({
      user: { sub: "u1", tenant_permissions: ["members:view"] },
    });

    expect(() => guard.canActivate(context as any)).toThrow(
      new ForbiddenException(
        "Access denied: Missing required permission 'members:invite'",
      ),
    );
  });

  it("rejects when request tenant mismatches authenticated tenant (body)", () => {
    setMetadata({ single: "members:view" });
    const context = createContext({
      user: {
        sub: "u1",
        tenant_id: "t1",
        tenant_permissions: ["members:view"],
      },
      body: { tenantId: "t2" },
    });

    expect(() => guard.canActivate(context as any)).toThrow(
      new ForbiddenException(
        "Access denied: You can only access resources in your authenticated tenant",
      ),
    );
  });

  it("enforces multiple all-required permissions", () => {
    setMetadata({ all: ["members:view", "licenses:manage"] });
    const context = createContext({
      user: { sub: "u1", tenant_permissions: ["members:view", "licenses:*"] },
    });

    expect(guard.canActivate(context as any)).toBe(true);
  });

  it("rejects when one of all-required permissions is missing", () => {
    setMetadata({ all: ["members:view", "licenses:manage"] });
    const context = createContext({
      user: { sub: "u1", tenant_permissions: ["members:view"] },
    });

    expect(() => guard.canActivate(context as any)).toThrow(
      new ForbiddenException(
        "Access denied: Missing required permission 'licenses:manage'",
      ),
    );
  });

  it("enforces any-required permissions", () => {
    setMetadata({ any: ["domains:verify", "licenses:manage"] });
    const context = createContext({
      user: { sub: "u1", tenant_permissions: ["licenses:*"] },
      query: { tenantId: "t1" },
    });

    expect(guard.canActivate(context as any)).toBe(true);
  });

  it("rejects when none of any-required permissions match", () => {
    setMetadata({ any: ["domains:verify", "licenses:manage"] });
    const context = createContext({
      user: { sub: "u1", tenant_permissions: ["members:view"] },
    });

    expect(() => guard.canActivate(context as any)).toThrow(
      new ForbiddenException(
        "Access denied: Missing one of required permissions: domains:verify, licenses:manage",
      ),
    );
  });

  it("rejects tenant mismatch when tenantId comes from query", () => {
    setMetadata({ single: "members:view" });
    const context = createContext({
      user: {
        sub: "u1",
        tenant_id: "t1",
        tenant_permissions: ["members:view"],
      },
      query: { tenantId: "t2" },
    });

    expect(() => guard.canActivate(context as any)).toThrow(ForbiddenException);
  });

  it("rejects tenant mismatch when tenantId comes from params", () => {
    setMetadata({ all: ["members:view"] });
    const context = createContext({
      user: {
        sub: "u1",
        tenant_id: "t1",
        tenant_permissions: ["members:view"],
      },
      params: { tenantId: "t2" },
    });

    expect(() => guard.canActivate(context as any)).toThrow(ForbiddenException);
  });

  it("allows when user has no tenant_id even if request tenantId exists", () => {
    setMetadata({ single: "members:view" });
    const context = createContext({
      user: { sub: "u1", tenant_permissions: ["members:view"] },
      params: { tenantId: "any-tenant" },
    });

    expect(guard.canActivate(context as any)).toBe(true);
  });
});
