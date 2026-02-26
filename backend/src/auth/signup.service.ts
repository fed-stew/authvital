import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { InstanceService } from "../instance/instance.service";
import { LicenseProvisioningService } from "../licensing/services/license-provisioning.service";
import { SyncEventService, SYNC_EVENT_TYPES } from "../sync";
import { AccessMode } from "@prisma/client";
import * as bcrypt from "bcrypt";
import * as crypto from "crypto";
import { isGenericDomain, extractDomain } from "./constants/generic-domains";

export interface SignUpDto {
  email: string;
  password: string;
  givenName?: string;
  familyName?: string;
  phone?: string;
  tenantName?: string; // Custom tenant name (for corporate emails)
  slug?: string; // Custom org slug
  selectedLicenseTypeId?: string; // User's selected license type for auto-provisioning (OPTIONAL - auto-provisioned if not provided)
  applicationId?: string; // The application context for signup (optional - will grant FREE apps if not provided)
}

export interface AnonymousSignUpDto {
  deviceId?: string; // Optional device identifier for tracking
}

export interface UpgradeAccountDto {
  userId: string;
  email: string;
  password: string;
  givenName?: string;
  familyName?: string;
  phone?: string;
}

export interface SignUpResult {
  user: {
    id: string;
    email: string | null;
    givenName: string | null;
    familyName: string | null;
    isAnonymous: boolean;
  };
  tenant: {
    id: string;
    name: string;
    slug: string;
  } | null;
  membership: {
    id: string;
  } | null;
  domain: {
    id: string;
    domainName: string;
    isVerified: boolean;
    verificationToken: string;
  } | null;
  joinedExistingTenant: boolean;
}

export interface AnonymousSignUpResult {
  user: {
    id: string;
    isAnonymous: boolean;
  };
  anonymousToken: string;
}

@Injectable()
export class SignUpService {
  private readonly SALT_ROUNDS = 12;
  private readonly logger = new Logger(SignUpService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly instanceService: InstanceService,
    private readonly licenseProvisioningService: LicenseProvisioningService,
    private readonly syncEventService: SyncEventService,
  ) {}

  /**
   * Create an anonymous account
   * Use case: Mobile games where users can play immediately and create account later
   */
  async signUpAnonymous(
    _dto: AnonymousSignUpDto,
  ): Promise<AnonymousSignUpResult> {
    const config = await this.instanceService.getSignupConfig();

    if (!config.allowAnonymousSignUp) {
      throw new ForbiddenException("Anonymous sign-up is not allowed");
    }

    // Generate anonymous token (used for authentication)
    const anonymousToken = this.generateAnonymousToken();
    const tokenHash = await bcrypt.hash(anonymousToken, this.SALT_ROUNDS);

    const user = await this.prisma.user.create({
      data: {
        isAnonymous: true,
        isMachine: false,
        passwordHash: tokenHash,
        // Note: deviceId tracking removed - add dedicated field if needed
      },
    });

    return {
      user: {
        id: user.id,
        isAnonymous: true,
      },
      anonymousToken: `anon_${user.id}_${anonymousToken}`,
    };
  }

  /**
   * Upgrade an anonymous account to a full account
   */
  async upgradeAnonymousAccount(dto: UpgradeAccountDto): Promise<SignUpResult> {
    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    if (!user.isAnonymous) {
      throw new BadRequestException("User is not an anonymous account");
    }

    const config = await this.instanceService.getSignupConfig();

    // Validate email domain
    const emailDomain = extractDomain(dto.email);
    const isGeneric = isGenericDomain(emailDomain);

    if (isGeneric && !config.allowGenericDomains) {
      throw new BadRequestException(
        "Generic email domains (Gmail, Yahoo, etc.) are not allowed. Please use a corporate email.",
      );
    }

    // Check if email already exists (globally unique now)
    const existingUser = await this.prisma.user.findFirst({
      where: {
        email: dto.email.toLowerCase(),
        NOT: { id: dto.userId },
      },
    });

    if (existingUser) {
      throw new ConflictException("A user with this email already exists");
    }

    // Validate required fields
    this.validateRequiredFields(dto, config.requiredUserFields);

    // Check for verified domain
    const verifiedDomain = await this.prisma.domain.findFirst({
      where: {
        domainName: emailDomain,
        isVerified: true,
      },
      include: { tenant: true },
    });

    const passwordHash = await bcrypt.hash(dto.password, this.SALT_ROUNDS);

    return this.prisma.$transaction(async (tx) => {
      // Update user with new info
      const updatedUser = await tx.user.update({
        where: { id: dto.userId },
        data: {
          email: dto.email.toLowerCase(),
          givenName: dto.givenName?.trim() || null,
          familyName: dto.familyName?.trim() || null,
          phone: dto.phone?.trim() || null,
          passwordHash,
          isAnonymous: false,
        },
      });

      // If verified domain exists, join that tenant
      if (verifiedDomain) {
        const membership = await tx.membership.create({
          data: {
            userId: updatedUser.id,
            tenantId: verifiedDomain.tenant.id,
            status: "ACTIVE",
            joinedAt: new Date(),
          },
        });

        // Assign member tenant role when joining existing tenant
        const memberRole = await tx.tenantRole.findUnique({
          where: { slug: "member" },
        });
        if (memberRole) {
          await tx.membershipTenantRole.create({
            data: {
              membershipId: membership.id,
              tenantRoleId: memberRole.id,
            },
          });
        }

        return {
          user: {
            id: updatedUser.id,
            email: updatedUser.email,
            givenName: updatedUser.givenName,
            familyName: updatedUser.familyName,
            isAnonymous: false,
          },
          tenant: {
            id: verifiedDomain.tenant.id,
            name: verifiedDomain.tenant.name,
            slug: verifiedDomain.tenant.slug,
          },
          membership: { id: membership.id },
          domain: null,
          joinedExistingTenant: true,
        };
      }

      // Create tenant if autoCreateTenant is enabled
      if (!config.autoCreateTenant) {
        return {
          user: {
            id: updatedUser.id,
            email: updatedUser.email,
            givenName: updatedUser.givenName,
            familyName: updatedUser.familyName,
            isAnonymous: false,
          },
          tenant: null,
          membership: null,
          domain: null,
          joinedExistingTenant: false,
        };
      }

      // Create tenant
      const tenantName = this.generateTenantName(dto, isGeneric);
      const tenantSlug = await this.generateUniqueSlug(tx, tenantName);

      const tenant = await tx.tenant.create({
        data: {
          name: tenantName,
          slug: tenantSlug,
          settings: {},
        },
      });

      const membership = await tx.membership.create({
        data: {
          userId: updatedUser.id,
          tenantId: tenant.id,
          status: "ACTIVE",
          joinedAt: new Date(),
        },
      });

      // Assign owner tenant role when creating new tenant
      const ownerRole = await tx.tenantRole.findUnique({
        where: { slug: "owner" },
      });
      if (ownerRole) {
        await tx.membershipTenantRole.create({
          data: {
            membershipId: membership.id,
            tenantRoleId: ownerRole.id,
          },
        });
      }

      // Create domain for corporate emails
      let domain = null;
      if (!isGeneric) {
        const verificationToken = this.generateVerificationToken();
        domain = await tx.domain.create({
          data: {
            domainName: emailDomain,
            verificationToken,
            isVerified: false,
            tenantId: tenant.id,
          },
        });
      }

      return {
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          givenName: updatedUser.givenName,
          familyName: updatedUser.familyName,
          isAnonymous: false,
        },
        tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
        membership: { id: membership.id },
        domain: domain
          ? {
              id: domain.id,
              domainName: domain.domainName,
              isVerified: false,
              verificationToken: domain.verificationToken,
            }
          : null,
        joinedExistingTenant: false,
      };
    });
  }

  /**
   * Sign up a new user with automatic tenant creation
   */
  async signUp(dto: SignUpDto): Promise<SignUpResult> {
    // 1. Get instance config and validate sign-up is allowed
    const config = await this.instanceService.getSignupConfig();

    if (!config.allowSignUp) {
      throw new ForbiddenException("Sign-up is not allowed");
    }

    // 2. Validate email domain
    const emailDomain = extractDomain(dto.email);
    const isGeneric = isGenericDomain(emailDomain);

    if (isGeneric && !config.allowGenericDomains) {
      throw new BadRequestException(
        "Generic email domains (Gmail, Yahoo, etc.) are not allowed. Please use a corporate email.",
      );
    }

    // 3. Validate required fields
    this.validateRequiredFields(dto, config.requiredUserFields);

    // 4. Check if email already exists (globally unique)
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (existingUser) {
      throw new ConflictException("A user with this email already exists");
    }

    // 5. Check for verified corporate domain
    const verifiedDomain = await this.prisma.domain.findFirst({
      where: {
        domainName: emailDomain,
        isVerified: true,
      },
      include: {
        tenant: true,
      },
    });

    // Hash password
    const passwordHash = await bcrypt.hash(dto.password, this.SALT_ROUNDS);

    // Use transaction for atomicity
    const result = await this.prisma.$transaction(async (tx) => {
      // Create the user
      const user = await tx.user.create({
        data: {
          email: dto.email.toLowerCase(),
          givenName: dto.givenName?.trim() || null,
          familyName: dto.familyName?.trim() || null,
          phone: dto.phone?.trim() || null,
          passwordHash,
          isMachine: false,
          isAnonymous: false,
        },
      });

      // ==========================================================================
      // SINGLE-TENANT MODE: Auto-join the default tenant
      // ==========================================================================
      if (config.singleTenantMode && config.defaultTenantId) {
        const defaultTenant = await tx.tenant.findUnique({
          where: { id: config.defaultTenantId },
        });

        if (!defaultTenant) {
          this.logger.error(
            `Single-tenant mode enabled but defaultTenantId ${config.defaultTenantId} not found`,
          );
          throw new BadRequestException(
            "System configuration error. Please contact support.",
          );
        }

        const membership = await tx.membership.create({
          data: {
            userId: user.id,
            tenantId: defaultTenant.id,
            status: "ACTIVE",
            joinedAt: new Date(),
          },
        });

        // Assign member tenant role
        const memberRole = await tx.tenantRole.findUnique({
          where: { slug: "member" },
        });
        if (memberRole) {
          await tx.membershipTenantRole.create({
            data: {
              membershipId: membership.id,
              tenantRoleId: memberRole.id,
            },
          });
        }

        this.logger.log(
          `Single-tenant mode: User ${user.id} auto-joined tenant ${defaultTenant.slug}`,
        );

        return {
          user: {
            id: user.id,
            email: user.email,
            givenName: user.givenName,
            familyName: user.familyName,
            isAnonymous: false,
          },
          tenant: {
            id: defaultTenant.id,
            name: defaultTenant.name,
            slug: defaultTenant.slug,
          },
          membership: {
            id: membership.id,
          },
          domain: null,
          joinedExistingTenant: true,
        };
      }

      // If verified domain exists, join that tenant
      if (verifiedDomain) {
        const membership = await tx.membership.create({
          data: {
            userId: user.id,
            tenantId: verifiedDomain.tenant.id,
            status: "ACTIVE",
            joinedAt: new Date(),
          },
        });

        // Assign member tenant role when joining existing tenant
        const memberRole = await tx.tenantRole.findUnique({
          where: { slug: "member" },
        });
        if (memberRole) {
          await tx.membershipTenantRole.create({
            data: {
              membershipId: membership.id,
              tenantRoleId: memberRole.id,
            },
          });
        }

        return {
          user: {
            id: user.id,
            email: user.email,
            givenName: user.givenName,
            familyName: user.familyName,
            isAnonymous: false,
          },
          tenant: {
            id: verifiedDomain.tenant.id,
            name: verifiedDomain.tenant.name,
            slug: verifiedDomain.tenant.slug,
          },
          membership: {
            id: membership.id,
          },
          domain: null,
          joinedExistingTenant: true,
        };
      }

      // No verified domain - create new tenant if autoCreateTenant is enabled
      if (!config.autoCreateTenant) {
        return {
          user: {
            id: user.id,
            email: user.email,
            givenName: user.givenName,
            familyName: user.familyName,
            isAnonymous: false,
          },
          tenant: null,
          membership: null,
          domain: null,
          joinedExistingTenant: false,
        };
      }

      // Generate tenant name and slug
      const tenantName =
        dto.tenantName || this.generateTenantName(dto, isGeneric);
      const tenantSlug =
        dto.slug || (await this.generateUniqueSlug(tx, tenantName));

      // Create tenant
      const tenant = await tx.tenant.create({
        data: {
          name: tenantName,
          slug: tenantSlug,
          settings: {},
        },
      });

      // Create membership as owner
      const membership = await tx.membership.create({
        data: {
          userId: user.id,
          tenantId: tenant.id,
          status: "ACTIVE",
          joinedAt: new Date(),
        },
      });

      // Assign owner tenant role when creating new tenant
      const ownerRole = await tx.tenantRole.findUnique({
        where: { slug: "owner" },
      });
      if (ownerRole) {
        await tx.membershipTenantRole.create({
          data: {
            membershipId: membership.id,
            tenantRoleId: ownerRole.id,
          },
        });
      }

      // For corporate domains, create unverified domain record
      let domain = null;
      if (!isGeneric) {
        const verificationToken = this.generateVerificationToken();
        domain = await tx.domain.create({
          data: {
            domainName: emailDomain,
            verificationToken,
            isVerified: false,
            tenantId: tenant.id,
          },
        });
      }

      return {
        user: {
          id: user.id,
          email: user.email,
          givenName: user.givenName,
          familyName: user.familyName,
          isAnonymous: false,
        },
        tenant: {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
        },
        membership: {
          id: membership.id,
        },
        domain: domain
          ? {
              id: domain.id,
              domainName: domain.domainName,
              isVerified: domain.isVerified,
              verificationToken: domain.verificationToken,
            }
          : null,
        joinedExistingTenant: false,
      };
    });

    // Emit sync events (after transaction commits)
    this.emitSignupEvents(result, dto.applicationId).catch((err) => {
      this.logger.warn(`Failed to emit signup events: ${err.message}`);
    });

    // Auto-provision licenses for the new tenant (after transaction commits)
    if (result.tenant && result.membership) {
      // Run async - don't block signup completion
      this.provisionLicensesForNewTenant(
        result.tenant.id,
        result.user.id,
        dto.applicationId,
        dto.selectedLicenseTypeId,
      ).catch((err) => {
        this.logger.error(
          `License provisioning failed for tenant ${result.tenant.id} (user: ${result.user.id})`,
          err instanceof Error ? err.stack : String(err),
        );
      });
    }

    return result;
  }

  /**
   * Provision licenses for a new tenant
   * - If applicationId is provided: provision that app (and any FREE apps)
   * - If no applicationId: provision ALL FREE apps
   */
  private async provisionLicensesForNewTenant(
    tenantId: string,
    userId: string,
    applicationId?: string,
    selectedLicenseTypeId?: string,
  ): Promise<void> {
    // Get all FREE apps that should be auto-provisioned
    // Only include apps where accessMode allows auto-provisioning
    const freeApps = await this.prisma.application.findMany({
      where: {
        isActive: true,
        licensingMode: "FREE",
        defaultLicenseTypeId: { not: null },
        // Only auto-provision if accessMode allows it
        accessMode: { in: [AccessMode.AUTOMATIC, AccessMode.MANUAL_AUTO_GRANT] },
      },
      select: {
        id: true,
        name: true,
        defaultLicenseTypeId: true,
      },
    });

    this.logger.log(
      `Found ${freeApps.length} FREE apps to auto-provision for tenant ${tenantId}`,
    );

    // Provision all FREE apps
    for (const app of freeApps) {
      // Skip if this is the main app and user selected a specific license type
      if (app.id === applicationId && selectedLicenseTypeId) {
        continue; // Will be handled below with the selected license type
      }

      this.logger.log(
        `Auto-provisioning FREE app "${app.name}" for tenant ${tenantId}`,
      );

      try {
        await this.licenseProvisioningService.provisionForNewTenant(
          tenantId,
          userId,
          app.defaultLicenseTypeId!,
          app.id,
        );
      } catch (err) {
        this.logger.error(
          `Failed to provision FREE app "${app.name}" for tenant ${tenantId}`,
          err instanceof Error ? err.stack : String(err),
        );
      }
    }

    // If a specific application was provided, handle it separately
    if (applicationId) {
      let licenseTypeId = selectedLicenseTypeId;

      // If no license type was explicitly selected, check app config
      if (!licenseTypeId) {
        const app = await this.prisma.application.findUnique({
          where: { id: applicationId },
          select: {
            id: true,
            name: true,
            licensingMode: true,
            defaultLicenseTypeId: true,
            autoProvisionOnSignup: true,
            accessMode: true,
          },
        });

        // Skip if already provisioned as FREE app
        const alreadyProvisioned = freeApps.some(
          (fa) => fa.id === applicationId,
        );
        if (alreadyProvisioned) {
          this.logger.log(
            `App ${applicationId} already provisioned as FREE app`,
          );
          return;
        }

        // Check if accessMode allows auto-provisioning
        const accessModeAllowsAutoProvision = 
          app?.accessMode === AccessMode.AUTOMATIC || 
          app?.accessMode === AccessMode.MANUAL_AUTO_GRANT;

        if (app?.autoProvisionOnSignup && app.defaultLicenseTypeId && accessModeAllowsAutoProvision) {
          licenseTypeId = app.defaultLicenseTypeId;
          this.logger.log(
            `Auto-provisioning "${app.name}" (autoProvisionOnSignup=true, accessMode=${app.accessMode}) for tenant ${tenantId}`,
          );
        } else if (app?.autoProvisionOnSignup && !accessModeAllowsAutoProvision) {
          this.logger.log(
            `Skipping auto-provision for "${app?.name}": accessMode=${app?.accessMode} does not allow auto-provisioning`,
          );
        }
      }

      if (licenseTypeId) {
        await this.licenseProvisioningService.provisionForNewTenant(
          tenantId,
          userId,
          licenseTypeId,
          applicationId,
        );
      }
    }
  }

  /**
   * Validate required fields based on instance configuration
   */
  private validateRequiredFields(
    dto: SignUpDto | UpgradeAccountDto,
    requiredFields: string[],
  ) {
    const errors: string[] = [];

    if (!dto.email || !dto.email.includes("@")) {
      errors.push("Valid email is required");
    }

    if (!dto.password || dto.password.length < 8) {
      errors.push("Password must be at least 8 characters");
    }

    for (const field of requiredFields) {
      if (field === "email") continue;
      const value = dto[field as keyof typeof dto];
      if (!value || (typeof value === "string" && !value.trim())) {
        errors.push(`${field} is required`);
      }
    }

    if (errors.length > 0) {
      throw new BadRequestException(errors.join(", "));
    }
  }

  /**
   * Generate tenant name based on user info and domain type
   */
  private generateTenantName(
    dto: SignUpDto | UpgradeAccountDto,
    isGeneric: boolean,
  ): string {
    if (isGeneric) {
      if (dto.givenName) {
        return dto.familyName
          ? `${dto.givenName} ${dto.familyName}'s Workspace`
          : `${dto.givenName}'s Workspace`;
      }
      const emailPrefix = dto.email.split("@")[0];
      return `${emailPrefix}'s Workspace`;
    }

    const domain = extractDomain(dto.email);
    const domainName = domain.split(".")[0];
    return domainName.charAt(0).toUpperCase() + domainName.slice(1);
  }

  /**
   * Generate unique slug for tenant (now globally unique)
   */
  private async generateUniqueSlug(tx: any, baseName: string): Promise<string> {
    const baseSlug = baseName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .substring(0, 40);

    let slug = baseSlug;
    let counter = 1;

    while (counter <= 100) {
      const existing = await tx.tenant.findUnique({
        where: { slug },
      });

      if (!existing) {
        return slug;
      }

      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    slug = `${baseSlug}-${crypto.randomBytes(4).toString("hex")}`;
    return slug;
  }

  private generateVerificationToken(): string {
    return `idp-verify-${crypto.randomBytes(16).toString("hex")}`;
  }

  private generateAnonymousToken(): string {
    return crypto.randomBytes(32).toString("base64url");
  }

  /**
   * Emit sync events for user signup
   */
  private async emitSignupEvents(
    result: SignUpResult,
    applicationId?: string,
  ): Promise<void> {
    // If no tenant, we can't emit events (no application context)
    if (!result.tenant || !result.membership) {
      this.logger.debug(
        "No tenant/membership - skipping signup event emission",
      );
      return;
    }

    // Get application IDs to emit to
    const appIds = applicationId
      ? [applicationId]
      : await this.getApplicationIdsForTenant(result.tenant.id);

    if (appIds.length === 0) {
      this.logger.debug(
        "No applications found for tenant - skipping signup event emission",
      );
      return;
    }

    // Get tenant roles for member.joined event
    const memberTenantRoles = await this.prisma.membershipTenantRole.findMany({
      where: { membershipId: result.membership.id },
      include: { tenantRole: { select: { slug: true } } },
    });
    const tenantRoleSlugs = memberTenantRoles.map((mtr) => mtr.tenantRole.slug);

    for (const appId of appIds) {
      // Emit subject.created (user signup)
      this.syncEventService
        .emit(SYNC_EVENT_TYPES.SUBJECT_CREATED, result.tenant.id, appId, {
          sub: result.user.id,
          email: result.user.email,
          given_name: result.user.givenName || undefined,
          family_name: result.user.familyName || undefined,
          subject_type: "user",
        })
        .catch((err) =>
          this.logger.warn(`Failed to emit subject.created: ${err.message}`),
        );

      // Emit member.joined
      this.syncEventService
        .emit(SYNC_EVENT_TYPES.MEMBER_JOINED, result.tenant.id, appId, {
          membership_id: result.membership!.id,
          sub: result.user.id,
          email: result.user.email,
          tenant_roles: tenantRoleSlugs,
          given_name: result.user.givenName || undefined,
          family_name: result.user.familyName || undefined,
        })
        .catch((err) =>
          this.logger.warn(`Failed to emit member.joined: ${err.message}`),
        );
    }
  }

  /**
   * Get all application IDs that a tenant has access to
   */
  private async getApplicationIdsForTenant(
    tenantId: string,
  ): Promise<string[]> {
    const subscriptions = await this.prisma.appSubscription.findMany({
      where: { tenantId, status: "ACTIVE" },
      select: { applicationId: true },
    });
    return subscriptions.map((s) => s.applicationId);
  }
}
