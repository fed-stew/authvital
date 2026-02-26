jest.mock("bcrypt", () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

jest.mock("../oauth/key.service", () => ({
  KeyService: class MockKeyService {},
}));

import { ConflictException, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as bcrypt from "bcrypt";
import { AuthService } from "./auth.service";

describe("AuthService", () => {
  const mockPrisma = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  };

  const mockKeyService = {
    signJwt: jest.fn(),
    verifyJwt: jest.fn(),
  };

  const mockConfigService = {
    getOrThrow: jest.fn().mockReturnValue("https://issuer.example.com"),
  } as unknown as ConfigService;

  const mockMfaService = {
    isMfaEnabled: jest.fn().mockResolvedValue(false),
    verifyToken: jest.fn(),
    generateSetup: jest.fn(),
  };

  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AuthService(
      mockPrisma as any,
      mockKeyService as any,
      mockConfigService,
      mockMfaService as any,
    );
  });

  describe("register", () => {
    it("creates new user and returns auth response", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue("hashed-password");
      mockPrisma.user.create.mockResolvedValue({
        id: "u1",
        email: "user@example.com",
      });
      mockKeyService.signJwt.mockResolvedValue("jwt-token");

      const result = await service.register({
        email: "User@Example.com",
        password: "password123",
      });

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: "user@example.com" },
      });
      expect(result).toEqual({
        accessToken: "jwt-token",
        user: {
          id: "u1",
          email: "user@example.com",
        },
      });
    });

    it("register falls back to empty email when created user email is null", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue("hashed-password");
      mockPrisma.user.create.mockResolvedValue({ id: "u1", email: null });
      mockKeyService.signJwt.mockResolvedValue("jwt-token");

      const result = await service.register({
        email: "User@Example.com",
        password: "password123",
      });

      expect(mockKeyService.signJwt).toHaveBeenCalledWith(
        { email: "" },
        expect.objectContaining({ subject: "u1" }),
      );
      expect(result.user.email).toBe("");
    });

    it("throws conflict if email already exists", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: "existing" });

      await expect(
        service.register({
          email: "user@example.com",
          password: "password123",
        }),
      ).rejects.toThrow(new ConflictException("Email already registered"));
    });
  });

  describe("login", () => {
    const baseUser = {
      id: "u1",
      email: "user@example.com",
      givenName: "John",
      familyName: "Doe",
      isMachine: false,
      passwordHash: "stored-hash",
      memberships: [
        {
          id: "m1",
          tenant: { id: "t1", name: "Tenant", slug: "tenant" },
        },
      ],
    };

    it("throws unauthorized when user does not exist", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({
          email: "missing@example.com",
          password: "password123",
        }),
      ).rejects.toThrow(new UnauthorizedException("Invalid credentials"));
    });

    it("throws unauthorized when user is machine account", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...baseUser,
        isMachine: true,
      });

      await expect(
        service.login({ email: "user@example.com", password: "password123" }),
      ).rejects.toThrow(new UnauthorizedException("Invalid credentials"));
    });

    it("throws unauthorized when password hash is missing", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...baseUser,
        passwordHash: null,
      });

      await expect(
        service.login({ email: "user@example.com", password: "password123" }),
      ).rejects.toThrow(new UnauthorizedException("Invalid credentials"));
    });

    it("throws unauthorized when password is invalid", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(baseUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.login({ email: "user@example.com", password: "wrong" }),
      ).rejects.toThrow(new UnauthorizedException("Invalid credentials"));
    });

    it("returns token, user profile and memberships when credentials are valid", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(baseUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockKeyService.signJwt.mockResolvedValue("jwt-token");

      const result = await service.login({
        email: "user@example.com",
        password: "password123",
      });

      expect(result.accessToken).toBe("jwt-token");
      expect(result.user).toEqual({
        id: "u1",
        email: "user@example.com",
        givenName: "John",
        familyName: "Doe",
      });
      expect(result.memberships).toEqual([
        {
          id: "m1",
          tenant: { id: "t1", name: "Tenant", slug: "tenant" },
        },
      ]);
    });

    it("login signs token with empty email when user email is null", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...baseUser,
        email: null,
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockKeyService.signJwt.mockResolvedValue("jwt-token");

      const result = await service.login({
        email: "user@example.com",
        password: "password123",
      });

      expect(mockKeyService.signJwt).toHaveBeenCalledWith(
        { email: "" },
        expect.objectContaining({ subject: "u1" }),
      );
      expect(result.user!.email).toBeNull();
    });
  });

  describe("user and jwt helpers", () => {
    it("validateUser returns selected user fields", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: "u1",
        email: "user@example.com",
      });

      const result = await service.validateUser("u1");

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: "u1" },
        select: { id: true, email: true },
      });
      expect(result).toEqual({ id: "u1", email: "user@example.com" });
    });

    it("getProfile delegates prisma query", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: "u1" });

      const result = await service.getProfile("u1");

      expect(mockPrisma.user.findUnique).toHaveBeenCalled();
      expect(result).toEqual({ id: "u1" });
    });

    it("generateJwt signs with issuer and 7-day expiration", async () => {
      mockKeyService.signJwt.mockResolvedValue("token");

      const token = await service.generateJwt("u1", "u@example.com");

      expect(mockKeyService.signJwt).toHaveBeenCalledWith(
        { email: "u@example.com" },
        {
          subject: "u1",
          issuer: "https://issuer.example.com",
          expiresIn: 7 * 24 * 60 * 60,
        },
      );
      expect(token).toBe("token");
    });

    it("validateJwt returns payload when verification succeeds", async () => {
      mockKeyService.verifyJwt.mockResolvedValue({
        sub: "u1",
        email: "u@example.com",
      });

      const result = await service.validateJwt("token");

      expect(result).toEqual({ sub: "u1", email: "u@example.com" });
    });

    it("validateJwt returns null when verification fails", async () => {
      mockKeyService.verifyJwt.mockRejectedValue(new Error("invalid"));

      const result = await service.validateJwt("token");

      expect(result).toBeNull();
    });
  });
});
