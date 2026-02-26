import { UnauthorizedException, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

jest.mock("./key.service", () => ({
  KeyService: class MockKeyService {},
}));

import { M2MAuthGuard } from "./m2m-auth.guard";

describe("M2MAuthGuard", () => {
  const mockKeyService = {
    verifyJwt: jest.fn(),
  };

  const mockConfigService = {
    getOrThrow: jest.fn().mockReturnValue("https://issuer.example.com"),
  } as unknown as ConfigService;

  const createContext = (authorization?: string) => {
    const request: any = {
      headers: authorization ? { authorization } : {},
      user: undefined,
      m2m: undefined,
    };

    return {
      request,
      context: {
        switchToHttp: () => ({ getRequest: () => request }),
      } as any,
    };
  };

  let guard: M2MAuthGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    guard = new M2MAuthGuard(mockKeyService as any, mockConfigService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("throws when authorization header is missing", async () => {
    const { context } = createContext();
    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException(
        "Missing Authorization header. Use: Bearer <access_token>",
      ),
    );
  });

  it("throws when authorization header is not bearer format", async () => {
    const { context } = createContext("Basic abc");
    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException(
        "Invalid Authorization format. Use: Bearer <access_token>",
      ),
    );
  });

  it("throws when token_type is not m2m", async () => {
    mockKeyService.verifyJwt.mockResolvedValue({
      token_type: "user",
      client_id: "c1",
    });
    const { context } = createContext("Bearer token");

    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException(
        "Invalid token type. This endpoint requires an M2M access token from client_credentials flow.",
      ),
    );
  });

  it("throws when required client_id claim is missing", async () => {
    mockKeyService.verifyJwt.mockResolvedValue({ token_type: "m2m" });
    const { context } = createContext("Bearer token");

    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException("Invalid M2M token: missing required claims"),
    );
  });

  it("attaches m2m and user payload on success", async () => {
    mockKeyService.verifyJwt.mockResolvedValue({
      sub: "app:client-1",
      client_id: "client-1",
      scope: "sync:write",
      token_type: "m2m",
    });

    const { context, request } = createContext("Bearer token");

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.m2m).toEqual({
      clientId: "client-1",
      scope: "sync:write",
      tokenType: "m2m",
    });
    expect(request.user).toEqual({
      sub: "app:client-1",
      clientId: "client-1",
      scope: "sync:write",
    });
  });

  it("maps generic verification failure to invalid/expired token and logs error", async () => {
    const err = new Error("jwt expired");
    mockKeyService.verifyJwt.mockRejectedValue(err);

    const { context } = createContext("Bearer token");

    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException("Invalid or expired access token"),
    );
    expect(Logger.prototype.error).toHaveBeenCalled();
  });
});
