import { UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

jest.mock("../../oauth/key.service", () => ({
  KeyService: class MockKeyService {},
}));

import { SuperAdminGuard } from "./super-admin.guard";

describe("SuperAdminGuard", () => {
  const mockKeyService = {
    verifyJwt: jest.fn(),
  };

  const mockConfigService = {
    getOrThrow: jest.fn().mockReturnValue("https://issuer.example.com"),
  } as unknown as ConfigService;

  const mockAuthService = {
    validateSuperAdmin: jest.fn(),
  };

  const createContext = ({
    cookies,
    authorization,
  }: {
    cookies?: Record<string, string>;
    authorization?: string;
  } = {}) => {
    const request: any = {
      cookies: cookies || {},
      headers: authorization ? { authorization } : {},
      user: undefined,
    };

    return {
      request,
      context: {
        switchToHttp: () => ({ getRequest: () => request }),
      } as any,
    };
  };

  let guard: SuperAdminGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new SuperAdminGuard(
      mockKeyService as any,
      mockConfigService,
      mockAuthService as any,
    );
  });

  it("throws when token is missing", async () => {
    const { context } = createContext();
    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException("No token provided"),
    );
  });

  it("uses cookie token before authorization header and allows valid super admin", async () => {
    mockKeyService.verifyJwt.mockResolvedValue({
      sub: "admin-1",
      type: "super_admin",
    });
    mockAuthService.validateSuperAdmin.mockResolvedValue({
      id: "a1",
      email: "a@example.com",
    });

    const { context, request } = createContext({
      cookies: { super_admin_session: "cookie-token" },
      authorization: "Bearer header-token",
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(mockKeyService.verifyJwt).toHaveBeenCalledWith(
      "cookie-token",
      "https://issuer.example.com",
    );
    expect(request.user).toEqual({
      id: "a1",
      email: "a@example.com",
      type: "super_admin",
    });
  });

  it("throws invalid token when payload type is not super_admin", async () => {
    mockKeyService.verifyJwt.mockResolvedValue({ sub: "user-1", type: "user" });

    const { context } = createContext({ authorization: "Bearer header-token" });

    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException("Invalid token"),
    );
  });

  it("throws invalid token when super admin is not found", async () => {
    mockKeyService.verifyJwt.mockResolvedValue({
      sub: "admin-1",
      type: "super_admin",
    });
    mockAuthService.validateSuperAdmin.mockResolvedValue(null);

    const { context } = createContext({ authorization: "Bearer header-token" });

    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException("Invalid token"),
    );
  });

  it("throws invalid token when verification fails", async () => {
    mockKeyService.verifyJwt.mockRejectedValue(new Error("boom"));
    const { context } = createContext({ authorization: "Bearer header-token" });

    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException("Invalid token"),
    );
  });
});
