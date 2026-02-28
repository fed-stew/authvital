import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { InstanceService } from '../../instance/instance.service';

/**
 * Handles user management operations for super admins.
 * Focused on: User CRUD, search, stats, and password resets.
 */
/** Valid user field names for validation */
type UserField = 'givenName' | 'familyName' | 'email' | 'phone';

@Injectable()
export class AdminUsersService {
  private readonly SALT_ROUNDS = 12;

  constructor(
    private readonly prisma: PrismaService,
    private readonly instanceService: InstanceService,
  ) {}

  /**
   * Get all users with optional search and pagination
   */
  async getUsers(opts: { search?: string; limit?: number; offset?: number }) {
    const { search, limit = 50, offset = 0 } = opts;

    const where = search
      ? {
          OR: [
            { email: { contains: search, mode: 'insensitive' as const } },
            { givenName: { contains: search, mode: 'insensitive' as const } },
            { familyName: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: { memberships: true },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      users: users.map((u) => ({
        id: u.id,
        email: u.email,
        givenName: u.givenName,
        familyName: u.familyName,
        phone: u.phone,
        createdAt: u.createdAt,
        tenantCount: u._count.memberships,
      })),
      total,
      limit,
      offset,
    };
  }

  /**
   * Get user stats for dashboard
   */
  async getUserStats() {
    const [total, activeLastWeek, activeLastMonth] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({
        where: {
          updatedAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          },
        },
      }),
      this.prisma.user.count({
        where: {
          updatedAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          },
        },
      }),
    ]);

    return { total, activeLastWeek, activeLastMonth };
  }

  /**
   * Validate user data against instance's required fields
   */
  private validateUserFields(
    data: { givenName?: string; familyName?: string; email?: string; phone?: string },
    requiredFields: UserField[],
  ): void {
    const errors: string[] = [];

    for (const field of requiredFields) {
      const value = data[field];
      if (!value || !value.trim()) {
        errors.push(`${field} is required`);
      }
    }

    if (errors.length > 0) {
      throw new ConflictException(errors.join(', '));
    }
  }

  /**
   * Get detailed user info with all memberships across tenants
   */
  async getUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        memberships: {
          include: {
            tenant: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
            membershipRoles: {
              include: {
                role: {
                  include: {
                    application: {
                      select: { id: true, name: true, slug: true },
                    },
                  },
                },
              },
            },
            membershipTenantRoles: {
              include: {
                tenantRole: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Format memberships with grouped roles
    const memberships = user.memberships.map((membership) => {
      const rolesByApp: Record<
        string,
        { appId: string; appName: string; roles: { id: string; name: string; slug: string }[] }
      > = {};

      membership.membershipRoles.forEach((mr) => {
        const appId = mr.role.application.id;
        if (!rolesByApp[appId]) {
          rolesByApp[appId] = {
            appId,
            appName: mr.role.application.name,
            roles: [],
          };
        }
        rolesByApp[appId].roles.push({
          id: mr.role.id,
          name: mr.role.name,
          slug: mr.role.slug,
        });
      });

      return {
        id: membership.id,
        tenantId: membership.tenantId,
        tenant: membership.tenant,
        status: membership.status,
        joinedAt: membership.joinedAt,
        createdAt: membership.createdAt,
        rolesByApplication: Object.values(rolesByApp),
        totalRoles: membership.membershipRoles.length,
      };
    });

    return {
      id: user.id,
      email: user.email,
      givenName: user.givenName,
      familyName: user.familyName,
      phone: user.phone,
      displayName: user.displayName,
      pictureUrl: user.pictureUrl,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      memberships,
      membershipCount: memberships.length,
    };
  }

  /**
   * Create a new user in the instance
   */
  async createUser(data: {
    givenName?: string;
    familyName?: string;
    email?: string;
    phone?: string;
    password?: string;
  }) {
    // Get instance config for required fields
    const config = await this.instanceService.getSignupConfig();

    // Validate required fields based on instance config
    this.validateUserFields(data, config.requiredUserFields as UserField[]);

    // Check email uniqueness if provided (globally unique)
    if (data.email) {
      const existingByEmail = await this.prisma.user.findUnique({
        where: { email: data.email.toLowerCase() },
      });
      if (existingByEmail) {
        throw new ConflictException('A user with this email already exists');
      }
    }

    // Check phone uniqueness if provided (globally unique)
    if (data.phone) {
      const existingByPhone = await this.prisma.user.findUnique({
        where: { phone: data.phone },
      });
      if (existingByPhone) {
        throw new ConflictException('A user with this phone number already exists');
      }
    }

    // Hash password if provided
    let passwordHash: string | null = null;
    if (data.password) {
      passwordHash = await bcrypt.hash(data.password, this.SALT_ROUNDS);
    }

    // Create user
    const user = await this.prisma.user.create({
      data: {
        givenName: data.givenName?.trim() || null,
        familyName: data.familyName?.trim() || null,
        email: data.email?.toLowerCase().trim() || null,
        phone: data.phone?.trim() || null,
        passwordHash,
        isMachine: false,
      },
      select: {
        id: true,
        givenName: true,
        familyName: true,
        email: true,
        phone: true,
        createdAt: true,
      },
    });

    return user;
  }

  /**
   * Update a user
   */
  async updateUser(
    userId: string,
    data: {
      givenName?: string;
      familyName?: string;
      email?: string;
      phone?: string;
    },
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Get instance config for required fields
    const config = await this.instanceService.getSignupConfig();

    // Validate required fields
    const updatedData = { ...user, ...data };
    this.validateUserFields(
      {
        givenName: updatedData.givenName || undefined,
        familyName: updatedData.familyName || undefined,
        email: updatedData.email || undefined,
        phone: updatedData.phone || undefined,
      },
      config.requiredUserFields as UserField[],
    );

    // Check email uniqueness if changed (globally unique)
    if (data.email && data.email !== user.email) {
      const existingByEmail = await this.prisma.user.findFirst({
        where: {
          email: data.email.toLowerCase(),
          NOT: { id: userId },
        },
      });
      if (existingByEmail) {
        throw new ConflictException('A user with this email already exists');
      }
    }

    // Check phone uniqueness if changed (globally unique)
    if (data.phone && data.phone !== user.phone) {
      const existingByPhone = await this.prisma.user.findFirst({
        where: {
          phone: data.phone,
          NOT: { id: userId },
        },
      });
      if (existingByPhone) {
        throw new ConflictException('A user with this phone number already exists');
      }
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        givenName: data.givenName?.trim(),
        familyName: data.familyName?.trim(),
        email: data.email?.toLowerCase().trim(),
        phone: data.phone?.trim(),
      },
      select: {
        id: true,
        givenName: true,
        familyName: true,
        email: true,
        phone: true,
        createdAt: true,
      },
    });
  }

  /**
   * Delete a user
   */
  async deleteUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.prisma.user.delete({
      where: { id: userId },
    });

    return { success: true, message: 'User deleted' };
  }

  /**
   * Send password reset email to a user (admin-triggered)
   */
  async sendUserPasswordReset(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.email) {
      throw new BadRequestException('User does not have an email address');
    }

    // Generate secure reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = await bcrypt.hash(resetToken, this.SALT_ROUNDS);
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    // Store the token hash in user record
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: tokenHash,
        passwordResetExpires: expiresAt,
      },
    });

    // Log the reset token in development (in production, only send via email)
    if (process.env.NODE_ENV !== 'production') {
      console.log(`\n${'='.repeat(60)}`);
      console.log('🔐 PASSWORD RESET TOKEN (dev mode)');
      console.log('='.repeat(60));
      console.log(`User: ${user.email}`);
      console.log(`Token: ${resetToken}`);
      console.log(`Expires: ${expiresAt.toISOString()}`);
      console.log('='.repeat(60) + '\n');
    }

    return {
      success: true,
      message: `Password reset email sent to ${user.email}`,
      // Only include in dev for testing
      ...(process.env.NODE_ENV !== 'production' ? { resetToken, expiresAt } : {}),
    };
  }
}
