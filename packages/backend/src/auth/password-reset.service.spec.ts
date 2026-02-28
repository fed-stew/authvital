jest.mock("bcrypt", () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

jest.mock("crypto", () => ({
  randomBytes: jest.fn(),
}));

import { BadRequestException, Logger } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import * as crypto from "crypto";
import { PasswordResetService } from "./password-reset.service";

describe("PasswordResetService", () => {
  const originalEnv = process.env;

  const mockPrisma = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    session: {
      deleteMany: jest.fn(),
    },
  };

  const mockEmailService = {
    sendPasswordResetEmail: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      BASE_URL: "https://idp.example.com",
      NODE_ENV: "test",
    };
    jest.spyOn(Logger.prototype, "debug").mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  const createService = () =>
    new PasswordResetService(mockPrisma as any, mockEmailService as any);

  it("throws at construction when BASE_URL is missing", () => {
    delete process.env.BASE_URL;
    expect(() => createService()).toThrow(
      "BASE_URL environment variable is required",
    );
  });

  describe("requestReset", () => {
    it("returns success and does not reveal unknown email existence", async () => {
      const service = createService();
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await service.requestReset({
        email: "missing@example.com",
      });

      expect(result).toEqual({ success: true });
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
      expect(mockEmailService.sendPasswordResetEmail).not.toHaveBeenCalled();
      expect(Logger.prototype.debug).toHaveBeenCalled();
    });

    it("stores token hash, sends email, and returns success for existing user", async () => {
      const service = createService();
      mockPrisma.user.findUnique.mockResolvedValue({
        id: "u1",
        email: "user@example.com",
        givenName: "John",
      });
      (crypto.randomBytes as jest.Mock).mockReturnValue({
        toString: () => "resettoken",
      });
      (bcrypt.hash as jest.Mock).mockResolvedValue("hashed-reset-token");

      const result = await service.requestReset({ email: "USER@EXAMPLE.COM" });

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: "user@example.com" },
      });
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: "u1" },
        data: {
          passwordResetToken: "hashed-reset-token",
          passwordResetExpires: expect.any(Date),
        },
      });
      expect(mockEmailService.sendPasswordResetEmail).toHaveBeenCalledWith(
        "user@example.com",
        "resettoken",
        expect.objectContaining({
          name: "John",
          resetUrl: expect.stringContaining(
            "/auth/reset-password?token=resettoken",
          ),
        }),
      );
      expect(result).toEqual({ success: true });
    });

    it("does not log dev reset link in production", async () => {
      process.env.NODE_ENV = "production";
      const service = createService();
      mockPrisma.user.findUnique.mockResolvedValue({
        id: "u1",
        email: "user@example.com",
        givenName: null,
      });
      (crypto.randomBytes as jest.Mock).mockReturnValue({
        toString: () => "resettoken",
      });
      (bcrypt.hash as jest.Mock).mockResolvedValue("hashed-reset-token");

      await service.requestReset({ email: "user@example.com" });

      const calls = (Logger.prototype.debug as jest.Mock).mock.calls
        .flat()
        .join(" ");
      expect(calls).not.toContain("[DEV] Password reset link");
    });
  });

  describe("verifyToken", () => {
    it("returns valid true and masked email when token matches", async () => {
      const service = createService();
      mockPrisma.user.findMany.mockResolvedValue([
        { id: "u1", email: "john@example.com", passwordResetToken: "hash1" },
      ]);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.verifyToken({ token: "token" });

      expect(result).toEqual({ valid: true, email: "j***@e***.com" });
    });

    it("returns valid true without email when matched user email is null", async () => {
      const service = createService();
      mockPrisma.user.findMany.mockResolvedValue([
        { id: "u1", email: null, passwordResetToken: "hash1" },
      ]);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.verifyToken({ token: "token" });

      expect(result).toEqual({ valid: true, email: undefined });
    });

    it("returns valid false when no token matches", async () => {
      const service = createService();
      mockPrisma.user.findMany.mockResolvedValue([
        { id: "u1", email: "john@example.com", passwordResetToken: "hash1" },
      ]);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      const result = await service.verifyToken({ token: "token" });

      expect(result).toEqual({ valid: false });
    });

    it("skips users with null token and still returns false", async () => {
      const service = createService();
      mockPrisma.user.findMany.mockResolvedValue([
        { id: "u1", email: "john@example.com", passwordResetToken: null },
      ]);

      const result = await service.verifyToken({ token: "token" });

      expect(result).toEqual({ valid: false });
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });
  });

  describe("resetPassword", () => {
    it("throws when new password is too short", async () => {
      const service = createService();

      await expect(
        service.resetPassword({ token: "token", newPassword: "short" }),
      ).rejects.toThrow(
        new BadRequestException("Password must be at least 8 characters"),
      );
    });

    it("resets password, clears token, and invalidates sessions on match", async () => {
      const service = createService();
      mockPrisma.user.findMany.mockResolvedValue([
        { id: "u1", email: "john@example.com", passwordResetToken: "hash1" },
      ]);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (bcrypt.hash as jest.Mock).mockResolvedValue("new-password-hash");

      const result = await service.resetPassword({
        token: "token",
        newPassword: "long-enough-password",
      });

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: "u1" },
        data: {
          passwordHash: "new-password-hash",
          passwordResetToken: null,
          passwordResetExpires: null,
        },
      });
      expect(mockPrisma.session.deleteMany).toHaveBeenCalledWith({
        where: { userId: "u1" },
      });
      expect(result).toEqual({ success: true });
    });

    it("throws invalid/expired when token does not match", async () => {
      const service = createService();
      mockPrisma.user.findMany.mockResolvedValue([
        { id: "u1", email: "john@example.com", passwordResetToken: "hash1" },
      ]);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.resetPassword({
          token: "bad-token",
          newPassword: "long-enough-password",
        }),
      ).rejects.toThrow(
        new BadRequestException("Invalid or expired reset token"),
      );
    });

    it("skips users with null token in reset loop and throws at end", async () => {
      const service = createService();
      mockPrisma.user.findMany.mockResolvedValue([
        { id: "u1", email: "john@example.com", passwordResetToken: null },
      ]);

      await expect(
        service.resetPassword({
          token: "token",
          newPassword: "long-enough-password",
        }),
      ).rejects.toThrow(
        new BadRequestException("Invalid or expired reset token"),
      );
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });
  });
});
