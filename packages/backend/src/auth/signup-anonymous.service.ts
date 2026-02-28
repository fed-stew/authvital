import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InstanceService } from '../instance/instance.service';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { isGenericDomain, extractDomain } from './constants/generic-domains';
import { SignUpResult, AnonymousSignUpResult, AnonymousSignUpDto, UpgradeAccountDto } from './signup.types';

/**
 * Handles anonymous signup and account upgrade flows.
 * Separated from main SignUpService for better maintainability.
 */
@Injectable()
export class SignUpAnonymousService {
  private readonly SALT_ROUNDS = 12;
  private readonly logger = new Logger(SignUpAnonymousService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly instanceService: InstanceService,
  ) {}

  /**
   * Create an anonymous account
   * Use case: Mobile games where users can play immediately and create account later
   */
  async signUpAnonymous(_dto: AnonymousSignUpDto): Promise<AnonymousSignUpResult> {
    const config = await this.instanceService.getSignupConfig();

    if (!config.allowAnonymousSignUp) {
      throw new ForbiddenException('Anonymous sign-up is not allowed');
    }

    // Generate anonymous token (used for authentication)
    const anonymousToken = this.generateAnonymousToken();
    const tokenHash = await bcrypt.hash(anonymousToken, this.SALT_ROUNDS);

    const user = await this.prisma.user.create({
      data: {
        isAnonymous: true,
        isMachine: false,
        passwordHash: tokenHash,
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
      throw new NotFoundException('User not found');
    }

    if (!user.isAnonymous) {
      throw new BadRequestException('User is not an anonymous account');
    }

    const config = await this.instanceService.getSignupConfig();

    // Validate email domain
    const emailDomain = extractDomain(dto.email);
    const isGeneric = isGenericDomain(emailDomain);

    if (isGeneric && !config.allowGenericDomains) {
      throw new BadRequestException(
        'Generic email domains (Gmail, Yahoo, etc.) are not allowed. Please use a corporate email.',
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
      throw new ConflictException('A user with this email already exists');
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
        return this.joinExistingTenant(tx, updatedUser, verifiedDomain);
      }

      // Create tenant if autoCreateTenant is enabled
      if (!config.autoCreateTenant) {
        return this.buildUserOnlyResult(updatedUser);
      }

      // Create new tenant
      return this.createNewTenantForUser(tx, updatedUser, dto, isGeneric, emailDomain);
    });
  }

  private async joinExistingTenant(
    tx: any,
    user: { id: string; email: string | null; givenName: string | null; familyName: string | null },
    verifiedDomain: { tenant: { id: string; name: string; slug: string } },
  ): Promise<SignUpResult> {
    const membership = await tx.membership.create({
      data: {
        userId: user.id,
        tenantId: verifiedDomain.tenant.id,
        status: 'ACTIVE',
        joinedAt: new Date(),
      },
    });

    // Assign member tenant role when joining existing tenant
    const memberRole = await tx.tenantRole.findUnique({
      where: { slug: 'member' },
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
      membership: { id: membership.id },
      domain: null,
      joinedExistingTenant: true,
    };
  }

  private buildUserOnlyResult(user: {
    id: string;
    email: string | null;
    givenName: string | null;
    familyName: string | null;
  }): SignUpResult {
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

  private async createNewTenantForUser(
    tx: any,
    user: { id: string; email: string | null; givenName: string | null; familyName: string | null },
    dto: UpgradeAccountDto,
    isGeneric: boolean,
    emailDomain: string,
  ): Promise<SignUpResult> {
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
        userId: user.id,
        tenantId: tenant.id,
        status: 'ACTIVE',
        joinedAt: new Date(),
      },
    });

    // Assign owner tenant role when creating new tenant
    const ownerRole = await tx.tenantRole.findUnique({
      where: { slug: 'owner' },
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
        id: user.id,
        email: user.email,
        givenName: user.givenName,
        familyName: user.familyName,
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
  }

  private validateRequiredFields(dto: UpgradeAccountDto, requiredFields: string[]) {
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

  private generateTenantName(dto: UpgradeAccountDto, isGeneric: boolean): string {
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
      const existing = await tx.tenant.findUnique({
        where: { slug },
      });

      if (!existing) {
        return slug;
      }

      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    slug = `${baseSlug}-${crypto.randomBytes(4).toString('hex')}`;
    return slug;
  }

  private generateVerificationToken(): string {
    return `idp-verify-${crypto.randomBytes(16).toString('hex')}`;
  }

  private generateAnonymousToken(): string {
    return crypto.randomBytes(32).toString('base64url');
  }
}
