import { Test, TestingModule } from "@nestjs/testing";
import { LicensePoolService } from "../services/license-pool.service";
import { PrismaService } from "../../prisma/prisma.service";

// Mock the services before importing them
jest.mock("../../webhooks/system-webhook.service", () => ({
  SystemWebhookService: jest.fn().mockImplementation(() => ({
    dispatch: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock("../services/license-capacity.service", () => ({
  LicenseCapacityService: jest.fn().mockImplementation(() => ({
    checkMemberAccess: jest.fn(),
    hasAvailableSeats: jest.fn(),
    getAvailableCapacity: jest.fn(),
    incrementAssignedCount: jest.fn(),
    decrementAssignedCount: jest.fn(),
    reconcileAssignedCount: jest.fn(),
  })),
}));

import { SystemWebhookService } from "../../webhooks/system-webhook.service";
import { LicenseCapacityService } from "../services/license-capacity.service";

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
  let capacityService: LicenseCapacityService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LicensePoolService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: SystemWebhookService,
          useValue: {
            dispatch: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: LicenseCapacityService,
          useValue: {
            checkMemberAccess: jest.fn(),
            hasAvailableSeats: jest.fn(),
            getAvailableCapacity: jest.fn(),
            incrementAssignedCount: jest.fn(),
            decrementAssignedCount: jest.fn(),
            reconcileAssignedCount: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<LicensePoolService>(LicensePoolService);
    capacityService = module.get<LicenseCapacityService>(LicenseCapacityService);

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
      jest.spyOn(capacityService, "checkMemberAccess").mockResolvedValue({
        allowed: true,
        mode: "FREE",
        message: "Unlimited members allowed",
        memberLimit: {
          maxMembers: null,
          currentMembers: 0,
          available: null,
        },
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
      expect(capacityService.checkMemberAccess).toHaveBeenCalledWith(
        "tenant-1",
        "app-1",
      );
    });

    it("should deny access when FREE mode subscription is missing", async () => {
      jest.spyOn(capacityService, "checkMemberAccess").mockResolvedValue({
        allowed: false,
        mode: "FREE",
        reason: "No active subscription for this application",
      });

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
      jest.spyOn(capacityService, "checkMemberAccess").mockResolvedValue({
        allowed: true,
        mode: "TENANT_WIDE",
        message: "3 member slots remaining",
        memberLimit: {
          maxMembers: 10,
          currentMembers: 7,
          available: 3,
        },
      });

      const result = await service.checkMemberAccess("tenant-1", "app-1");

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
      jest.spyOn(capacityService, "checkMemberAccess").mockResolvedValue({
        allowed: true,
        mode: "TENANT_WIDE",
        message: "Unlimited members allowed",
        memberLimit: {
          maxMembers: null,
          currentMembers: 0,
          available: null,
        },
      });

      const result = await service.checkMemberAccess("tenant-1", "app-1");

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
    });

    it("should deny access when member limit is reached", async () => {
      jest.spyOn(capacityService, "checkMemberAccess").mockResolvedValue({
        allowed: false,
        mode: "TENANT_WIDE",
        reason: "Member limit reached (10 members max)",
        memberLimit: {
          maxMembers: 10,
          currentMembers: 10,
          available: 0,
        },
      });

      const result = await service.checkMemberAccess("tenant-1", "app-1");

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
      jest.spyOn(capacityService, "checkMemberAccess").mockResolvedValue({
        allowed: false,
        mode: "TENANT_WIDE",
        reason: "No active subscription for this application",
      });

      const result = await service.checkMemberAccess("tenant-1", "app-1");

      expect(result).toEqual({
        allowed: false,
        mode: "TENANT_WIDE",
        reason: "No active subscription for this application",
      });
    });

    it("should delegate to capacityService", async () => {
      jest.spyOn(capacityService, "checkMemberAccess").mockResolvedValue({
        allowed: true,
        mode: "TENANT_WIDE",
        message: "3 member slots remaining",
        memberLimit: {
          maxMembers: 10,
          currentMembers: 7,
          available: 3,
        },
      });

      await service.checkMemberAccess("tenant-1", "app-1");

      expect(capacityService.checkMemberAccess).toHaveBeenCalledWith(
        "tenant-1",
        "app-1",
      );
    });
  });

  // ==========================================================================
  // PER_SEAT MODE TESTS
  // ==========================================================================

  describe("PER_SEAT Mode", () => {
    it("should allow access with available seats", async () => {
      jest.spyOn(capacityService, "checkMemberAccess").mockResolvedValue({
        allowed: true,
        mode: "PER_SEAT",
        message: "5 seats available",
        capacity: {
          available: 5,
          purchased: 15,
          assigned: 10,
        },
      });

      const result = await service.checkMemberAccess("tenant-1", "app-1");

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
      jest.spyOn(capacityService, "checkMemberAccess").mockResolvedValue({
        allowed: false,
        mode: "PER_SEAT",
        reason: "No seats available",
        capacity: {
          available: 0,
          purchased: 10,
          assigned: 10,
        },
      });

      const result = await service.checkMemberAccess("tenant-1", "app-1");

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
      jest.spyOn(capacityService, "checkMemberAccess").mockResolvedValue({
        allowed: false,
        mode: "PER_SEAT",
        reason: "No active subscriptions for this application",
      });

      const result = await service.checkMemberAccess("tenant-1", "app-1");

      expect(result).toEqual({
        allowed: false,
        mode: "PER_SEAT",
        reason: "No active subscriptions for this application",
      });
    });

    it("should sum capacity across all license types", async () => {
      jest.spyOn(capacityService, "checkMemberAccess").mockResolvedValue({
        allowed: true,
        mode: "PER_SEAT",
        message: "15 seats available",
        capacity: {
          available: 15,
          purchased: 170,
          assigned: 155,
        },
      });

      const result = await service.checkMemberAccess("tenant-1", "app-1");

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
      jest.spyOn(capacityService, "checkMemberAccess").mockResolvedValue({
        allowed: true,
        mode: "PER_SEAT",
        message: "1 seat available",
        capacity: {
          available: 1,
          purchased: 10,
          assigned: 9,
        },
      });

      const result = await service.checkMemberAccess("tenant-1", "app-1");

      expect(result.message).toBe("1 seat available");
    });
  });

  // ==========================================================================
  // ERROR CASES
  // ==========================================================================

  describe("Error Cases", () => {
    it("should handle unknown licensing mode", async () => {
      jest.spyOn(capacityService, "checkMemberAccess").mockResolvedValue({
        allowed: false,
        mode: "FREE",
        reason: "Unknown licensing mode: UNKNOWN_MODE",
      });

      const result = await service.checkMemberAccess("tenant-1", "app-1");

      expect(result).toEqual({
        allowed: false,
        mode: "FREE",
        reason: "Unknown licensing mode: UNKNOWN_MODE",
      });
    });
  });
})