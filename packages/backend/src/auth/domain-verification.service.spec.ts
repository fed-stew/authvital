import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { DomainVerificationService } from "./domain-verification.service";

describe("DomainVerificationService", () => {
  const mockPrisma = {
    tenant: {
      findUnique: jest.fn(),
    },
    domain: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    user: {
      findMany: jest.fn(),
    },
    membership: {
      findFirst: jest.fn(),
      deleteMany: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  let service: DomainVerificationService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new DomainVerificationService(mockPrisma as any);
  });

  describe("initiateDomainVerification", () => {
    it("throws when tenant does not exist", async () => {
      jest
        .spyOn(service as any, "validateTenantOwnership")
        .mockResolvedValue(undefined);
      mockPrisma.tenant.findUnique.mockResolvedValue(null);

      await expect(
        service.initiateDomainVerification("t1", "example.com", "u1"),
      ).rejects.toThrow(new NotFoundException("Tenant not found"));
    });

    it("throws conflict when domain is verified by another tenant", async () => {
      jest
        .spyOn(service as any, "validateTenantOwnership")
        .mockResolvedValue(undefined);
      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: "t1",
        name: "Tenant A",
      });
      mockPrisma.domain.findFirst
        .mockResolvedValueOnce({
          id: "d-conflict",
          tenant: { id: "t2", name: "Tenant B" },
        })
        .mockResolvedValueOnce(null);

      await expect(
        service.initiateDomainVerification("t1", "example.com", "u1"),
      ).rejects.toThrow(
        new ConflictException("Domain is already verified by tenant: Tenant B"),
      );
    });

    it("returns existing domain without creating new record", async () => {
      jest
        .spyOn(service as any, "validateTenantOwnership")
        .mockResolvedValue(undefined);
      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: "t1",
        name: "Tenant A",
      });
      mockPrisma.domain.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: "d1",
          domainName: "example.com",
          verificationToken: "idp-verify-token",
          isVerified: false,
          verifiedAt: null,
        });

      const result = await service.initiateDomainVerification(
        "t1",
        "EXAMPLE.COM",
        "u1",
      );

      expect(mockPrisma.domain.create).not.toHaveBeenCalled();
      expect(result.domain).toEqual({
        id: "d1",
        domainName: "example.com",
        isVerified: false,
        verifiedAt: null,
      });
      expect(result.verificationToken).toBe("idp-verify-token");
      expect(result.dnsInstructions.host).toBe("_idp-verification.example.com");
    });

    it("creates domain when missing and returns dns instructions", async () => {
      jest
        .spyOn(service as any, "validateTenantOwnership")
        .mockResolvedValue(undefined);
      jest
        .spyOn(service as any, "generateVerificationToken")
        .mockReturnValue("idp-verify-new");

      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: "t1",
        name: "Tenant A",
      });
      mockPrisma.domain.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      mockPrisma.domain.create.mockResolvedValue({
        id: "d2",
        domainName: "example.com",
        verificationToken: "idp-verify-new",
        isVerified: false,
        verifiedAt: null,
      });

      const result = await service.initiateDomainVerification(
        "t1",
        "example.com",
        "u1",
      );

      expect(mockPrisma.domain.create).toHaveBeenCalledWith({
        data: {
          domainName: "example.com",
          verificationToken: "idp-verify-new",
          isVerified: false,
          tenantId: "t1",
        },
      });
      expect(result.verificationToken).toBe("idp-verify-new");
    });
  });

  describe("verifyDomain", () => {
    it("throws when domain is missing", async () => {
      mockPrisma.domain.findUnique.mockResolvedValue(null);

      await expect(service.verifyDomain("d1", "u1")).rejects.toThrow(
        new NotFoundException("Domain not found"),
      );
    });

    it("returns already verified response when domain is already verified", async () => {
      jest
        .spyOn(service as any, "validateTenantOwnership")
        .mockResolvedValue(undefined);
      mockPrisma.domain.findUnique.mockResolvedValue({
        id: "d1",
        domainName: "example.com",
        tenantId: "t1",
        tenant: { id: "t1", name: "Tenant A" },
        verificationToken: "token",
        isVerified: true,
        verifiedAt: new Date("2026-01-01T00:00:00Z"),
      });

      const result = await service.verifyDomain("d1", "u1");

      expect(result.success).toBe(true);
      expect(result.message).toBe("Domain is already verified");
      expect(mockPrisma.domain.update).not.toHaveBeenCalled();
    });

    it("returns failure when dns txt record does not match token", async () => {
      jest
        .spyOn(service as any, "validateTenantOwnership")
        .mockResolvedValue(undefined);
      jest.spyOn(service as any, "checkDnsTxtRecord").mockResolvedValue(false);

      mockPrisma.domain.findUnique.mockResolvedValue({
        id: "d1",
        domainName: "example.com",
        tenantId: "t1",
        tenant: { id: "t1", name: "Tenant A" },
        verificationToken: "token",
        isVerified: false,
        verifiedAt: null,
      });

      const result = await service.verifyDomain("d1", "u1");

      expect(result.success).toBe(false);
      expect(result.message).toContain("DNS TXT record not found");
      expect(mockPrisma.domain.update).not.toHaveBeenCalled();
    });

    it("marks domain verified when dns txt check succeeds", async () => {
      jest
        .spyOn(service as any, "validateTenantOwnership")
        .mockResolvedValue(undefined);
      jest.spyOn(service as any, "checkDnsTxtRecord").mockResolvedValue(true);

      mockPrisma.domain.findUnique.mockResolvedValue({
        id: "d1",
        domainName: "example.com",
        tenantId: "t1",
        tenant: { id: "t1", name: "Tenant A" },
        verificationToken: "token",
        isVerified: false,
        verifiedAt: null,
      });
      mockPrisma.domain.update.mockResolvedValue({
        id: "d1",
        domainName: "example.com",
        isVerified: true,
        verifiedAt: new Date("2026-01-01T00:00:00Z"),
      });

      const result = await service.verifyDomain("d1", "u1");

      expect(result.success).toBe(true);
      expect(result.message).toBe("Domain verified successfully");
      expect(mockPrisma.domain.update).toHaveBeenCalledWith({
        where: { id: "d1" },
        data: {
          isVerified: true,
          verifiedAt: expect.any(Date),
        },
      });
    });
  });

  describe("findMigratableUsers", () => {
    it("throws when domain is missing", async () => {
      mockPrisma.domain.findUnique.mockResolvedValue(null);

      await expect(service.findMigratableUsers("d1", "u1")).rejects.toThrow(
        new NotFoundException("Domain not found"),
      );
    });

    it("throws when domain is not verified", async () => {
      mockPrisma.domain.findUnique.mockResolvedValue({
        id: "d1",
        domainName: "example.com",
        tenantId: "t1",
        tenant: { id: "t1", name: "Tenant A" },
        isVerified: false,
      });

      await expect(service.findMigratableUsers("d1", "u1")).rejects.toThrow(
        new BadRequestException(
          "Domain must be verified before migrating users",
        ),
      );
    });

    it("returns mapped migratable users and count", async () => {
      jest
        .spyOn(service as any, "validateTenantOwnership")
        .mockResolvedValue(undefined);
      mockPrisma.domain.findUnique.mockResolvedValue({
        id: "d1",
        domainName: "example.com",
        tenantId: "t1",
        tenant: { id: "t1", name: "Tenant A" },
        isVerified: true,
      });
      mockPrisma.user.findMany.mockResolvedValue([
        {
          id: "u2",
          email: "alice@example.com",
          givenName: "Alice",
          familyName: "A",
          memberships: [{ tenant: { id: "old1", name: "Old Tenant" } }],
        },
      ]);

      const result = await service.findMigratableUsers("d1", "owner1");

      expect(result.count).toBe(1);
      expect(result.domain).toEqual({ id: "d1", domainName: "example.com" });
      expect(result.targetTenant).toEqual({ id: "t1", name: "Tenant A" });
      expect(result.migratableUsers[0]).toEqual({
        id: "u2",
        email: "alice@example.com",
        givenName: "Alice",
        familyName: "A",
        currentTenants: [{ id: "old1", name: "Old Tenant" }],
      });
    });
  });

  describe("migrateUsers", () => {
    const verifiedDomain = {
      id: "d1",
      domainName: "example.com",
      tenantId: "t1",
      tenant: { id: "t1", name: "Tenant A" },
      isVerified: true,
    };

    it("throws when domain missing", async () => {
      mockPrisma.domain.findUnique.mockResolvedValue(null);

      await expect(
        service.migrateUsers("d1", ["u1"], "owner1"),
      ).rejects.toThrow(new NotFoundException("Domain not found"));
    });

    it("throws when domain not verified", async () => {
      mockPrisma.domain.findUnique.mockResolvedValue({
        ...verifiedDomain,
        isVerified: false,
      });

      await expect(
        service.migrateUsers("d1", ["u1"], "owner1"),
      ).rejects.toThrow(
        new BadRequestException(
          "Domain must be verified before migrating users",
        ),
      );
    });

    it("migrates eligible users, skips existing members, and records previousTenantId", async () => {
      jest
        .spyOn(service as any, "validateTenantOwnership")
        .mockResolvedValue(undefined);
      mockPrisma.domain.findUnique.mockResolvedValue(verifiedDomain);
      mockPrisma.user.findMany.mockResolvedValue([
        {
          id: "u1",
          email: "one@example.com",
          memberships: [
            {
              tenantId: "old-tenant",
              tenant: { id: "old-tenant", name: "Old" },
            },
          ],
        },
        {
          id: "u2",
          email: "two@example.com",
          memberships: [
            { tenantId: "t1", tenant: { id: "t1", name: "Tenant A" } },
          ],
        },
      ]);

      mockPrisma.$transaction.mockImplementation(async (cb: any) => {
        await cb({
          membership: {
            deleteMany: mockPrisma.membership.deleteMany,
            create: mockPrisma.membership.create,
          },
        });
      });

      const result = await service.migrateUsers("d1", ["u1", "u2"], "owner1");

      expect(mockPrisma.membership.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.membership.create).toHaveBeenCalledWith({
        data: {
          userId: "u1",
          tenantId: "t1",
          status: "ACTIVE",
          joinedAt: expect.any(Date),
        },
      });
      expect(result).toEqual({
        migratedCount: 1,
        users: [
          {
            id: "u1",
            email: "one@example.com",
            previousTenantId: "old-tenant",
          },
        ],
      });
    });

    it("removes old memberships when removeFromOldTenants is true", async () => {
      jest
        .spyOn(service as any, "validateTenantOwnership")
        .mockResolvedValue(undefined);
      mockPrisma.domain.findUnique.mockResolvedValue(verifiedDomain);
      mockPrisma.user.findMany.mockResolvedValue([
        {
          id: "u1",
          email: "one@example.com",
          memberships: [
            {
              tenantId: "old-tenant",
              tenant: { id: "old-tenant", name: "Old" },
            },
          ],
        },
      ]);

      mockPrisma.$transaction.mockImplementation(async (cb: any) => {
        await cb({
          membership: {
            deleteMany: mockPrisma.membership.deleteMany,
            create: mockPrisma.membership.create,
          },
        });
      });

      await service.migrateUsers("d1", ["u1"], "owner1", {
        removeFromOldTenants: true,
      });

      expect(mockPrisma.membership.deleteMany).toHaveBeenCalledWith({
        where: {
          userId: "u1",
          tenantId: { not: "t1" },
        },
      });
    });
  });

  describe("private helpers", () => {
    it("validateTenantOwnership throws when owner membership is missing", async () => {
      mockPrisma.membership.findFirst.mockResolvedValue(null);

      await expect(
        (service as any).validateTenantOwnership("t1", "u1"),
      ).rejects.toThrow(
        new ForbiddenException(
          "You must be a tenant owner to perform this action",
        ),
      );
    });

    it("validateTenantOwnership succeeds when owner membership exists", async () => {
      mockPrisma.membership.findFirst.mockResolvedValue({ id: "m1" });

      await expect(
        (service as any).validateTenantOwnership("t1", "u1"),
      ).resolves.toBeUndefined();
    });

    it("generateVerificationToken has expected prefix", () => {
      const token = (service as any).generateVerificationToken();
      expect(token.startsWith("idp-verify-")).toBe(true);
    });

    it("getDnsInstructions returns structured instructions", () => {
      const result = (service as any).getDnsInstructions(
        "example.com",
        "token123",
      );
      expect(result).toEqual(
        expect.objectContaining({
          type: "TXT",
          host: "_idp-verification.example.com",
          value: "token123",
          instructions: expect.any(Array),
        }),
      );
    });
  });
});
