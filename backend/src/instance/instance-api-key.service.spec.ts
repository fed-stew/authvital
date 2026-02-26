jest.mock("bcrypt", () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

jest.mock("crypto", () => ({
  randomBytes: jest.fn(),
}));

import { NotFoundException } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import * as crypto from "crypto";
import { InstanceApiKeyService } from "./instance-api-key.service";

describe("InstanceApiKeyService", () => {
  const mockPrisma = {
    instanceApiKey: {
      create: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
  };

  let service: InstanceApiKeyService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new InstanceApiKeyService(mockPrisma as any);
  });

  it("createApiKey generates key, hashes it, stores defaults, and returns safe record", async () => {
    (crypto.randomBytes as jest.Mock).mockReturnValue({
      toString: () => "abcd",
    });
    (bcrypt.hash as jest.Mock).mockResolvedValue("hashed-key");
    mockPrisma.instanceApiKey.create.mockResolvedValue({
      id: "k1",
      prefix: "ik_live_abcd",
      name: "Integration Key",
      permissions: ["instance:*"],
      createdAt: new Date("2026-01-01T00:00:00Z"),
    });

    const result = await service.createApiKey({ name: "Integration Key" });

    expect(result.key.startsWith("ik_live_")).toBe(true);
    expect(bcrypt.hash).toHaveBeenCalled();
    expect(mockPrisma.instanceApiKey.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "Integration Key",
          permissions: ["instance:*"],
        }),
      }),
    );
    expect(result.record).toEqual({
      id: "k1",
      prefix: "ik_live_abcd",
      name: "Integration Key",
      permissions: ["instance:*"],
      createdAt: new Date("2026-01-01T00:00:00Z"),
    });
  });

  it("validateApiKey returns null for invalid prefix", async () => {
    const result = await service.validateApiKey("sk_live_wrong");
    expect(result).toBeNull();
    expect(mockPrisma.instanceApiKey.findMany).not.toHaveBeenCalled();
  });

  it("validateApiKey returns matched key and updates lastUsedAt", async () => {
    mockPrisma.instanceApiKey.findMany.mockResolvedValue([
      { id: "k1", name: "K1", permissions: ["instance:*"], keyHash: "h1" },
      { id: "k2", name: "K2", permissions: ["instance:read"], keyHash: "h2" },
    ]);
    (bcrypt.compare as jest.Mock)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    const result = await service.validateApiKey("ik_live_real");

    expect(result).toEqual({
      id: "k2",
      name: "K2",
      permissions: ["instance:read"],
    });
    expect(mockPrisma.instanceApiKey.update).toHaveBeenCalledWith({
      where: { id: "k2" },
      data: { lastUsedAt: expect.any(Date) },
    });
  });

  it("validateApiKey returns null when no records match", async () => {
    mockPrisma.instanceApiKey.findMany.mockResolvedValue([
      { id: "k1", name: "K1", permissions: ["instance:*"], keyHash: "h1" },
    ]);
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);

    const result = await service.validateApiKey("ik_live_real");

    expect(result).toBeNull();
  });

  it("revokeApiKey throws NotFoundException when key is missing", async () => {
    mockPrisma.instanceApiKey.findUnique.mockResolvedValue(null);

    await expect(service.revokeApiKey("missing")).rejects.toThrow(
      new NotFoundException("API key not found"),
    );
  });

  it("revokeApiKey deactivates existing key", async () => {
    mockPrisma.instanceApiKey.findUnique.mockResolvedValue({ id: "k1" });

    const result = await service.revokeApiKey("k1");

    expect(mockPrisma.instanceApiKey.update).toHaveBeenCalledWith({
      where: { id: "k1" },
      data: { isActive: false },
    });
    expect(result).toEqual({ success: true, message: "API key revoked" });
  });

  it("deleteApiKey throws when key is missing and deletes when present", async () => {
    mockPrisma.instanceApiKey.findUnique.mockResolvedValueOnce(null);
    await expect(service.deleteApiKey("missing")).rejects.toThrow(
      new NotFoundException("API key not found"),
    );

    mockPrisma.instanceApiKey.findUnique.mockResolvedValueOnce({ id: "k1" });
    const result = await service.deleteApiKey("k1");

    expect(mockPrisma.instanceApiKey.delete).toHaveBeenCalledWith({
      where: { id: "k1" },
    });
    expect(result).toEqual({ success: true, message: "API key deleted" });
  });

  it("listApiKeys delegates with expected select/orderBy", async () => {
    mockPrisma.instanceApiKey.findMany.mockResolvedValue([]);

    const result = await service.listApiKeys();

    expect(mockPrisma.instanceApiKey.findMany).toHaveBeenCalledWith({
      select: {
        id: true,
        prefix: true,
        name: true,
        description: true,
        permissions: true,
        lastUsedAt: true,
        expiresAt: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
    expect(result).toEqual([]);
  });
});
