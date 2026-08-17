jest.mock("bcrypt", () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

jest.mock("./key.service", () => ({
  KeyService: class MockKeyService {},
}));

import * as crypto from "crypto";
import { UnauthorizedException, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { OAuthTokenService } from "./oauth-token.service";

/** Codes are stored hashed at rest; rows carry codeHash, never plaintext. */
const sha256Hex = (value: string) =>
  crypto.createHash("sha256").update(value).digest("hex");

describe("OAuthTokenService", () => {
  const mockPrisma = {
    authorizationCode: {
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
    },
    refreshToken: {
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
    },
    membership: {
      findFirst: jest.fn(),
    },
  };

  const mockKeyService = {
    signJwt: jest.fn(),
  };

  const mockConfigService = {
    getOrThrow: jest.fn().mockReturnValue("https://issuer.example.com"),
  } as unknown as ConfigService;

  const mockSessionService = {
    verifyRefreshTokenJwt: jest.fn(),
    generateRefreshTokenJwt: jest.fn(),
    revokeUserAppTokens: jest.fn(),
  };

  const mockLicenseService = {
    fetchLicenseInfo: jest.fn(),
  };

  const mockMfaService = {
    checkUserMfaCompliance: jest.fn(),
  };

  /** Compliance fixture helpers — see MfaComplianceResult semantics. */
  const compliance = (overrides: Record<string, unknown> = {}) => ({
    compliant: true,
    withinGrace: false,
    mfaEnabled: false,
    tenantPolicy: "OPTIONAL",
    requiresSetup: false,
    ...overrides,
  });

  let service: OAuthTokenService;

  const futureDate = () => new Date(Date.now() + 60 * 60 * 1000);

  const applicationClient = {
    id: "appc1",
    clientId: "client-1",
    clientSecret: null,
    accessTokenTtl: 900,
    refreshTokenTtl: 3600,
    isActive: true,
    application: { id: "app1", isActive: true },
  };

  const user = {
    id: "u1",
    email: "u@example.com",
    givenName: "U",
    familyName: "One",
    memberships: [],
  };

  const tenantUser = {
    ...user,
    memberships: [{ tenant: { id: "t1", slug: "acme", name: "Acme" } }],
  };

  const buildAuthCode = (overrides: Record<string, unknown> = {}) => ({
    id: "ac1",
    codeHash: sha256Hex("code-123"),
    userId: "u1",
    applicationClientId: "appc1",
    usedAt: null,
    expiresAt: futureDate(),
    redirectUri: "https://app.example.com/cb",
    codeChallenge: null,
    codeChallengeMethod: null,
    nonce: null,
    scope: "openid profile email",
    tenantId: null,
    tenantSubdomain: null,
    amr: [] as string[], // legacy pre-amr row by default
    user,
    applicationClient,
    ...overrides,
  });

  const buildRefreshToken = (overrides: Record<string, unknown> = {}) => ({
    id: "sid-1",
    userId: "u1",
    applicationClientId: "appc1",
    revoked: false,
    revokedAt: null,
    expiresAt: futureDate(),
    scope: "openid profile email",
    tenantId: null,
    tenantSubdomain: null,
    amr: [] as string[], // legacy pre-amr row by default
    user,
    applicationClient,
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, "debug").mockImplementation(() => undefined);
    service = new OAuthTokenService(
      mockPrisma as any,
      mockKeyService as any,
      mockConfigService,
      mockSessionService as any,
      mockLicenseService as any,
      mockMfaService as any,
    );
    // Tenant-scoped mints fetch membership roles + license info.
    mockPrisma.membership.findFirst.mockResolvedValue({
      membershipTenantRoles: [],
      membershipRoles: [],
    });
    mockLicenseService.fetchLicenseInfo.mockResolvedValue(null);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("authorization_code grant — atomic single-use claim", () => {
    const params = {
      grantType: "authorization_code",
      code: "code-123",
      clientId: "client-1",
      redirectUri: "https://app.example.com/cb",
    };

    it("claims the code atomically before minting tokens (happy path)", async () => {
      mockPrisma.authorizationCode.findUnique.mockResolvedValue(
        buildAuthCode(),
      );
      mockPrisma.authorizationCode.updateMany.mockResolvedValue({ count: 1 });
      mockKeyService.signJwt.mockResolvedValue("signed-jwt");
      mockPrisma.refreshToken.create.mockResolvedValue({ id: "rt-new" });
      mockSessionService.generateRefreshTokenJwt.mockResolvedValue(
        "refresh-jwt",
      );

      const result = await service.token(params);

      // Codes are stored hashed at rest — the lookup must be by SHA-256
      // digest, never the plaintext code.
      expect(mockPrisma.authorizationCode.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { codeHash: sha256Hex("code-123") },
        }),
      );
      expect(mockPrisma.authorizationCode.updateMany).toHaveBeenCalledWith({
        where: { id: "ac1", usedAt: null },
        data: { usedAt: expect.any(Date) },
      });
      expect(result.access_token).toBe("signed-jwt");
      expect(result.refresh_token).toBe("refresh-jwt");
      expect(mockSessionService.revokeUserAppTokens).not.toHaveBeenCalled();
    });

    it("second exchange loses the atomic claim race: revokes user/app tokens and rejects with 401", async () => {
      // findUnique still sees usedAt: null (race window), but the conditional
      // updateMany finds the row already claimed.
      mockPrisma.authorizationCode.findUnique.mockResolvedValue(
        buildAuthCode(),
      );
      mockPrisma.authorizationCode.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.token(params)).rejects.toThrow(
        new UnauthorizedException("Authorization code already used"),
      );
      expect(mockSessionService.revokeUserAppTokens).toHaveBeenCalledWith(
        "u1",
        "appc1",
      );
      // No tokens minted for the loser
      expect(mockKeyService.signJwt).not.toHaveBeenCalled();
    });

    it("replay of an already-used code (usedAt set) revokes user/app tokens and rejects", async () => {
      mockPrisma.authorizationCode.findUnique.mockResolvedValue(
        buildAuthCode({ usedAt: new Date() }),
      );

      await expect(service.token(params)).rejects.toThrow(
        new UnauthorizedException("Authorization code already used"),
      );
      expect(mockSessionService.revokeUserAppTokens).toHaveBeenCalledWith(
        "u1",
        "appc1",
      );
    });

    it("redirect_uri mismatch returns a generic error without echoing URIs", async () => {
      mockPrisma.authorizationCode.findUnique.mockResolvedValue(
        buildAuthCode(),
      );

      await expect(
        service.token({ ...params, redirectUri: "https://evil.example.com" }),
      ).rejects.toThrow(
        new UnauthorizedException("Invalid grant: redirect_uri mismatch"),
      );
    });

    it("expired code returns a generic error without the expiry timestamp", async () => {
      mockPrisma.authorizationCode.findUnique.mockResolvedValue(
        buildAuthCode({ expiresAt: new Date(Date.now() - 1000) }),
      );
      mockPrisma.authorizationCode.delete.mockResolvedValue({});

      await expect(service.token(params)).rejects.toThrow(
        new UnauthorizedException("Invalid grant: authorization code expired"),
      );
    });
  });

  describe("refresh_token grant — atomic rotation + family revocation", () => {
    const params = {
      grantType: "refresh_token",
      refreshToken: "refresh-jwt",
      clientId: "client-1",
    };

    const jwtPayload = {
      sid: "sid-1",
      sub: "u1",
      aud: "client-1",
      scope: "openid profile email",
    };

    it("rotation race (updateMany count 0) revokes the token family and rejects with 401", async () => {
      mockSessionService.verifyRefreshTokenJwt.mockResolvedValue(jwtPayload);
      mockPrisma.refreshToken.findUnique.mockResolvedValue(
        buildRefreshToken(),
      );
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.token(params)).rejects.toThrow(
        new UnauthorizedException("Invalid refresh token"),
      );
      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { id: "sid-1", revoked: false },
        data: { revoked: true, revokedAt: expect.any(Date) },
      });
      expect(mockSessionService.revokeUserAppTokens).toHaveBeenCalledWith(
        "u1",
        "appc1",
      );
      expect(mockKeyService.signJwt).not.toHaveBeenCalled();
    });

    it("presenting an already-revoked refresh token revokes the token family", async () => {
      mockSessionService.verifyRefreshTokenJwt.mockResolvedValue(jwtPayload);
      mockPrisma.refreshToken.findUnique.mockResolvedValue(
        buildRefreshToken({ revoked: true, revokedAt: new Date() }),
      );

      await expect(service.token(params)).rejects.toThrow(
        new UnauthorizedException("Session has been revoked"),
      );
      expect(mockSessionService.revokeUserAppTokens).toHaveBeenCalledWith(
        "u1",
        "appc1",
      );
      expect(mockPrisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });

    it("successful rotation revokes only the presented token and mints new ones", async () => {
      mockSessionService.verifyRefreshTokenJwt.mockResolvedValue(jwtPayload);
      mockPrisma.refreshToken.findUnique.mockResolvedValue(
        buildRefreshToken(),
      );
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
      mockKeyService.signJwt.mockResolvedValue("signed-jwt");
      mockPrisma.refreshToken.create.mockResolvedValue({ id: "rt-new" });
      mockSessionService.generateRefreshTokenJwt.mockResolvedValue(
        "new-refresh-jwt",
      );

      const result = await service.token(params);

      expect(result.access_token).toBe("signed-jwt");
      expect(result.refresh_token).toBe("new-refresh-jwt");
      expect(mockSessionService.revokeUserAppTokens).not.toHaveBeenCalled();
    });
  });

  describe("MFA-at-mint backstop", () => {
    const codeParams = {
      grantType: "authorization_code",
      code: "code-123",
      clientId: "client-1",
      redirectUri: "https://app.example.com/cb",
    };

    const refreshParams = {
      grantType: "refresh_token",
      refreshToken: "refresh-jwt",
      clientId: "client-1",
    };

    const refreshJwtPayload = {
      sid: "sid-1",
      sub: "u1",
      aud: "client-1",
      scope: "openid profile email",
    };

    const mintHappyPath = () => {
      mockPrisma.authorizationCode.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
      mockKeyService.signJwt.mockResolvedValue("signed-jwt");
      mockPrisma.refreshToken.create.mockResolvedValue({ id: "rt-new" });
      mockSessionService.generateRefreshTokenJwt.mockResolvedValue(
        "refresh-jwt",
      );
    };

    /** The first signJwt call is the access token; return its payload. */
    const accessTokenPayload = () => mockKeyService.signJwt.mock.calls[0][0];

    it("org-less code exchange never consults the MFA policy; legacy no-amr code → amr ['pwd']", async () => {
      mockPrisma.authorizationCode.findUnique.mockResolvedValue(
        buildAuthCode(), // amr: [] — minted before session-amr tracking
      );
      mintHappyPath();

      await service.token(codeParams);

      expect(mockMfaService.checkUserMfaCompliance).not.toHaveBeenCalled();
      expect(accessTokenPayload().amr).toEqual(["pwd"]);
      expect(accessTokenPayload().mfa_grace_expires_at).toBeUndefined();
    });

    it("OPTIONAL/ENCOURAGED/DISABLED tenants mint normally with no grace claim", async () => {
      mockPrisma.authorizationCode.findUnique.mockResolvedValue(
        buildAuthCode({
          tenantId: "t1",
          tenantSubdomain: "acme",
          user: tenantUser,
        }),
      );
      mintHappyPath();
      mockMfaService.checkUserMfaCompliance.mockResolvedValue(
        compliance({ tenantPolicy: "OPTIONAL" }),
      );

      const result = await service.token(codeParams);

      expect(mockMfaService.checkUserMfaCompliance).toHaveBeenCalledWith(
        "u1",
        "t1",
      );
      expect(result.access_token).toBe("signed-jwt");
      expect(accessTokenPayload().amr).toEqual(["pwd"]);
      expect(accessTokenPayload().mfa_grace_expires_at).toBeUndefined();
    });

    it("minting under grace stamps mfa_grace_expires_at (unix seconds) on access + id tokens", async () => {
      const graceEnd = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
      mockPrisma.authorizationCode.findUnique.mockResolvedValue(
        buildAuthCode({
          tenantId: "t1",
          tenantSubdomain: "acme",
          user: tenantUser,
        }),
      );
      mintHappyPath();
      mockMfaService.checkUserMfaCompliance.mockResolvedValue(
        compliance({
          compliant: false,
          withinGrace: true,
          requiresSetup: true,
          tenantPolicy: "REQUIRED",
          gracePeriodEndsAt: graceEnd,
        }),
      );

      await service.token(codeParams);

      const expected = Math.floor(graceEnd.getTime() / 1000);
      expect(accessTokenPayload().mfa_grace_expires_at).toBe(expected);
      expect(accessTokenPayload().amr).toEqual(["pwd"]);
      // Second signJwt call is the id_token (openid scope requested)
      const idTokenPayload = mockKeyService.signJwt.mock.calls[1][0];
      expect(idTokenPayload.mfa_grace_expires_at).toBe(expected);
      expect(idTokenPayload.amr).toEqual(["pwd"]);
    });

    it("stamps the SESSION amr persisted on the code row (no mfaEnabled approximation)", async () => {
      mockPrisma.authorizationCode.findUnique.mockResolvedValue(
        buildAuthCode({
          tenantId: "t1",
          tenantSubdomain: "acme",
          user: tenantUser,
          amr: ["pwd", "otp"], // this login truly did TOTP
        }),
      );
      mintHappyPath();
      mockMfaService.checkUserMfaCompliance.mockResolvedValue(
        compliance({ mfaEnabled: true, tenantPolicy: "REQUIRED" }),
      );

      await service.token(codeParams);

      expect(accessTokenPayload().amr).toEqual(["pwd", "otp"]);
      // The session amr is persisted onto the new refresh-token row so the
      // refresh grant can re-stamp the ORIGINAL login's methods.
      expect(mockPrisma.refreshToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ amr: ["pwd", "otp"] }),
      });
    });

    it("mfaEnabled alone no longer fabricates 'otp' — a pwd-only session stays ['pwd']", async () => {
      mockPrisma.authorizationCode.findUnique.mockResolvedValue(
        buildAuthCode({
          tenantId: "t1",
          tenantSubdomain: "acme",
          user: tenantUser,
          amr: ["pwd"],
        }),
      );
      mintHappyPath();
      mockMfaService.checkUserMfaCompliance.mockResolvedValue(
        compliance({ mfaEnabled: true, tenantPolicy: "OPTIONAL" }),
      );

      await service.token(codeParams);

      expect(accessTokenPayload().amr).toEqual(["pwd"]);
    });

    it("federated session amr ['fed'] flows through code exchange untouched", async () => {
      mockPrisma.authorizationCode.findUnique.mockResolvedValue(
        buildAuthCode({ amr: ["fed"] }),
      );
      mintHappyPath();

      await service.token(codeParams);

      expect(accessTokenPayload().amr).toEqual(["fed"]);
      expect(mockPrisma.refreshToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ amr: ["fed"] }),
      });
    });

    it("refresh grant re-stamps the ORIGINAL session amr from the token row and persists it onward", async () => {
      mockSessionService.verifyRefreshTokenJwt.mockResolvedValue(
        refreshJwtPayload,
      );
      mockPrisma.refreshToken.findUnique.mockResolvedValue(
        buildRefreshToken({ amr: ["pwd", "otp"] }),
      );
      mintHappyPath();

      await service.token(refreshParams);

      expect(accessTokenPayload().amr).toEqual(["pwd", "otp"]);
      // Rotation carries the amr onto the NEW refresh-token row.
      expect(mockPrisma.refreshToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ amr: ["pwd", "otp"] }),
      });
    });

    it("legacy refresh row (empty amr) re-stamps ['pwd']", async () => {
      mockSessionService.verifyRefreshTokenJwt.mockResolvedValue(
        refreshJwtPayload,
      );
      mockPrisma.refreshToken.findUnique.mockResolvedValue(
        buildRefreshToken(), // amr: []
      );
      mintHappyPath();

      await service.token(refreshParams);

      expect(accessTokenPayload().amr).toEqual(["pwd"]);
      expect(mockPrisma.refreshToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ amr: ["pwd"] }),
      });
    });

    it("refresh after grace expiry rejects with interaction_required WITHOUT revoking the family", async () => {
      mockSessionService.verifyRefreshTokenJwt.mockResolvedValue(
        refreshJwtPayload,
      );
      mockPrisma.refreshToken.findUnique.mockResolvedValue(
        buildRefreshToken({
          tenantId: "t1",
          tenantSubdomain: "acme",
          user: tenantUser,
        }),
      );
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
      mockMfaService.checkUserMfaCompliance.mockResolvedValue(
        compliance({
          compliant: false,
          withinGrace: false,
          requiresSetup: true,
          tenantPolicy: "REQUIRED",
          gracePeriodEndsAt: new Date(Date.now() - 1000),
        }),
      );

      await expect(service.token(refreshParams)).rejects.toMatchObject({
        response: {
          error: "interaction_required",
          error_description: "MFA enrollment required by tenant policy",
        },
      });

      // The presented token IS rotated (legitimately consumed)...
      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { id: "sid-1", revoked: false },
        data: { revoked: true, revokedAt: expect.any(Date) },
      });
      // ...but a policy failure must NOT look like theft.
      expect(mockSessionService.revokeUserAppTokens).not.toHaveBeenCalled();
      expect(mockKeyService.signJwt).not.toHaveBeenCalled();
    });

    it("code exchange after grace expiry rejects with interaction_required after the code is consumed", async () => {
      mockPrisma.authorizationCode.findUnique.mockResolvedValue(
        buildAuthCode({
          tenantId: "t1",
          tenantSubdomain: "acme",
          user: tenantUser,
        }),
      );
      mockPrisma.authorizationCode.updateMany.mockResolvedValue({ count: 1 });
      mockMfaService.checkUserMfaCompliance.mockResolvedValue(
        compliance({
          compliant: false,
          withinGrace: false,
          requiresSetup: true,
          tenantPolicy: "REQUIRED",
        }),
      );

      await expect(service.token(codeParams)).rejects.toMatchObject({
        response: { error: "interaction_required" },
      });

      // Code was atomically claimed BEFORE the policy check (consumed either way)
      expect(mockPrisma.authorizationCode.updateMany).toHaveBeenCalled();
      // Policy failure is not theft: no family revocation, no tokens minted.
      expect(mockSessionService.revokeUserAppTokens).not.toHaveBeenCalled();
      expect(mockKeyService.signJwt).not.toHaveBeenCalled();
    });
  });
});
