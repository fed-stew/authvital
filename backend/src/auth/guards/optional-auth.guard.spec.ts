import { ConfigService } from "@nestjs/config";

jest.mock("../../oauth/key.service", () => ({
  KeyService: class MockKeyService {},
}));

import { OptionalAuthGuard } from "./optional-auth.guard";

describe("OptionalAuthGuard", () => {
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

    return {
      request,
      context: {
        switchToHttp: () => ({ getRequest: () => request }),
      } as any,
    };
  };

  let guard: OptionalAuthGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "debug").mockImplementation(() => undefined);
    guard = new OptionalAuthGuard(
      mockKeyService as any,
      mockAuthService as any,
      mockConfigService,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("returns true when no token is present", async () => {
    const { context } = createContext();
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it("returns true and attaches user when token and user are valid", async () => {
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
    expect(request.user).toEqual({
      id: "db-user-1",
      sub: "user-1",
      email: "jwt@example.com",
    });
  });

  it("returns true without user when user does not exist", async () => {
    mockKeyService.verifyJwt.mockResolvedValue({ sub: "missing-user" });
    mockAuthService.validateUser.mockResolvedValue(null);

    const { context, request } = createContext({
      authorization: "Bearer test-token",
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toBeUndefined();
  });

  it("returns true and logs debug when token verification fails", async () => {
    mockKeyService.verifyJwt.mockRejectedValue(new Error("invalid token"));

    const { context } = createContext({
      cookies: { idp_session: "cookie-token" },
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(console.debug).toHaveBeenCalledWith(
      "[OptionalAuthGuard] Token validation failed:",
      "invalid token",
    );
  });

  it("logs unknown error message when non-Error is thrown", async () => {
    mockKeyService.verifyJwt.mockRejectedValue("not-an-error-object");

    const { context } = createContext({ authorization: "Bearer test-token" });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(console.debug).toHaveBeenCalledWith(
      "[OptionalAuthGuard] Token validation failed:",
      "Unknown error",
    );
  });

  it("falls back to database email when payload email is missing", async () => {
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
