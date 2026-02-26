import { UnauthorizedException } from "@nestjs/common";

jest.mock("./oauth.service", () => ({
  OAuthService: class MockOAuthService {},
}));

import { OAuthTokenGuard } from "./oauth-token.guard";

describe("OAuthTokenGuard", () => {
  const mockOAuthService = {
    validateAccessToken: jest.fn(),
  };

  const createContext = (authorization?: string) => {
    const request: any = {
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

  let guard: OAuthTokenGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new OAuthTokenGuard(mockOAuthService as any);
  });

  it("throws when no access token is provided", async () => {
    const { context } = createContext();
    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException("No access token provided"),
    );
  });

  it("throws when token payload is null", async () => {
    mockOAuthService.validateAccessToken.mockResolvedValue(null);
    const { context } = createContext("Bearer access-token");

    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException("Invalid access token"),
    );
  });

  it("attaches user details when token is valid", async () => {
    mockOAuthService.validateAccessToken.mockResolvedValue({
      userId: "u1",
      email: "u1@example.com",
      clientId: "c1",
      scope: "openid profile",
    });

    const { context, request } = createContext("Bearer access-token");

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual({
      id: "u1",
      sub: "u1",
      email: "u1@example.com",
      clientId: "c1",
      scope: "openid profile",
    });
  });

  it("rethrows UnauthorizedException from validation", async () => {
    mockOAuthService.validateAccessToken.mockRejectedValue(
      new UnauthorizedException("Invalid access token"),
    );

    const { context } = createContext("Bearer access-token");

    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException("Invalid access token"),
    );
  });

  it("maps generic errors to invalid or expired token", async () => {
    mockOAuthService.validateAccessToken.mockRejectedValue(
      new Error("jwt expired"),
    );

    const { context } = createContext("Bearer access-token");

    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException("Invalid or expired access token"),
    );
  });

  it("rejects non-bearer authorization format", async () => {
    const { context } = createContext("Basic abc123");
    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException("No access token provided"),
    );
  });
});
