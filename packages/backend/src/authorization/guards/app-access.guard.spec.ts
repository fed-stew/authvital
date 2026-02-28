import { ForbiddenException } from "@nestjs/common";
import { AppAccessGuard } from "./app-access.guard";

describe("AppAccessGuard", () => {
  const mockAppAccessService = {
    hasAccess: jest.fn(),
  };

  const createContext = (request: any = {}) => ({
    switchToHttp: () => ({ getRequest: () => request }),
  });

  let guard: AppAccessGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new AppAccessGuard(mockAppAccessService as any);
  });

  it("throws when user is unauthenticated", async () => {
    const context = createContext({ user: null, params: {} });

    await expect(guard.canActivate(context as any)).rejects.toThrow(
      new ForbiddenException("Authentication required"),
    );
  });

  it("allows when no application id is provided", async () => {
    const context = createContext({
      user: { sub: "u1" },
      params: {},
      body: {},
      query: {},
    });

    await expect(guard.canActivate(context as any)).resolves.toBe(true);
    expect(mockAppAccessService.hasAccess).not.toHaveBeenCalled();
  });

  it("throws when app exists but tenant context is missing", async () => {
    const context = createContext({
      user: { sub: "u1" },
      params: { appId: "app1" },
      body: {},
      query: {},
    });

    await expect(guard.canActivate(context as any)).rejects.toThrow(
      new ForbiddenException("Tenant context required for app access check"),
    );
  });

  it("throws when app access is denied", async () => {
    mockAppAccessService.hasAccess.mockResolvedValue(false);
    const context = createContext({
      user: { sub: "u1", tenant_id: "t1" },
      params: { applicationId: "app1" },
      body: {},
      query: {},
    });

    await expect(guard.canActivate(context as any)).rejects.toThrow(
      new ForbiddenException(
        "You do not have access to this application. Contact your administrator.",
      ),
    );
  });

  it("allows when access is granted using body/query ids", async () => {
    mockAppAccessService.hasAccess.mockResolvedValue(true);
    const context = createContext({
      user: { sub: "u1" },
      params: {},
      body: { applicationId: "app2", tenantId: "t2" },
      query: {},
    });

    await expect(guard.canActivate(context as any)).resolves.toBe(true);
    expect(mockAppAccessService.hasAccess).toHaveBeenCalledWith(
      "t2",
      "u1",
      "app2",
    );
  });

  it("prioritizes route params over body/query for application and tenant ids", async () => {
    mockAppAccessService.hasAccess.mockResolvedValue(true);
    const context = createContext({
      user: { sub: "u1", tenant_id: "fallback-tenant" },
      params: { appId: "param-app", tenantId: "param-tenant" },
      body: { applicationId: "body-app", tenantId: "body-tenant" },
      query: { applicationId: "query-app", tenantId: "query-tenant" },
    });

    await expect(guard.canActivate(context as any)).resolves.toBe(true);
    expect(mockAppAccessService.hasAccess).toHaveBeenCalledWith(
      "param-tenant",
      "u1",
      "param-app",
    );
  });
});
