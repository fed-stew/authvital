import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { KeyManagerService } from "./key-manager.service";
import {
  CONSOLE_SESSION_TTL_SECONDS,
  DEFAULT_PASSIVE_KEY_LIFETIME_HOURS,
  MIN_PASSIVE_KEY_LIFETIME_SECONDS,
} from "../auth/constants/token-ttl";

describe("KeyManagerService — passive-key lifetime startup checks", () => {
  const mockPrisma = {
    applicationClient: { findMany: jest.fn() },
    signingKey: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  const mockKeyEncryption = { encrypt: jest.fn(), decrypt: jest.fn() };

  const configWith = (env: Record<string, string | undefined>) =>
    ({
      get: jest.fn((key: string) => env[key]),
    }) as unknown as ConfigService;

  let errorSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    errorSpy = jest
      .spyOn(Logger.prototype, "error")
      .mockImplementation(() => undefined);
    warnSpy = jest
      .spyOn(Logger.prototype, "warn")
      .mockImplementation(() => undefined);
    jest
      .spyOn(Logger.prototype, "log")
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const build = (env: Record<string, string | undefined> = {}) =>
    new KeyManagerService(
      mockPrisma as any,
      mockKeyEncryption as any,
      configWith(env),
    );

  describe("constructor: passive lifetime vs console session TTL", () => {
    it("ERROR-logs when the passive lifetime is below console TTL + 1h margin", () => {
      // Minimum is CONSOLE_SESSION_TTL + 1h; anything under trips the check.
      const tooShortHours = Math.floor(
        (MIN_PASSIVE_KEY_LIFETIME_SECONDS - 3600) / 3600,
      );
      build({ PASSIVE_KEY_LIFETIME_HOURS: String(tooShortHours) });

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("SHORTER than the console session TTL"),
      );
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining(`${CONSOLE_SESSION_TTL_SECONDS}s`),
      );
    });

    it("stays quiet with the 192h (8-day) default", () => {
      build({}); // no env override → DEFAULT_PASSIVE_KEY_LIFETIME_HOURS

      // 7d default refreshTokenTtl + 24h margin — default-configured
      // clients must never trip the per-client TTL check.
      expect(DEFAULT_PASSIVE_KEY_LIFETIME_HOURS).toBe(192);
      expect(errorSpy).not.toHaveBeenCalled();
    });
  });

  describe("assertClientTokenTtlsFitPassiveLifetime", () => {
    it("ERROR-logs each offending client BY clientId (access OR refresh TTL too long)", async () => {
      const service = build({});
      mockPrisma.applicationClient.findMany.mockResolvedValue([
        {
          clientId: "client-long-refresh",
          accessTokenTtl: 3600,
          refreshTokenTtl: 60 * 24 * 3600, // 60 days
          application: { name: "Long App" },
        },
      ]);

      await service.assertClientTokenTtlsFitPassiveLifetime();

      // Query considers BOTH TTLs — refresh tokens are JWTs verified via
      // the same signing keys.
      const passiveLifetimeSeconds = DEFAULT_PASSIVE_KEY_LIFETIME_HOURS * 3600;
      expect(mockPrisma.applicationClient.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [
              { accessTokenTtl: { gt: passiveLifetimeSeconds } },
              { refreshTokenTtl: { gt: passiveLifetimeSeconds } },
            ],
          },
        }),
      );
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("client-long-refresh"),
      );
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('app "Long App"'),
      );
    });

    it("stays quiet when every client's TTLs fit the passive lifetime", async () => {
      const service = build({});
      mockPrisma.applicationClient.findMany.mockResolvedValue([]);

      await service.assertClientTokenTtlsFitPassiveLifetime();

      expect(errorSpy).not.toHaveBeenCalled();
    });

    it("never throws when the database is unreachable (warns instead)", async () => {
      const service = build({});
      mockPrisma.applicationClient.findMany.mockRejectedValue(
        new Error("db down"),
      );

      await expect(
        service.assertClientTokenTtlsFitPassiveLifetime(),
      ).resolves.toBeUndefined();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("db down"),
      );
    });
  });
});
