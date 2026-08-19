jest.mock("./key.service", () => ({
  KeyService: class MockKeyService {},
}));

// uuid ships ESM-only; jest's transformIgnorePatterns only whitelists jose.
jest.mock("uuid", () => ({ v4: () => "mock-uuid-code" }));

import { ConfigService } from "@nestjs/config";
import { UnauthorizedException } from "@nestjs/common";
import { OAuthController } from "./oauth.controller";

/**
 * Regression guard: when /oauth/authorize bounces the browser to the hosted
 * login page, the redirect_uri it hands over MUST be a RELATIVE path+query
 * (same host). AuthFlowService.login() rejects anything that doesn't start
 * with '/' (or starts with '//'), so an absolute URL here would 400 the
 * whole re-auth continuation after login.
 */
describe("OAuthController — login handoff keeps redirect_uri relative", () => {
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
    membership: { count: jest.fn() },
  };

  let controller: OAuthController;
  let res: { redirect: jest.Mock };

  const callAuthorize = (req: any) =>
    controller.authorize(
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

  /** Pull the redirect_uri param out of the URL passed to res.redirect. */
  const capturedRedirectUri = (): string => {
    expect(res.redirect).toHaveBeenCalledTimes(1);
    const target: string = res.redirect.mock.calls[0][0];
    const redirectUri = new URL(target).searchParams.get("redirect_uri");
    expect(redirectUri).toBeTruthy();
    return redirectUri as string;
  };

  /** The exact acceptance rule enforced by AuthFlowService.login(). */
  const passesLoginRelativeCheck = (uri: string): boolean =>
    uri.startsWith("/") && !uri.startsWith("//");

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
    mockOAuthService.validateRedirectUri.mockResolvedValue({ valid: true });
    mockPrisma.tenant.findFirst.mockResolvedValue({ id: "t1", slug: "acme" });
    // Default: the user belongs to at least one org, so the tenant-first guard
    // is a no-op and the flow proceeds to authorize as before.
    mockPrisma.membership.count.mockResolvedValue(1);
  });

  it("unauthenticated: /auth/login gets a relative /oauth/authorize redirect_uri", async () => {
    const req = { headers: {}, cookies: {} } as any; // no session at all

    await callAuthorize(req);

    const redirectUri = capturedRedirectUri();
    expect(redirectUri.startsWith("/oauth/authorize?")).toBe(true);
    expect(passesLoginRelativeCheck(redirectUri)).toBe(true);
  });

  it("zero memberships: tenant-first guard redirects to /auth/no-organizations with a relative resume", async () => {
    const req = {
      headers: { authorization: "Bearer good-jwt" },
      cookies: {},
    } as any;
    mockOAuthService.validateJwt.mockResolvedValue({ userId: "u1" });
    mockPrisma.membership.count.mockResolvedValue(0); // corrupted / fresh session

    await callAuthorize(req);

    expect(res.redirect).toHaveBeenCalledTimes(1);
    const target: string = res.redirect.mock.calls[0][0];
    expect(target).toContain("/auth/no-organizations");
    // We never minted a code for an org-less session.
    expect(mockOAuthService.authorize).not.toHaveBeenCalled();
    // The resume param must be a relative /oauth/authorize path so login()'s
    // relative-only check accepts it on the way back.
    const resume = new URL(target).searchParams.get("resume") as string;
    expect(resume.startsWith("/oauth/authorize?")).toBe(true);
    expect(passesLoginRelativeCheck(resume)).toBe(true);
  });

  it("expired session (UnauthorizedException): redirect_uri stays relative", async () => {
    const req = {
      headers: { authorization: "Bearer stale-jwt" },
      cookies: {},
    } as any;
    mockOAuthService.validateJwt.mockResolvedValue({ userId: "u1" });
    mockOAuthService.authorize.mockRejectedValue(new UnauthorizedException());

    await callAuthorize(req);

    const redirectUri = capturedRedirectUri();
    expect(redirectUri.startsWith("/oauth/authorize?")).toBe(true);
    expect(passesLoginRelativeCheck(redirectUri)).toBe(true);
  });
});
