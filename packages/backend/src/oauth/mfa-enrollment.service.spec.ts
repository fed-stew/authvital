jest.mock("./key.service", () => ({
  KeyService: class MockKeyService {},
}));

// uuid ships ESM-only; jest's transformIgnorePatterns only whitelists jose.
jest.mock("uuid", () => ({ v4: () => "mock-uuid-code" }));

import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MfaEnrollmentService } from "./mfa-enrollment.service";
import { AUDIT_ACTIONS } from "../audit/audit-actions";

describe("MfaEnrollmentService — resume-token hardening & interrupt flow", () => {
  const mockPrisma = {
    tenant: { findUnique: jest.fn() },
    consumedJti: { create: jest.fn(), deleteMany: jest.fn() },
  };

  const mockKeyService = { verifyJwt: jest.fn() };
  const mockOAuthService = { authorize: jest.fn() };
  const mockTokenService = { generateSessionState: jest.fn() };
  const mockMfaService = { checkUserMfaCompliance: jest.fn() };
  const mockAuditService = { log: jest.fn().mockResolvedValue(undefined) };
  const mockConfigService = {
    getOrThrow: jest.fn().mockReturnValue("https://issuer.example.com"),
  } as unknown as ConfigService;

  let service: MfaEnrollmentService;

  const futureExp = Math.floor(Date.now() / 1000) + 300;

  const validPayload = (overrides: Record<string, unknown> = {}) => ({
    type: "mfa_enrollment_resume",
    userType: "user",
    sub: "u1",
    jti: "jti-1",
    exp: futureExp,
    tenant_id: "t1",
    authorize_params: {
      clientId: "client-1",
      redirectUri: "https://app.example.com/cb",
      responseType: "code",
      scope: "openid profile email",
      state: "st&val", // must be URL-encoded on assembly
      tenantId: "t1",
      tenantSubdomain: "acme",
    },
    ...overrides,
  });

  const compliance = (overrides: Record<string, unknown> = {}) => ({
    compliant: true,
    withinGrace: false,
    mfaEnabled: true,
    tenantPolicy: "REQUIRED",
    requiresSetup: false,
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MfaEnrollmentService(
      mockPrisma as any,
      mockKeyService as any,
      mockOAuthService as any,
      mockTokenService as any,
      mockMfaService as any,
      mockAuditService as any,
      mockConfigService,
    );

    mockKeyService.verifyJwt.mockResolvedValue(validPayload());
    mockPrisma.consumedJti.create.mockResolvedValue({});
    mockPrisma.tenant.findUnique.mockResolvedValue({ name: "Acme Corp" });
    mockMfaService.checkUserMfaCompliance.mockResolvedValue(compliance());
    mockOAuthService.authorize.mockResolvedValue("auth-code-123");
    mockTokenService.generateSessionState.mockReturnValue("ss-resume");
  });

  // ===========================================================================
  // verifyResumeToken
  // ===========================================================================

  describe("verifyResumeToken", () => {
    it("rejects tokens whose subject does not match the session user (401)", async () => {
      await expect(
        service.verifyResumeToken("tok", "someone-else"),
      ).rejects.toThrow(UnauthorizedException);
    });

    it("rejects wrong token types (401)", async () => {
      mockKeyService.verifyJwt.mockResolvedValue(
        validPayload({ type: "mfa_challenge" }),
      );
      await expect(service.verifyResumeToken("tok", "u1")).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("rejects pre-hardening tokens without a jti (401)", async () => {
      mockKeyService.verifyJwt.mockResolvedValue(
        validPayload({ jti: undefined }),
      );
      await expect(service.verifyResumeToken("tok", "u1")).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("maps signature/expiry failures to 401", async () => {
      mockKeyService.verifyJwt.mockRejectedValue(new Error("jwt expired"));
      await expect(service.verifyResumeToken("tok", "u1")).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // ===========================================================================
  // getContext
  // ===========================================================================

  describe("getContext", () => {
    it("returns the page-render contract and does NOT consume the jti", async () => {
      const graceEnd = new Date(Date.now() + 86_400_000);
      mockMfaService.checkUserMfaCompliance.mockResolvedValue(
        compliance({
          compliant: false,
          withinGrace: true,
          mfaEnabled: false,
          requiresSetup: true,
          gracePeriodEndsAt: graceEnd,
        }),
      );

      const context = await service.getContext("u1", "tok");

      expect(context).toEqual({
        tenantName: "Acme Corp",
        tenantPolicy: "REQUIRED",
        gracePeriodEndsAt: graceEnd.toISOString(),
        userMfaEnabled: false,
        requiresSetup: true,
      });
      expect(mockPrisma.consumedJti.create).not.toHaveBeenCalled();
    });

    it("null gracePeriodEndsAt when no grace window applies", async () => {
      const context = await service.getContext("u1", "tok");
      expect(context.gracePeriodEndsAt).toBeNull();
      expect(context.userMfaEnabled).toBe(true);
    });

    it("subject mismatch is a 401 even for context reads", async () => {
      await expect(service.getContext("intruder", "tok")).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // ===========================================================================
  // resume — single use, grace, strict
  // ===========================================================================

  describe("resume", () => {
    it("consumes the jti and replays authorize, assembling the redirect like the normal flow", async () => {
      const result = await service.resume("u1", "tok", ["pwd"]);

      expect(mockPrisma.consumedJti.create).toHaveBeenCalledWith({
        data: { jti: "jti-1", expiresAt: new Date(futureExp * 1000) },
      });
      // compliance.mfaEnabled is true at resume time → 'otp' is appended to
      // the session amr (pragmatic rule: enabling MFA required a live TOTP
      // verify moments earlier).
      expect(mockOAuthService.authorize).toHaveBeenCalledWith(
        "u1",
        expect.objectContaining({ clientId: "client-1", tenantId: "t1" }),
        ["pwd", "otp"],
      );
      // code + state via URL.searchParams — state is URL-encoded ("&" -> %26)
      // — plus session_state, exactly like the normal authorize redirect.
      expect(mockTokenService.generateSessionState).toHaveBeenCalledWith(
        "client-1",
        "u1",
      );
      expect(result.redirectUrl).toBe(
        "https://app.example.com/cb?code=auth-code-123&state=st%26val&session_state=ss-resume",
      );
    });

    it("legacy session without amr resumes as ['pwd'] (+ 'otp' when enrolled)", async () => {
      await service.resume("u1", "tok"); // no sessionAmr

      expect(mockOAuthService.authorize).toHaveBeenCalledWith(
        "u1",
        expect.anything(),
        ["pwd", "otp"],
      );
    });

    it("does NOT append 'otp' when the user is still not MFA-enabled (grace resume)", async () => {
      mockMfaService.checkUserMfaCompliance.mockResolvedValue(
        compliance({
          compliant: false,
          withinGrace: true,
          mfaEnabled: false,
          requiresSetup: true,
          gracePeriodEndsAt: new Date(Date.now() + 86_400_000),
        }),
      );

      await service.resume("u1", "tok", ["pwd"]);

      expect(mockOAuthService.authorize).toHaveBeenCalledWith(
        "u1",
        expect.anything(),
        ["pwd"],
      );
    });

    it("never duplicates 'otp' when the session already carries it", async () => {
      await service.resume("u1", "tok", ["pwd", "otp"]);

      expect(mockOAuthService.authorize).toHaveBeenCalledWith(
        "u1",
        expect.anything(),
        ["pwd", "otp"],
      );
    });

    it("second consume of the same jti is a 401 (single-use guarantee)", async () => {
      mockPrisma.consumedJti.create
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce({ code: "P2002" });

      await service.resume("u1", "tok");
      await expect(service.resume("u1", "tok")).rejects.toThrow(
        UnauthorizedException,
      );

      // Only ONE authorization code was ever minted.
      expect(mockOAuthService.authorize).toHaveBeenCalledTimes(1);
    });

    it("grace skip: non-compliant but withinGrace still resumes successfully", async () => {
      mockMfaService.checkUserMfaCompliance.mockResolvedValue(
        compliance({
          compliant: false,
          withinGrace: true,
          mfaEnabled: false,
          requiresSetup: true,
          gracePeriodEndsAt: new Date(Date.now() + 86_400_000),
        }),
      );

      const result = await service.resume("u1", "tok");

      expect(result.redirectUrl).toContain("code=auth-code-123");
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AUDIT_ACTIONS.MFA_ENROLLMENT_RESUMED,
          metadata: expect.objectContaining({ withinGrace: true }),
        }),
      );
    });

    it("strict: still non-compliant and out of grace is a 403 interaction_required", async () => {
      mockMfaService.checkUserMfaCompliance.mockResolvedValue(
        compliance({
          compliant: false,
          withinGrace: false,
          mfaEnabled: false,
          requiresSetup: true,
        }),
      );

      const failure = await service.resume("u1", "tok").then(
        () => {
          throw new Error("resume() should have thrown");
        },
        (err) => err,
      );

      expect(failure).toBeInstanceOf(ForbiddenException);
      expect(failure.getResponse()).toMatchObject({
        error: "interaction_required",
        reason: "mfa_enrollment_required",
      });

      // The jti IS consumed (redemption attempts burn the token) but no code minted.
      expect(mockPrisma.consumedJti.create).toHaveBeenCalled();
      expect(mockOAuthService.authorize).not.toHaveBeenCalled();
    });

    it("audits successful resume-after-enrollment", async () => {
      await service.resume("u1", "tok");

      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: "t1",
          actorUserId: "u1",
          action: AUDIT_ACTIONS.MFA_ENROLLMENT_RESUMED,
          metadata: expect.objectContaining({
            clientId: "client-1",
            mfaEnabled: true,
          }),
        }),
      );
    });
  });

  // ===========================================================================
  // cleanup
  // ===========================================================================

  describe("cleanupExpiredJtis", () => {
    it("deletes only expired rows", async () => {
      mockPrisma.consumedJti.deleteMany.mockResolvedValue({ count: 3 });

      await service.cleanupExpiredJtis();

      expect(mockPrisma.consumedJti.deleteMany).toHaveBeenCalledWith({
        where: { expiresAt: { lt: expect.any(Date) } },
      });
    });
  });
});
