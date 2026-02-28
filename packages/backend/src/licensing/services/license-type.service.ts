import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { LicenseTypeStatus } from "@prisma/client";
import {
  CreateLicenseTypeInput,
  UpdateLicenseTypeInput,
  LicenseTypeFeatures,
} from "../types";

/**
 * LicenseTypeService - The Catalog Manager 📚
 *
 * Manages the catalog of available license types for each application.
 * Think of this as the "menu" of what tenants can use.
 */
@Injectable()
export class LicenseTypeService {
  constructor(private readonly prisma: PrismaService) {}

  // ===========================================================================
  // CRUD OPERATIONS
  // ===========================================================================

  /**
   * Create a new license type for an application
   */
  async create(input: CreateLicenseTypeInput) {
    // Verify application exists
    const application = await this.prisma.application.findUnique({
      where: { id: input.applicationId },
      select: { id: true, name: true },
    });

    if (!application) {
      throw new NotFoundException(
        `Application ${input.applicationId} not found`,
      );
    }

    // Check for duplicate slug within application
    const existing = await this.prisma.licenseType.findUnique({
      where: {
        applicationId_slug: {
          applicationId: input.applicationId,
          slug: input.slug,
        },
      },
    });

    if (existing) {
      throw new ConflictException(
        `License type with slug '${input.slug}' already exists for this application`,
      );
    }

    return this.prisma.licenseType.create({
      data: {
        name: input.name,
        slug: input.slug,
        description: input.description,
        applicationId: input.applicationId,
        features: input.features || {},
        displayOrder: input.displayOrder ?? 0,
        status: input.status ?? LicenseTypeStatus.DRAFT,
        maxMembers: input.maxMembers,
      },
      include: {
        application: {
          select: { id: true, name: true, slug: true },
        },
      },
    });
  }

  /**
   * Update an existing license type
   */
  async update(licenseTypeId: string, input: UpdateLicenseTypeInput) {
    const existing = await this.prisma.licenseType.findUnique({
      where: { id: licenseTypeId },
    });

    if (!existing) {
      throw new NotFoundException(`License type ${licenseTypeId} not found`);
    }

    // If changing slug, check for conflicts
    if (input.slug && input.slug !== existing.slug) {
      const conflict = await this.prisma.licenseType.findUnique({
        where: {
          applicationId_slug: {
            applicationId: existing.applicationId,
            slug: input.slug,
          },
        },
      });

      if (conflict) {
        throw new ConflictException(
          `License type with slug '${input.slug}' already exists`,
        );
      }
    }

    return this.prisma.licenseType.update({
      where: { id: licenseTypeId },
      data: {
        name: input.name,
        slug: input.slug,
        description: input.description,
        features: input.features,
        displayOrder: input.displayOrder,
        status: input.status,
        maxMembers:
          input.maxMembers !== undefined
            ? input.maxMembers
            : existing.maxMembers,
      },
      include: {
        application: {
          select: { id: true, name: true, slug: true },
        },
      },
    });
  }

  /**
   * Get a license type by ID
   */
  async findById(licenseTypeId: string) {
    const licenseType = await this.prisma.licenseType.findUnique({
      where: { id: licenseTypeId },
      include: {
        application: {
          select: { id: true, name: true, slug: true },
        },
      },
    });

    if (!licenseType) {
      throw new NotFoundException(`License type ${licenseTypeId} not found`);
    }

    return licenseType;
  }

  /**
   * Get all license types for an application
   */
  async findByApplication(applicationId: string, includeHidden = false) {
    const statuses = includeHidden
      ? [
          LicenseTypeStatus.ACTIVE,
          LicenseTypeStatus.HIDDEN,
          LicenseTypeStatus.ARCHIVED,
        ]
      : [LicenseTypeStatus.ACTIVE];

    return this.prisma.licenseType.findMany({
      where: {
        applicationId,
        status: { in: statuses },
      },
      orderBy: { displayOrder: "asc" },
      include: {
        application: {
          select: { id: true, name: true, slug: true },
        },
      },
    });
  }

  /**
   * Get all license types in the instance (all apps)
   */
  async findAll(includeHidden = false) {
    const statuses = includeHidden
      ? [
          LicenseTypeStatus.ACTIVE,
          LicenseTypeStatus.HIDDEN,
          LicenseTypeStatus.ARCHIVED,
          LicenseTypeStatus.DRAFT,
        ]
      : [LicenseTypeStatus.ACTIVE];

    return this.prisma.licenseType.findMany({
      where: {
        status: { in: statuses },
      },
      orderBy: [{ applicationId: "asc" }, { displayOrder: "asc" }],
      include: {
        application: {
          select: { id: true, name: true, slug: true },
        },
      },
    });
  }

  /**
   * Archive a license type (no new purchases, existing subscriptions continue)
   */
  async archive(licenseTypeId: string) {
    const licenseType = await this.findById(licenseTypeId);

    if (licenseType.status === LicenseTypeStatus.ARCHIVED) {
      return licenseType; // Already archived
    }

    return this.prisma.licenseType.update({
      where: { id: licenseTypeId },
      data: { status: LicenseTypeStatus.ARCHIVED },
    });
  }

  /**
   * Delete a license type (only if no active subscriptions)
   */
  async delete(licenseTypeId: string) {
    await this.findById(licenseTypeId);

    // Check for active subscriptions
    const activeSubscriptions = await this.prisma.appSubscription.count({
      where: {
        licenseTypeId,
        status: { in: ["ACTIVE", "TRIALING", "PAST_DUE"] },
      },
    });

    if (activeSubscriptions > 0) {
      throw new BadRequestException(
        `Cannot delete license type with ${activeSubscriptions} active subscriptions. Archive it instead.`,
      );
    }

    return this.prisma.licenseType.delete({
      where: { id: licenseTypeId },
    });
  }

  // ===========================================================================
  // FEATURE HELPERS
  // ===========================================================================

  /**
   * Get features for a license type (type-safe)
   */
  getFeatures(licenseType: { features: unknown }): LicenseTypeFeatures {
    return (licenseType.features as LicenseTypeFeatures) || {};
  }

  /**
   * Check if a license type has a specific feature enabled
   */
  hasFeature(licenseType: { features: unknown }, featureKey: string): boolean {
    const features = this.getFeatures(licenseType);
    return features[featureKey] === true;
  }

  /**
   * Compare two license types to determine upgrade/downgrade
   * Returns: 1 if typeA > typeB, -1 if typeA < typeB, 0 if equal
   */
  compareLicenseTypes(
    typeA: { displayOrder: number },
    typeB: { displayOrder: number },
  ): number {
    if (typeA.displayOrder > typeB.displayOrder) return 1;
    if (typeA.displayOrder < typeB.displayOrder) return -1;
    return 0;
  }
}
