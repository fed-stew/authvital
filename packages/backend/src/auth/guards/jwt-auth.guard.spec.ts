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
    authorization,
  }: {
    authorization?: string;
  } = {}) => {
    const request: any = {
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

  describe("split-token security - Authorization header only", () => {
    it("should return 401 when Authorization header is missing", async () => {
      mockReflector.getAllAndOverride = jest.fn().mockReturnValue(false);
      const { context } = createContext();

      await expect(guard.canActivate(context)).rejects.toThrow(
        new UnauthorizedException("No Authorization header provided"),
      );
    });

    it("should extract JWT from Authorization: Bearer header", async () => {
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

    it("should return 401 for malformed Authorization header (no Bearer prefix)", async () => {
      mockReflector.getAllAndOverride = jest.fn().mockReturnValue(false);

      const { context } = createContext({ authorization: "test-token" });

      await expect(guard.canActivate(context)).rejects.toThrow(
        new UnauthorizedException("No Authorization header provided"),
      );
      expect(mockKeyService.verifyJwt).not.toHaveBeenCalled();
    });

    it("should return 401 for malformed Authorization header (wrong scheme)", async () => {
      mockReflector.getAllAndOverride = jest.fn().mockReturnValue(false);

      const { context } = createContext({ authorization: "Basic dXNlcjpwYXNz" });

      await expect(guard.canActivate(context)).rejects.toThrow(
        new UnauthorizedException("No Authorization header provided"),
      );
      expect(mockKeyService.verifyJwt).not.toHaveBeenCalled();
    });

    it("should return 401 when Bearer token is empty", async () => {
      mockReflector.getAllAndOverride = jest.fn().mockReturnValue(false);

      const { context } = createContext({ authorization: "Bearer " });

      await expect(guard.canActivate(context)).rejects.toThrow(
        new UnauthorizedException("No Authorization header provided"),
      );
      expect(mockKeyService.verifyJwt).not.toHaveBeenCalled();
    });

    it("should NOT extract JWT from cookies (split-token security)", async () => {
      mockReflector.getAllAndOverride = jest.fn().mockReturnValue(false);

      // Simulate a request with cookie but NO Authorization header
      const request: any = {
        cookies: { idp_session: "cookie-token" },
        headers: {},
        user: undefined,
      };

      const handler = jest.fn();
      const clazz = class TestClass {};

      const context = {
        switchToHttp: () => ({ getRequest: () => request }),
        getHandler: () => handler,
        getClass: () => clazz,
      } as any;

      await expect(guard.canActivate(context)).rejects.toThrow(
        new UnauthorizedException("No Authorization header provided"),
      );
      expect(mockKeyService.verifyJwt).not.toHaveBeenCalled();
    });

    it("should NOT extract JWT from super_admin_session cookie (split-token security)", async () => {
      mockReflector.getAllAndOverride = jest.fn().mockReturnValue(false);

      // Simulate a request with super_admin_session cookie but NO Authorization header
      const request: any = {
        cookies: { super_admin_session: "admin-cookie-token" },
        headers: {},
        user: undefined,
      };

      const handler = jest.fn();
      const clazz = class TestClass {};

      const context = {
        switchToHttp: () => ({ getRequest: () => request }),
        getHandler: () => handler,
        getClass: () => clazz,
      } as any;

      await expect(guard.canActivate(context)).rejects.toThrow(
        new UnauthorizedException("No Authorization header provided"),
      );
      expect(mockKeyService.verifyJwt).not.toHaveBeenCalled();
    });

    it("should return 401 for invalid Bearer token (verification fails)", async () => {
      mockReflector.getAllAndOverride = jest.fn().mockReturnValue(false);
      mockKeyService.verifyJwt.mockRejectedValue(new Error("Invalid signature"));

      const { context } = createContext({ authorization: "Bearer invalid-token" });

      await expect(guard.canActivate(context)).rejects.toThrow(
        new UnauthorizedException("Invalid token"),
      );
    });

    it("should return 401 when user does not exist in database", async () => {
      mockReflector.getAllAndOverride = jest.fn().mockReturnValue(false);
      mockKeyService.verifyJwt.mockResolvedValue({ sub: "user-1" });
      mockAuthService.validateUser.mockResolvedValue(null);

      const { context } = createContext({ authorization: "Bearer test-token" });

      await expect(guard.canActivate(context)).rejects.toThrow(
        new UnauthorizedException("Invalid token"),
      );
    });

    it("should attach user with DB email when JWT email is missing", async () => {
      mockReflector.getAllAndOverride = jest.fn().mockReturnValue(false);
      mockKeyService.verifyJwt.mockResolvedValue({ sub: "user-1" });
      mockAuthService.validateUser.mockResolvedValue({
        id: "db-user-1",
        email: "db@example.com",
      });

      const { context, request } = createContext({
        authorization: "Bearer test-token",
      });

      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(request.user.email).toBe("db@example.com");
    });
  });
});
