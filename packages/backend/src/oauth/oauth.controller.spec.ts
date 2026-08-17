jest.mock("./key.service", () => ({
  KeyService: class MockKeyService {},
}));

// uuid ships ESM-only; jest's transformIgnorePatterns only whitelists jose.
jest.mock("uuid", () => ({ v4: () => "mock-uuid-code" }));

import { ConfigService } from "@nestjs/config";
import { OAuthController } from "./oauth.controller";
import { MfaEnrollmentRequiredException } from "../auth/mfa/mfa-enrollment-required.exception";

describe("OAuthController — MFA enrollment interrupt redirect", () => {
  const mockOAuthService = {
    validateJwt: jest.fn(),
    validateRedirectUri: jest.fn(),
    authorize: jest.fn(),
    getUserInfo: jest.fn(),
    issueMfaEnrollmentResumeToken: jest.fn(),
  };

  const mockTokenService = { generateSessionState: jest.fn() };
  const mockKeyService = {};

  const mockConfigService = {
    getOrThrow: jest.fn().mockReturnValue("https://issuer.example.com"),
    get: jest.fn().mockReturnValue("https://issuer.example.com"),
  } as unknown as ConfigService;

  const mockPrisma = {
    tenant: { findFirst: jest.fn() },
  };

  let controller: OAuthController;
  let res: { redirect: jest.Mock };

  const req = {
    headers: { authorization: "Bearer user-jwt" },
    cookies: {},
  } as any;

  const mfaException = new MfaEnrollmentRequiredException({
    tenantId: "t1",
    requiresSetup: true,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new OAuthController(
      mockOAuthService as any,
      mockTokenService as any,
      mockKeyService as any,
      mockConfigService,
      mockPrisma as any,
    );
    res = { redirect: jest.fn() };

    mockOAuthService.validateJwt.mockResolvedValue({ userId: "u1" });
    mockOAuthService.validateRedirectUri.mockResolvedValue({ valid: true });
    mockPrisma.tenant.findFirst.mockResolvedValue({ id: "t1", slug: "acme" });
    mockOAuthService.issueMfaEnrollmentResumeToken.mockResolvedValue(
      "resume-token",
    );
  });

  it("GET /oauth/authorize 302s to /auth/mfa/enroll with a resume token on interrupt", async () => {
    mockOAuthService.authorize.mockRejectedValue(mfaException);

    await controller.authorize(
      "client-1",
      "https://acme.app.example.com/cb",
      "code",
      "openid profile email",
      "st",
      "n",
      undefined as any,
      undefined as any,
      undefined as any, // prompt (not silent refresh)
      undefined as any, // screen
      req,
      res as any,
    );

    expect(mockOAuthService.issueMfaEnrollmentResumeToken).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ clientId: "client-1", tenantId: "t1" }),
    );
    expect(res.redirect).toHaveBeenCalledWith(
      "https://issuer.example.com/auth/mfa/enroll?resume=resume-token",
    );
  });

  it("GET /oauth/authorize-tenant 302s to enrollment as well (always tenant-scoped)", async () => {
    mockOAuthService.getUserInfo.mockResolvedValue({
      tenants: [{ id: "t1", slug: "acme" }],
    });
    mockOAuthService.authorize.mockRejectedValue(mfaException);

    await controller.authorizeTenant(
      "t1",
      "acme",
      "client-1",
      "https://acme.app.example.com/cb",
      "code",
      "openid profile email",
      "st",
      "n",
      undefined as any,
      undefined as any,
      req,
      res as any,
    );

    expect(res.redirect).toHaveBeenCalledWith(
      "https://issuer.example.com/auth/mfa/enroll?resume=resume-token",
    );
  });

  it("GET /oauth/authorize completes normally when no interrupt is thrown", async () => {
    mockOAuthService.authorize.mockResolvedValue("auth-code");
    mockTokenService.generateSessionState.mockReturnValue("ss");

    await controller.authorize(
      "client-1",
      "https://acme.app.example.com/cb",
      "code",
      "openid profile email",
      "st",
      "n",
      undefined as any,
      undefined as any,
      undefined as any,
      undefined as any,
      req,
      res as any,
    );

    expect(mockOAuthService.issueMfaEnrollmentResumeToken).not.toHaveBeenCalled();
    const redirected = res.redirect.mock.calls[0][0] as string;
    expect(redirected).toContain("code=auth-code");
  });
});
