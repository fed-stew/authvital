const prismaCtorArgs: any[] = [];

jest.mock("@prisma/client", () => {
  class PrismaClient {
    public $connect = jest.fn();
    public $disconnect = jest.fn();
    public $transaction = jest.fn();

    public membershipRole = { deleteMany: jest.fn().mockResolvedValue({}) };
    public role = { deleteMany: jest.fn().mockResolvedValue({}) };
    public licenseAssignment = { deleteMany: jest.fn().mockResolvedValue({}) };
    public appSubscription = { deleteMany: jest.fn().mockResolvedValue({}) };
    public licenseType = { deleteMany: jest.fn().mockResolvedValue({}) };
    public application = { deleteMany: jest.fn().mockResolvedValue({}) };
    public domain = { deleteMany: jest.fn().mockResolvedValue({}) };
    public membership = { deleteMany: jest.fn().mockResolvedValue({}) };
    public tenant = { deleteMany: jest.fn().mockResolvedValue({}) };
    public user = { deleteMany: jest.fn().mockResolvedValue({}) };

    constructor(args?: any) {
      prismaCtorArgs.push(args);
    }
  }

  return { PrismaClient };
});

import { Logger } from "@nestjs/common";
import { PrismaService } from "./prisma.service";

describe("PrismaService", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    prismaCtorArgs.length = 0;
    process.env = { ...originalEnv };
    jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it("uses verbose prisma logging in development", () => {
    process.env.NODE_ENV = "development";

    new PrismaService();

    expect(prismaCtorArgs[0]).toEqual({
      log: ["query", "info", "warn", "error"],
    });
  });

  it("uses error-only prisma logging outside development", () => {
    process.env.NODE_ENV = "production";

    new PrismaService();

    expect(prismaCtorArgs[0]).toEqual({
      log: ["error"],
    });
  });

  it("onModuleInit connects and logs success", async () => {
    const service = new PrismaService();
    (service.$connect as jest.Mock).mockResolvedValue(undefined);

    await service.onModuleInit();

    expect(service.$connect).toHaveBeenCalled();
    expect(Logger.prototype.log).toHaveBeenCalledWith(
      "Database connection established",
    );
  });

  it("onModuleInit logs and rethrows connection error", async () => {
    const service = new PrismaService();
    const err = new Error("db down");
    (service.$connect as jest.Mock).mockRejectedValue(err);

    await expect(service.onModuleInit()).rejects.toThrow(err);
    expect(Logger.prototype.error).toHaveBeenCalledWith(
      "Failed to connect to database",
      err,
    );
  });

  it("onModuleDestroy disconnects and logs", async () => {
    const service = new PrismaService();
    (service.$disconnect as jest.Mock).mockResolvedValue(undefined);

    await service.onModuleDestroy();

    expect(service.$disconnect).toHaveBeenCalled();
    expect(Logger.prototype.log).toHaveBeenCalledWith(
      "Database connection closed",
    );
  });

  it("cleanDatabase throws in production", async () => {
    process.env.NODE_ENV = "production";
    const service = new PrismaService();

    await expect(service.cleanDatabase()).rejects.toThrow(
      "Cannot clean database in production!",
    );
  });

  it("cleanDatabase runs deleteMany in dependency order transaction", async () => {
    process.env.NODE_ENV = "test";
    const service = new PrismaService();
    (service.$transaction as jest.Mock).mockResolvedValue(undefined);

    await service.cleanDatabase();

    expect(service.membershipRole.deleteMany).toHaveBeenCalled();
    expect(service.role.deleteMany).toHaveBeenCalled();
    expect(service.licenseAssignment.deleteMany).toHaveBeenCalled();
    expect(service.appSubscription.deleteMany).toHaveBeenCalled();
    expect(service.licenseType.deleteMany).toHaveBeenCalled();
    expect(service.application.deleteMany).toHaveBeenCalled();
    expect(service.domain.deleteMany).toHaveBeenCalled();
    expect(service.membership.deleteMany).toHaveBeenCalled();
    expect(service.tenant.deleteMany).toHaveBeenCalled();
    expect(service.user.deleteMany).toHaveBeenCalled();
    expect(service.$transaction).toHaveBeenCalledTimes(1);
  });
});
