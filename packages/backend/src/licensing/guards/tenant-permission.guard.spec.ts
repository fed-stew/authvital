import { ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { REQUIRED_TENANT_PERMISSION_KEY } from "../decorators/require-tenant-permission.decorator";
import { TenantPermissionGuard } from "./tenant-permission.guard";

describe("TenantPermissionGuard", () => {
  const mockReflector = {
    get: jest.fn(),
  } as unknown as Reflector;

  const createContext = (request: any = {}, handler = jest.fn()) => ({
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handler,
  });

  let guard: TenantPermissionGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new TenantPermissionGuard(mockReflector);
  });

  it("allows when no permission is required", () => {
    mockReflector.get = jest.fn().mockReturnValue(undefined);
    const context = createContext({});

    expect(guard.canActivate(context as any)).toBe(true);
    expect(mockReflector.get).toHaveBeenCalledWith(
      REQUIRED_TENANT_PERMISSION_KEY,
      context.getHandler(),
    );
  });

  it("throws when user is missing", () => {
    mockReflector.get = jest.fn().mockReturnValue("licenses:manage");
    const context = createContext({});

    expect(() => guard.canActivate(context as any)).toThrow(
      new ForbiddenException("No authenticated user"),
    );
  });

  it("throws when tenantId in request does not match user tenant (body)", () => {
    mockReflector.get = jest.fn().mockReturnValue("licenses:manage");
    const context = createContext({
      body: { tenantId: "tenant-b" },
      user: { tenant_id: "tenant-a", tenant_permissions: ["licenses:manage"] },
    });

    expect(() => guard.canActivate(context as any)).toThrow(
      new ForbiddenException(
        "Access denied: You can only access resources in your authenticated tenant",
      ),
    );
  });

  it("allows exact permission match", () => {
    mockReflector.get = jest.fn().mockReturnValue("licenses:manage");
    const context = createContext({
      user: { tenant_id: "tenant-a", tenant_permissions: ["licenses:manage"] },
      params: { tenantId: "tenant-a" },
    });

    expect(guard.canActivate(context as any)).toBe(true);
  });

  it("allows wildcard resource match like licenses:*", () => {
    mockReflector.get = jest.fn().mockReturnValue("licenses:read");
    const context = createContext({
      user: { tenant_permissions: ["licenses:*"] },
    });

    expect(guard.canActivate(context as any)).toBe(true);
  });

  it("allows global wildcard *", () => {
    mockReflector.get = jest.fn().mockReturnValue("anything:goes");
    const context = createContext({
      user: { tenant_permissions: ["*"] },
      query: { tenantId: "tenant-a" },
    });

    expect(guard.canActivate(context as any)).toBe(true);
  });

  it("throws when permission is missing", () => {
    mockReflector.get = jest.fn().mockReturnValue("licenses:manage");
    const context = createContext({
      user: { tenant_permissions: ["licenses:read"] },
    });

    expect(() => guard.canActivate(context as any)).toThrow(
      new ForbiddenException(
        "Access denied: Missing required permission 'licenses:manage'",
      ),
    );
  });

  it("throws on tenant mismatch when tenantId comes from query", () => {
    mockReflector.get = jest.fn().mockReturnValue("licenses:read");
    const context = createContext({
      query: { tenantId: "tenant-b" },
      user: { tenant_id: "tenant-a", tenant_permissions: ["licenses:read"] },
    });

    expect(() => guard.canActivate(context as any)).toThrow(ForbiddenException);
  });

  it("throws on tenant mismatch when tenantId comes from params", () => {
    mockReflector.get = jest.fn().mockReturnValue("licenses:read");
    const context = createContext({
      params: { tenantId: "tenant-b" },
      user: { tenant_id: "tenant-a", tenant_permissions: ["licenses:read"] },
    });

    expect(() => guard.canActivate(context as any)).toThrow(ForbiddenException);
  });

  it("allows when user tenant_id is missing and permission exists", () => {
    mockReflector.get = jest.fn().mockReturnValue("licenses:read");
    const context = createContext({
      params: { tenantId: "tenant-b" },
      user: { tenant_permissions: ["licenses:read"] },
    });

    expect(guard.canActivate(context as any)).toBe(true);
  });
});
