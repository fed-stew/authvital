import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InstanceService } from '../instance/instance.service';
import { SignUpLicenseService } from './signup-license.service';
import { SignUpAnonymousService } from './signup-anonymous.service';
import { SyncEventService, SYNC_EVENT_TYPES } from '../sync';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { isGenericDomain, extractDomain } from './constants/generic-domains';
import { SignUpDto, SignUpResult, AnonymousSignUpDto, AnonymousSignUpResult, UpgradeAccountDto } from './signup.types';

// Re-export types for backward compatibility
export { SignUpDto, SignUpResult, AnonymousSignUpDto, AnonymousSignUpResult, UpgradeAccountDto } from './signup.types';

@Injectable()
export class SignUpService {
  private readonly SALT_ROUNDS = 12;
  private readonly logger = new Logger(SignUpService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly instanceService: InstanceService,
    private readonly licenseService: SignUpLicenseService,
    private readonly anonymousService: SignUpAnonymousService,
    private readonly syncEventService: SyncEventService,
  ) {}

  /**
   * Create an anonymous account
   */
  async signUpAnonymous(dto: AnonymousSignUpDto): Promise<AnonymousSignUpResult> {
    return this.anonymousService.signUpAnonymous(dto);
  }

  /**
   * Upgrade an anonymous account to a full account
   */
  async upgradeAnonymousAccount(dto: UpgradeAccountDto): Promise<SignUpResult> {
    return this.anonymousService.upgradeAnonymousAccount(dto);
  }

  /**
   * Sign up a new user with automatic tenant creation
   */
  async signUp(dto: SignUpDto): Promise<SignUpResult> {
    const config = await this.instanceService.getSignupConfig();

    if (!config.allowSignUp) {
      throw new ForbiddenException('Sign-up is not allowed');
    }

    const emailDomain = extractDomain(dto.email);
    const isGeneric = isGenericDomain(emailDomain);

    if (isGeneric && !config.allowGenericDomains) {
      throw new BadRequestException(
        'Generic email domains (Gmail, Yahoo, etc.) are not allowed. Please use a corporate email.',
      );
    }

    this.validateRequiredFields(dto, config.requiredUserFields);

    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (existingUser) {
      throw new ConflictException('A user with this email already exists');
    }

    const verifiedDomain = await this.prisma.domain.findFirst({
      where: { domainName: emailDomain, isVerified: true },
      include: { tenant: true },
    });

    const passwordHash = await bcrypt.hash(dto.password, this.SALT_ROUNDS);

    const result = await this.prisma.$transaction(async (tx) => {
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

      // Single-tenant mode: auto-join default tenant
      if (config.singleTenantMode && config.defaultTenantId) {
        return this.handleSingleTenantSignup(tx, user, config.defaultTenantId);
      }

      // Verified domain exists: join that tenant
      if (verifiedDomain) {
        return this.handleVerifiedDomainSignup(tx, user, verifiedDomain.tenant);
      }

      // No verified domain: create new tenant if enabled
      if (!config.autoCreateTenant) {
        return this.buildUserOnlyResult(user);
      }

      return this.handleNewTenantSignup(tx, user, dto, isGeneric, emailDomain);
    });

    // Post-transaction: emit events and provision licenses
    this.emitSignupEvents(result, dto.applicationId).catch((err) => {
      this.logger.warn(`Failed to emit signup events: ${err.message}`);
    });

    if (result.tenant && result.membership) {
      const tenantId = result.tenant.id;
      this.licenseService
        .provisionLicensesForNewTenant(
          tenantId,
          result.user.id,
          dto.applicationId,
          dto.selectedLicenseTypeId,
        )
        .catch((err) => {
          this.logger.error(
            `License provisioning failed for tenant ${tenantId}`,
            err instanceof Error ? err.stack : String(err),
          );
        });
    }

    return result;
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  private async handleSingleTenantSignup(
    tx: any,
    user: { id: string; email: string | null; givenName: string | null; familyName: string | null },
    defaultTenantId: string,
  ): Promise<SignUpResult> {
    const defaultTenant = await tx.tenant.findUnique({
      where: { id: defaultTenantId },
    });

    if (!defaultTenant) {
      this.logger.error(`Single-tenant mode enabled but defaultTenantId ${defaultTenantId} not found`);
      throw new BadRequestException('System configuration error. Please contact support.');
    }

    const membership = await tx.membership.create({
      data: {
        userId: user.id,
        tenantId: defaultTenant.id,
        status: 'ACTIVE',
        joinedAt: new Date(),
      },
    });

    await this.assignTenantRole(tx, membership.id, 'member');

    this.logger.log(`Single-tenant mode: User ${user.id} auto-joined tenant ${defaultTenant.slug}`);

    return {
      user: { id: user.id, email: user.email, givenName: user.givenName, familyName: user.familyName, isAnonymous: false },
      tenant: { id: defaultTenant.id, name: defaultTenant.name, slug: defaultTenant.slug },
      membership: { id: membership.id },
      domain: null,
      joinedExistingTenant: true,
    };
  }

  private async handleVerifiedDomainSignup(
    tx: any,
    user: { id: string; email: string | null; givenName: string | null; familyName: string | null },
    tenant: { id: string; name: string; slug: string },
  ): Promise<SignUpResult> {
    const membership = await tx.membership.create({
      data: {
        userId: user.id,
        tenantId: tenant.id,
        status: 'ACTIVE',
        joinedAt: new Date(),
      },
    });

    await this.assignTenantRole(tx, membership.id, 'member');

    return {
      user: { id: user.id, email: user.email, givenName: user.givenName, familyName: user.familyName, isAnonymous: false },
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
      membership: { id: membership.id },
      domain: null,
      joinedExistingTenant: true,
    };
  }

  private async handleNewTenantSignup(
    tx: any,
    user: { id: string; email: string | null; givenName: string | null; familyName: string | null },
    dto: SignUpDto,
    isGeneric: boolean,
    emailDomain: string,
  ): Promise<SignUpResult> {
    const tenantName = dto.tenantName || this.generateTenantName(dto, isGeneric);
    const tenantSlug = dto.slug || (await this.generateUniqueSlug(tx, tenantName));

    const tenant = await tx.tenant.create({
      data: { name: tenantName, slug: tenantSlug, settings: {} },
    });

    const membership = await tx.membership.create({
      data: {
        userId: user.id,
        tenantId: tenant.id,
        status: 'ACTIVE',
        joinedAt: new Date(),
      },
    });

    await this.assignTenantRole(tx, membership.id, 'owner');

    // Create domain for corporate emails
    let domain = null;
    if (!isGeneric) {
      const verificationToken = `idp-verify-${crypto.randomBytes(16).toString('hex')}`;
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
      user: { id: user.id, email: user.email, givenName: user.givenName, familyName: user.familyName, isAnonymous: false },
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
      membership: { id: membership.id },
      domain: domain
        ? { id: domain.id, domainName: domain.domainName, isVerified: domain.isVerified, verificationToken: domain.verificationToken }
        : null,
      joinedExistingTenant: false,
    };
  }

  private buildUserOnlyResult(user: {
    id: string;
    email: string | null;
    givenName: string | null;
    familyName: string | null;
  }): SignUpResult {
    return {
      user: { id: user.id, email: user.email, givenName: user.givenName, familyName: user.familyName, isAnonymous: false },
      tenant: null,
      membership: null,
      domain: null,
      joinedExistingTenant: false,
    };
  }

  private async assignTenantRole(tx: any, membershipId: string, roleSlug: string): Promise<void> {
    const role = await tx.tenantRole.findUnique({ where: { slug: roleSlug } });
    if (role) {
      await tx.membershipTenantRole.create({
        data: { membershipId, tenantRoleId: role.id },
      });
    }
  }

  private validateRequiredFields(dto: SignUpDto, requiredFields: string[]) {
    const errors: string[] = [];

    if (!dto.email || !dto.email.includes('@')) {
      errors.push('Valid email is required');
    }

    if (!dto.password || dto.password.length < 8) {
      errors.push('Password must be at least 8 characters');
    }

    for (const field of requiredFields) {
      if (field === 'email') continue;
      const value = dto[field as keyof typeof dto];
      if (!value || (typeof value === 'string' && !value.trim())) {
        errors.push(`${field} is required`);
      }
    }

    if (errors.length > 0) {
      throw new BadRequestException(errors.join(', '));
    }
  }

  private generateTenantName(dto: SignUpDto, isGeneric: boolean): string {
    if (isGeneric) {
      if (dto.givenName) {
        return dto.familyName
          ? `${dto.givenName} ${dto.familyName}'s Workspace`
          : `${dto.givenName}'s Workspace`;
      }
      const emailPrefix = dto.email.split('@')[0];
      return `${emailPrefix}'s Workspace`;
    }

    const domain = extractDomain(dto.email);
    const domainName = domain.split('.')[0];
    return domainName.charAt(0).toUpperCase() + domainName.slice(1);
  }

  private async generateUniqueSlug(tx: any, baseName: string): Promise<string> {
    const baseSlug = baseName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 40);

    let slug = baseSlug;
    let counter = 1;

    while (counter <= 100) {
      const existing = await tx.tenant.findUnique({ where: { slug } });
      if (!existing) return slug;
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    return `${baseSlug}-${crypto.randomBytes(4).toString('hex')}`;
  }

  private async emitSignupEvents(result: SignUpResult, applicationId?: string): Promise<void> {
    if (!result.tenant || !result.membership) {
      this.logger.debug('No tenant/membership - skipping signup event emission');
      return;
    }

    const appIds = applicationId
      ? [applicationId]
      : await this.getApplicationIdsForTenant(result.tenant.id);

    if (appIds.length === 0) {
      this.logger.debug('No applications found for tenant - skipping signup event emission');
      return;
    }

    const memberTenantRoles = await this.prisma.membershipTenantRole.findMany({
      where: { membershipId: result.membership.id },
      include: { tenantRole: { select: { slug: true } } },
    });
    const tenantRoleSlugs = memberTenantRoles.map((mtr) => mtr.tenantRole.slug);

    for (const appId of appIds) {
      this.syncEventService
        .emit(SYNC_EVENT_TYPES.SUBJECT_CREATED, result.tenant.id, appId, {
          sub: result.user.id,
          email: result.user.email,
          given_name: result.user.givenName || undefined,
          family_name: result.user.familyName || undefined,
          subject_type: 'user',
        })
        .catch((err) => this.logger.warn(`Failed to emit subject.created: ${err.message}`));

      this.syncEventService
        .emit(SYNC_EVENT_TYPES.MEMBER_JOINED, result.tenant.id, appId, {
          membership_id: result.membership!.id,
          sub: result.user.id,
          email: result.user.email,
          tenant_roles: tenantRoleSlugs,
          given_name: result.user.givenName || undefined,
          family_name: result.user.familyName || undefined,
        })
        .catch((err) => this.logger.warn(`Failed to emit member.joined: ${err.message}`));
    }
  }

  private async getApplicationIdsForTenant(tenantId: string): Promise<string[]> {
    const subscriptions = await this.prisma.appSubscription.findMany({
      where: { tenantId, status: 'ACTIVE' },
      select: { applicationId: true },
    });
    return subscriptions.map((s) => s.applicationId);
  }
}
