import { UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";

jest.mock("../../oauth/key.service", () => ({
  KeyService: class MockKeyService {},
}));

import { JwtAuthGuard } from "./jwt-auth.guard";

describe("JwtAuthGuard", () => {
  const mockReflector = {
    getAllAndOverride: jest.fn(),
  } as unknown as Reflector;

  const mockKeyService = {
    verifyJwt: jest.fn(),
  };

  const mockAuthService = {
    validateUser: jest.fn(),
  };

  const mockConfigService = {
    getOrThrow: jest.fn().mockReturnValue("https://issuer.example.com"),
  } as unknown as ConfigService;

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

    const handler = jest.fn();
    const clazz = class TestClass {};

    return {
      request,
      context: {
        switchToHttp: () => ({ getRequest: () => request }),
        getHandler: () => handler,
        getClass: () => clazz,
      } as any,
    };
  };

  let guard: JwtAuthGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new JwtAuthGuard(
      mockReflector,
      mockKeyService as any,
      mockAuthService as any,
      mockConfigService,
    );
  });

  it("allows public routes", async () => {
    mockReflector.getAllAndOverride = jest.fn().mockReturnValue(true);
    const { context } = createContext();

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it("throws when token is missing on protected route", async () => {
    mockReflector.getAllAndOverride = jest.fn().mockReturnValue(false);
    const { context } = createContext();

    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException("No token provided"),
    );
  });

  it("attaches user and returns true for valid token + user", async () => {
    mockReflector.getAllAndOverride = jest.fn().mockReturnValue(false);
    mockKeyService.verifyJwt.mockResolvedValue({
      sub: "user-1",
      email: "jwt@example.com",
    });
    mockAuthService.validateUser.mockResolvedValue({
      id: "db-user-1",
      email: "db@example.com",
    });

    const { context, request } = createContext({
      authorization: "Bearer test-token",
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(mockKeyService.verifyJwt).toHaveBeenCalledWith(
      "test-token",
      "https://issuer.example.com",
    );
    expect(request.user).toEqual({
      id: "db-user-1",
      sub: "user-1",
      email: "jwt@example.com",
    });
  });

  it("falls back to DB user email when JWT email missing", async () => {
    mockReflector.getAllAndOverride = jest.fn().mockReturnValue(false);
    mockKeyService.verifyJwt.mockResolvedValue({ sub: "user-1" });
    mockAuthService.validateUser.mockResolvedValue({
      id: "db-user-1",
      email: "db@example.com",
    });

    const { context, request } = createContext({
      cookies: { idp_session: "cookie-token" },
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user.email).toBe("db@example.com");
  });

  it("throws invalid token when user does not exist", async () => {
    mockReflector.getAllAndOverride = jest.fn().mockReturnValue(false);
    mockKeyService.verifyJwt.mockResolvedValue({ sub: "user-1" });
    mockAuthService.validateUser.mockResolvedValue(null);

    const { context } = createContext({ authorization: "Bearer test-token" });

    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException("Invalid token"),
    );
  });

  it("throws invalid token when verification fails", async () => {
    mockReflector.getAllAndOverride = jest.fn().mockReturnValue(false);
    mockKeyService.verifyJwt.mockRejectedValue(new Error("boom"));

    const { context } = createContext({ authorization: "Bearer test-token" });

    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException("Invalid token"),
    );
  });
});
