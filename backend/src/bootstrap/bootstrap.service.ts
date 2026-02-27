import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_TENANT_ROLES } from '../authorization/constants/default-tenant-roles';
import * as bcrypt from 'bcrypt';

/**
 * BootstrapService - Ensures required system data exists on startup
 *
 * This runs automatically when the app starts and creates:
 * - System tenant roles (owner, admin, member)
 * - Default super admin (if none exists)
 * - Instance meta (if not configured)
 *
 * This makes the app self-healing - if system roles are missing,
 * they get created automatically.
 */
@Injectable()
export class BootstrapService implements OnModuleInit {
  private readonly logger = new Logger(BootstrapService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    this.logger.log('Running bootstrap checks...');

    await this.ensureSystemTenantRoles();
    await this.ensureInstanceMeta();
    await this.ensureDefaultSuperAdmin();

    this.logger.log('Bootstrap complete');
  }

  /**
   * Ensure system tenant roles exist
   * Uses the centralized DEFAULT_TENANT_ROLES constant to stay DRY
   */
  private async ensureSystemTenantRoles() {
    for (const roleData of DEFAULT_TENANT_ROLES) {
      const existing = await this.prisma.tenantRole.findUnique({
        where: { slug: roleData.slug },
      });

      if (!existing) {
        await this.prisma.tenantRole.create({
          data: {
            name: roleData.name,
            slug: roleData.slug,
            description: roleData.description,
            permissions: roleData.permissions,
            isSystem: true,
          },
        });
        this.logger.log(`Created system tenant role: ${roleData.name}`);
      }
    }
  }

  /**
   * Ensure instance meta exists with sensible defaults
   */
  private async ensureInstanceMeta() {
    const existing = await this.prisma.instanceMeta.findUnique({
      where: { id: 'instance' },
    });

    if (!existing) {
      await this.prisma.instanceMeta.create({
        data: {
          id: 'instance',
          name: 'AuthVital IDP',
          allowSignUp: true,
          autoCreateTenant: true,
          allowGenericDomains: true,
          allowAnonymousSignUp: false,
        },
      });
      this.logger.log('Created default instance meta');
    }
  }

  /**
   * Ensure at least one super admin exists
   * Only creates a default admin if NONE exist
   * In production, set these via environment variables!
   */
  private async ensureDefaultSuperAdmin() {
    const superAdminCount = await this.prisma.superAdmin.count();

    if (superAdminCount === 0) {
      const defaultEmail =
        process.env.DEFAULT_SUPER_ADMIN_EMAIL || 'admin@idp.system';
      const defaultPassword =
        process.env.DEFAULT_SUPER_ADMIN_PASSWORD || 'superadmin123';

      const passwordHash = await bcrypt.hash(defaultPassword, 12);

      await this.prisma.superAdmin.create({
        data: {
          email: defaultEmail,
          passwordHash,
          displayName: 'System Administrator',
        },
      });

      this.logger.warn(`Created default super admin: ${defaultEmail}`);
      this.logger.warn('CHANGE THE DEFAULT PASSWORD IMMEDIATELY!');
    }
  }
}
