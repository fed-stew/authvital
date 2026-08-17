jest.mock("./key.service", () => ({
  KeyService: class MockKeyService {},
}));

// uuid ships ESM-only; jest's transformIgnorePatterns only whitelists jose.
jest.mock("uuid", () => ({ v4: () => "mock-uuid-code" }));

import { ConfigService } from "@nestjs/config";
import { OAuthService, AuthorizeParams } from "./oauth.service";
import { MfaEnrollmentRequiredException } from "../auth/mfa/mfa-enrollment-required.exception";
import { AUDIT_ACTIONS } from "../audit/audit-actions";

describe("OAuthService — MFA-at-mint enforcement in authorize()", () => {
  const mockPrisma = {
    user: { findUnique: jest.fn() },
    applicationClient: { findUnique: jest.fn() },
    authorizationCode: { create: jest.fn() },
  };

  const mockKeyService = { signJwt: jest.fn() };

  const mockConfigService = {
    getOrThrow: jest.fn().mockReturnValue("https://issuer.example.com"),
    get: jest.fn().mockReturnValue("https://issuer.example.com"),
  } as unknown as ConfigService;

  const mockRedirectUriValidator = {
    validateRedirectUri: jest.fn().mockResolvedValue({ valid: true }),
  };

  const mockMfaService = { checkUserMfaCompliance: jest.fn() };
  const mockAuditService = { log: jest.fn().mockResolvedValue(undefined) };

  let service: OAuthService;

  const baseParams: AuthorizeParams = {
    clientId: "client-1",
    redirectUri: "https://app.example.com/cb",
    responseType: "code",
    scope: "openid profile email",
    state: "st",
    nonce: "n",
  };

  const tenantParams: AuthorizeParams = {
    ...baseParams,
    tenantId: "t1",
    tenantSubdomain: "acme",
  };

  const compliance = (overrides: Record<string, unknown> = {}) => ({
    compliant: true,
    withinGrace: false,
    mfaEnabled: false,
    tenantPolicy: "OPTIONAL",
    requiresSetup: false,
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    service = new OAuthService(
      mockPrisma as any,
      mockKeyService as any,
      mockConfigService,
      {} as any, // sessionService — unused by authorize()
      {} as any, // tokenService — unused by authorize()
      {} as any, // introspectionService — unused by authorize()
      mockRedirectUriValidator as any,
      mockMfaService as any,
      mockAuditService as any,
    );

    mockPrisma.user.findUnique.mockResolvedValue({ id: "u1" });
    mockPrisma.applicationClient.findUnique.mockResolvedValue({
      id: "appc1",
      clientId: "client-1",
      isActive: true,
      type: "WEB",
      redirectUris: ["https://app.example.com/cb"],
      application: { id: "app1", isActive: true },
    });
    mockRedirectUriValidator.validateRedirectUri.mockResolvedValue({
      valid: true,
    });
    mockPrisma.authorizationCode.create.mockResolvedValue({});
  });

  it("interrupts a non-enrolled user in a REQUIRED tenant with 0 grace days", async () => {
    mockMfaService.checkUserMfaCompliance.mockResolvedValue(
      compliance({
        compliant: false,
        withinGrace: false, // gracePeriodDays === 0 → strict enforcement
        requiresSetup: true,
        tenantPolicy: "REQUIRED",
        gracePeriodEndsAt: new Date(),
      }),
    );

    await expect(service.authorize("u1", tenantParams)).rejects.toThrow(
      MfaEnrollmentRequiredException,
    );

    // No authorization code minted, and the interrupt is audit-logged.
    expect(mockPrisma.authorizationCode.create).not.toHaveBeenCalled();
    expect(mockAuditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "t1",
        actorUserId: "u1",
        action: AUDIT_ACTIONS.MFA_ENROLLMENT_INTERRUPT,
      }),
    );
  });

  it("exception payload carries interaction_required + enrollment context", async () => {
    const graceEnd = new Date();
    mockMfaService.checkUserMfaCompliance.mockResolvedValue(
      compliance({
        compliant: false,
        withinGrace: false,
        requiresSetup: true,
        tenantPolicy: "REQUIRED",
        gracePeriodEndsAt: graceEnd,
      }),
    );

    await expect(service.authorize("u1", tenantParams)).rejects.toMatchObject({
      response: {
        error: "interaction_required",
        reason: "mfa_enrollment_required",
        tenantId: "t1",
        requiresSetup: true,
        gracePeriodEndsAt: graceEnd.toISOString(),
      },
    });
  });

  it("proceeds under an open grace window", async () => {
    mockMfaService.checkUserMfaCompliance.mockResolvedValue(
      compliance({
        compliant: false,
        withinGrace: true,
        requiresSetup: true,
        tenantPolicy: "REQUIRED",
        gracePeriodEndsAt: new Date(Date.now() + 86_400_000),
      }),
    );

    const code = await service.authorize("u1", tenantParams);

    expect(typeof code).toBe("string");
    expect(mockPrisma.authorizationCode.create).toHaveBeenCalled();
    expect(mockAuditService.log).not.toHaveBeenCalled();
  });

  it.each(["DISABLED", "OPTIONAL", "ENCOURAGED"])(
    "%s tenants are unaffected",
    async (tenantPolicy) => {
      mockMfaService.checkUserMfaCompliance.mockResolvedValue(
        compliance({ tenantPolicy }),
      );

      await expect(
        service.authorize("u1", tenantParams),
      ).resolves.toEqual(expect.any(String));
    },
  );

  it("org-less (no tenantId) flows never consult the MFA policy", async () => {
    await service.authorize("u1", baseParams);

    expect(mockMfaService.checkUserMfaCompliance).not.toHaveBeenCalled();
    expect(mockPrisma.authorizationCode.create).toHaveBeenCalled();
  });

  describe("issueMfaEnrollmentResumeToken", () => {
    it("signs a 300s resume token with the correct type and sanitized params", async () => {
      mockKeyService.signJwt.mockResolvedValue("resume-jwt");

      const dirtyParams = {
        ...tenantParams,
        // Junk that must NOT round-trip through the resume token
        evilExtra: "muahaha",
      } as AuthorizeParams;

      const token = await service.issueMfaEnrollmentResumeToken(
        "u1",
        dirtyParams,
      );

      expect(token).toBe("resume-jwt");
      expect(mockKeyService.signJwt).toHaveBeenCalledWith(
        {
          type: "mfa_enrollment_resume",
          userType: "user",
          // Single-use hardening: every resume token carries a unique jti.
          jti: expect.any(String),
          tenant_id: "t1",
          authorize_params: {
            clientId: "client-1",
            redirectUri: "https://app.example.com/cb",
            responseType: "code",
            scope: "openid profile email",
            state: "st",
            nonce: "n",
            codeChallenge: undefined,
            codeChallengeMethod: undefined,
            tenantId: "t1",
            tenantSubdomain: "acme",
          },
        },
        {
          subject: "u1",
          issuer: "https://issuer.example.com",
          expiresIn: 300,
        },
      );
      // Whitelist sanitization: nothing extra leaks into the token payload.
      const signedParams =
        mockKeyService.signJwt.mock.calls[0][0].authorize_params;
      expect(signedParams).not.toHaveProperty("evilExtra");
    });

    it("mints a fresh jti per token (no reuse across issuances)", async () => {
      mockKeyService.signJwt.mockResolvedValue("resume-jwt");

      await service.issueMfaEnrollmentResumeToken("u1", tenantParams);
      await service.issueMfaEnrollmentResumeToken("u1", tenantParams);

      const [first, second] = mockKeyService.signJwt.mock.calls.map(
        (call) => call[0].jti,
      );
      expect(first).toBeTruthy();
      expect(second).toBeTruthy();
      expect(first).not.toBe(second);
    });
  });
});
