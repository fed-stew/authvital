import "reflect-metadata";
import { UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import {
  ApiKeyGuard,
  API_KEY_PERMISSIONS_KEY,
  RequireApiKeyPermissions,
} from "./api-key.guard";

describe("ApiKeyGuard", () => {
  const mockApiKeyService = {
    validateApiKey: jest.fn(),
    hasPermission: jest.fn(),
  };

  const mockReflector = {
    get: jest.fn(),
  } as unknown as Reflector;

  const createContext = (authorization?: string, handler: any = jest.fn()) => {
    const request: any = { headers: {}, user: undefined, apiKey: undefined };
    if (authorization) {
      request.headers.authorization = authorization;
    }

    return {
      request,
      context: {
        switchToHttp: () => ({ getRequest: () => request }),
        getHandler: () => handler,
      } as any,
    };
  };

  let guard: ApiKeyGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new ApiKeyGuard(mockApiKeyService as any, mockReflector);
  });

  it("throws when authorization header is missing", async () => {
    const { context } = createContext();
    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException("Missing Authorization header"),
    );
  });

  it("throws for invalid authorization format", async () => {
    const { context } = createContext("Basic abc");
    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException(
        "Invalid Authorization format. Use: Bearer sk_live_xxx",
      ),
    );
  });

  it("accepts bearer key and attaches request data when permissions pass", async () => {
    const { context, request } = createContext("Bearer sk_live_123");
    const validationResult = {
      permissions: ["users:read"],
      user: { id: "u1" },
    };

    mockApiKeyService.validateApiKey.mockResolvedValue(validationResult);
    mockReflector.get = jest.fn().mockReturnValue(["users:read"]);
    mockApiKeyService.hasPermission.mockReturnValue(true);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(mockApiKeyService.validateApiKey).toHaveBeenCalledWith(
      "sk_live_123",
    );
    expect(mockReflector.get).toHaveBeenCalledWith(
      API_KEY_PERMISSIONS_KEY,
      context.getHandler(),
    );
    expect(request.apiKey).toEqual(validationResult);
    expect(request.user).toEqual(validationResult.user);
  });

  it("accepts raw sk_live_ key without bearer prefix", async () => {
    const { context } = createContext("sk_live_123");
    mockApiKeyService.validateApiKey.mockResolvedValue({
      permissions: [],
      user: { id: "u1" },
    });
    mockReflector.get = jest.fn().mockReturnValue(undefined);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(mockApiKeyService.validateApiKey).toHaveBeenCalledWith(
      "sk_live_123",
    );
  });

  it("throws when required permission is missing", async () => {
    const { context } = createContext("Bearer sk_live_123");
    mockApiKeyService.validateApiKey.mockResolvedValue({
      permissions: ["users:read"],
      user: { id: "u1" },
    });
    mockReflector.get = jest.fn().mockReturnValue(["users:write"]);
    mockApiKeyService.hasPermission.mockReturnValue(false);

    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException(
        "API key lacks required permission: users:write",
      ),
    );
  });

  it("rethrows validation errors from ApiKeyService", async () => {
    const { context } = createContext("Bearer sk_live_123");
    const err = new UnauthorizedException("invalid key");
    mockApiKeyService.validateApiKey.mockRejectedValue(err);

    await expect(guard.canActivate(context)).rejects.toThrow(err);
  });

  it("supports empty requiredPermissions array without calling hasPermission", async () => {
    const { context } = createContext("Bearer sk_live_123");
    mockApiKeyService.validateApiKey.mockResolvedValue({
      permissions: [],
      user: { id: "u1" },
    });
    mockReflector.get = jest.fn().mockReturnValue([]);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(mockApiKeyService.hasPermission).not.toHaveBeenCalled();
  });

  it("RequireApiKeyPermissions decorator sets metadata on method descriptor", () => {
    class TestController {
      someMethod() {
        return true;
      }
    }

    const descriptor = Object.getOwnPropertyDescriptor(
      TestController.prototype,
      "someMethod",
    );
    RequireApiKeyPermissions("users:read", "users:write")(
      TestController.prototype,
      "someMethod",
      descriptor,
    );

    const meta = Reflect.getMetadata(
      API_KEY_PERMISSIONS_KEY,
      TestController.prototype.someMethod,
    );
    expect(meta).toEqual(["users:read", "users:write"]);
  });

  it("RequireApiKeyPermissions decorator works on class target without descriptor", () => {
    class TargetClass {}

    RequireApiKeyPermissions("class:perm")(TargetClass);

    const meta = Reflect.getMetadata(API_KEY_PERMISSIONS_KEY, TargetClass);
    expect(meta).toEqual(["class:perm"]);
  });
});
