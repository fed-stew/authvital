import { Test, TestingModule } from "@nestjs/testing";
import { LicensePoolService } from "../services/license-pool.service";
import { PrismaService } from "../../prisma/prisma.service";

// Mock PrismaService
const mockPrismaService = {
  application: {
    findUnique: jest.fn(),
  },
  appSubscription: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
  membership: {
    count: jest.fn(),
  },
  licenseType: {
    findFirst: jest.fn(),
  },
};

describe("LicensePoolService - checkMemberAccess", () => {
  let service: LicensePoolService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LicensePoolService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<LicensePoolService>(LicensePoolService);

    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  // ==========================================================================
  // FREE MODE TESTS
  // ==========================================================================

  describe("FREE Mode", () => {
    it("should allow access when auto-provisioned subscription exists (unlimited)", async () => {
      mockPrismaService.application.findUnique.mockResolvedValue({
        id: "app-1",
        name: "Test App",
        licensingMode: "FREE",
      });
      mockPrismaService.appSubscription.findFirst.mockResolvedValue({
        id: "sub-free",
        licenseType: { id: "lt-free", maxMembers: null, name: "Free" },
      });

      const result = await service.checkMemberAccess("tenant-1", "app-1");

      expect(result).toEqual({
        allowed: true,
        mode: "FREE",
        message: "Unlimited members allowed",
        memberLimit: {
          maxMembers: null,
          currentMembers: 0,
          available: null,
        },
      });
    });

    it("should deny access when FREE mode subscription is missing", async () => {
      mockPrismaService.application.findUnique.mockResolvedValue({
        id: "app-1",
        name: "Test App",
        licensingMode: "FREE",
      });
      mockPrismaService.appSubscription.findFirst.mockResolvedValue(null);

      const result = await service.checkMemberAccess("tenant-1", "app-1");

      expect(result).toEqual({
        allowed: false,
        mode: "FREE",
        reason: "No active subscription for this application",
      });
    });
  });

  // ==========================================================================
  // TENANT_WIDE MODE TESTS
  // ==========================================================================

  describe("TENANT_WIDE Mode", () => {
    it("should allow access with available member slots", async () => {
      // Arrange
      mockPrismaService.application.findUnique.mockResolvedValue({
        id: "app-1",
        name: "Test App",
        licensingMode: "TENANT_WIDE",
      });

      mockPrismaService.appSubscription.findFirst.mockResolvedValue({
        id: "sub-1",
        licenseType: {
          id: "lt-1",
          maxMembers: 10,
          name: "Pro",
        },
      });

      mockPrismaService.membership.count.mockResolvedValue(7);

      // Act
      const result = await service.checkMemberAccess("tenant-1", "app-1");

      // Assert
      expect(result).toEqual({
        allowed: true,
        mode: "TENANT_WIDE",
        message: "3 member slots remaining",
        memberLimit: {
          maxMembers: 10,
          currentMembers: 7,
          available: 3,
        },
      });
    });

    it("should allow unlimited access when maxMembers is null", async () => {
      // Arrange
      mockPrismaService.application.findUnique.mockResolvedValue({
        id: "app-1",
        name: "Test App",
        licensingMode: "TENANT_WIDE",
      });

      mockPrismaService.appSubscription.findFirst.mockResolvedValue({
        id: "sub-1",
        licenseType: {
          id: "lt-1",
          maxMembers: null,
          name: "Pro",
        },
      });

      // Act
      const result = await service.checkMemberAccess("tenant-1", "app-1");

      // Assert
      expect(result).toEqual({
        allowed: true,
        mode: "TENANT_WIDE",
        message: "Unlimited members allowed",
        memberLimit: {
          maxMembers: null,
          currentMembers: 0,
          available: null,
        },
      });
      expect(mockPrismaService.membership.count).not.toHaveBeenCalled();
    });

    it("should deny access when member limit is reached", async () => {
      // Arrange
      mockPrismaService.application.findUnique.mockResolvedValue({
        id: "app-1",
        name: "Test App",
        licensingMode: "TENANT_WIDE",
      });

      mockPrismaService.appSubscription.findFirst.mockResolvedValue({
        id: "sub-1",
        licenseType: {
          id: "lt-1",
          maxMembers: 10,
          name: "Pro",
        },
      });

      mockPrismaService.membership.count.mockResolvedValue(10);

      // Act
      const result = await service.checkMemberAccess("tenant-1", "app-1");

      // Assert
      expect(result).toEqual({
        allowed: false,
        mode: "TENANT_WIDE",
        reason: "Member limit reached (10 members max)",
        memberLimit: {
          maxMembers: 10,
          currentMembers: 10,
          available: 0,
        },
      });
    });

    it("should deny access when no active subscription", async () => {
      // Arrange
      mockPrismaService.application.findUnique.mockResolvedValue({
        id: "app-1",
        name: "Test App",
        licensingMode: "TENANT_WIDE",
      });

      mockPrismaService.appSubscription.findFirst.mockResolvedValue(null);

      // Act
      const result = await service.checkMemberAccess("tenant-1", "app-1");

      // Assert
      expect(result).toEqual({
        allowed: false,
        mode: "TENANT_WIDE",
        reason: "No active subscription for this application",
      });
    });

    it("should order subscriptions by displayOrder desc (best tier first)", async () => {
      // Arrange
      mockPrismaService.application.findUnique.mockResolvedValue({
        id: "app-1",
        name: "Test App",
        licensingMode: "TENANT_WIDE",
      });

      mockPrismaService.appSubscription.findFirst.mockResolvedValue({
        id: "sub-pro",
        licenseType: {
          id: "lt-pro",
          maxMembers: 100,
          name: "Pro",
        },
      });

      mockPrismaService.membership.count.mockResolvedValue(50);

      // Act
      await service.checkMemberAccess("tenant-1", "app-1");

      // Assert
      expect(mockPrismaService.appSubscription.findFirst).toHaveBeenCalledWith({
        where: {
          tenantId: "tenant-1",
          applicationId: "app-1",
          status: { in: ["ACTIVE", "TRIALING"] },
        },
        include: {
          licenseType: {
            select: { id: true, maxMembers: true, name: true },
          },
        },
        orderBy: { licenseType: { displayOrder: "desc" } },
      });
    });
  });

  // ==========================================================================
  // PER_SEAT MODE TESTS
  // ==========================================================================

  describe("PER_SEAT Mode", () => {
    it("should allow access with available seats", async () => {
      // Arrange
      mockPrismaService.application.findUnique.mockResolvedValue({
        id: "app-1",
        name: "Test App",
        licensingMode: "PER_SEAT",
      });

      mockPrismaService.appSubscription.findMany.mockResolvedValue([
        {
          quantityPurchased: 10,
          quantityAssigned: 7,
          licenseType: {
            id: "lt-1",
            name: "Standard",
            slug: "standard",
          },
        },
        {
          quantityPurchased: 5,
          quantityAssigned: 3,
          licenseType: {
            id: "lt-2",
            name: "Pro",
            slug: "pro",
          },
        },
      ]);

      // Act
      const result = await service.checkMemberAccess("tenant-1", "app-1");

      // Assert
      expect(result).toEqual({
        allowed: true,
        mode: "PER_SEAT",
        message: "5 seats available",
        capacity: {
          available: 5,
          purchased: 15,
          assigned: 10,
        },
      });
    });

    it("should deny access when no seats available", async () => {
      // Arrange
      mockPrismaService.application.findUnique.mockResolvedValue({
        id: "app-1",
        name: "Test App",
        licensingMode: "PER_SEAT",
      });

      mockPrismaService.appSubscription.findMany.mockResolvedValue([
        {
          quantityPurchased: 10,
          quantityAssigned: 10,
          licenseType: {
            id: "lt-1",
            name: "Standard",
            slug: "standard",
          },
        },
      ]);

      // Act
      const result = await service.checkMemberAccess("tenant-1", "app-1");

      // Assert
      expect(result).toEqual({
        allowed: false,
        mode: "PER_SEAT",
        reason: "No seats available",
        capacity: {
          available: 0,
          purchased: 10,
          assigned: 10,
        },
      });
    });

    it("should deny access when no active subscriptions", async () => {
      // Arrange
      mockPrismaService.application.findUnique.mockResolvedValue({
        id: "app-1",
        name: "Test App",
        licensingMode: "PER_SEAT",
      });

      mockPrismaService.appSubscription.findMany.mockResolvedValue([]);

      // Act
      const result = await service.checkMemberAccess("tenant-1", "app-1");

      // Assert
      expect(result).toEqual({
        allowed: false,
        mode: "PER_SEAT",
        reason: "No active subscriptions for this application",
      });
    });

    it("should sum capacity across all license types", async () => {
      // Arrange
      mockPrismaService.application.findUnique.mockResolvedValue({
        id: "app-1",
        name: "Test App",
        licensingMode: "PER_SEAT",
      });

      mockPrismaService.appSubscription.findMany.mockResolvedValue([
        {
          quantityPurchased: 100,
          quantityAssigned: 95,
          licenseType: { id: "lt-1", name: "Enterprise", slug: "enterprise" },
        },
        {
          quantityPurchased: 50,
          quantityAssigned: 45,
          licenseType: { id: "lt-2", name: "Pro", slug: "pro" },
        },
        {
          quantityPurchased: 20,
          quantityAssigned: 15,
          licenseType: { id: "lt-3", name: "Standard", slug: "standard" },
        },
      ]);

      // Act
      const result = await service.checkMemberAccess("tenant-1", "app-1");

      // Assert
      expect(result).toEqual({
        allowed: true,
        mode: "PER_SEAT",
        message: "15 seats available",
        capacity: {
          available: 15,
          purchased: 170,
          assigned: 155,
        },
      });
    });

    it("should use correct message for singular seat", async () => {
      // Arrange
      mockPrismaService.application.findUnique.mockResolvedValue({
        id: "app-1",
        name: "Test App",
        licensingMode: "PER_SEAT",
      });

      mockPrismaService.appSubscription.findMany.mockResolvedValue([
        {
          quantityPurchased: 10,
          quantityAssigned: 9,
          licenseType: { id: "lt-1", name: "Standard", slug: "standard" },
        },
      ]);

      // Act
      const result = await service.checkMemberAccess("tenant-1", "app-1");

      // Assert
      expect(result.message).toBe("1 seat available");
    });
  });

  // ==========================================================================
  // ERROR CASES
  // ==========================================================================

  describe("Error Cases", () => {
    it("should handle unknown licensing mode", async () => {
      // Arrange
      mockPrismaService.application.findUnique.mockResolvedValue({
        id: "app-1",
        name: "Test App",
        licensingMode: "UNKNOWN_MODE",
      });

      // Act
      const result = await service.checkMemberAccess("tenant-1", "app-1");

      // Assert
      expect(result).toEqual({
        allowed: false,
        mode: "FREE",
        reason: "Unknown licensing mode: UNKNOWN_MODE",
      });
    });
  });
});
