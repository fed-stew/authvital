import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Handles application role management for super admins.
 * Roles are simple: name, slug, description - no permissions.
 * Permission checking happens in the consuming application layer.
 */
@Injectable()
export class AdminRolesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get roles for an application
   */
  async getApplicationRoles(applicationId: string) {
    const app = await this.prisma.application.findUnique({
      where: { id: applicationId },
    });

    if (!app) {
      throw new NotFoundException('Application not found');
    }

    return this.prisma.role.findMany({
      where: { applicationId },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Create a new role for an application
   */
  async createRole(
    applicationId: string,
    name: string,
    slug: string,
    description?: string,
    isDefault?: boolean,
  ) {
    const app = await this.prisma.application.findUnique({
      where: { id: applicationId },
    });

    if (!app) {
      throw new NotFoundException('Application not found');
    }

    // If this role should be default, unset any existing default first
    if (isDefault) {
      await this.prisma.role.updateMany({
        where: { applicationId, isDefault: true },
        data: { isDefault: false },
      });
    }

    // If this is the first role for the app, make it default automatically
    const existingRolesCount = await this.prisma.role.count({
      where: { applicationId },
    });
    const shouldBeDefault = isDefault || existingRolesCount === 0;

    return this.prisma.role.create({
      data: {
        name,
        slug,
        description,
        applicationId,
        isDefault: shouldBeDefault,
      },
    });
  }

  /**
   * Update an existing role
   */
  async updateRole(
    roleId: string,
    data: { name?: string; slug?: string; description?: string; isDefault?: boolean },
  ) {
    const role = await this.prisma.role.findUnique({
      where: { id: roleId },
    });

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    // If setting this role as default, unset any existing default first
    if (data.isDefault === true) {
      await this.prisma.role.updateMany({
        where: {
          applicationId: role.applicationId,
          isDefault: true,
          id: { not: roleId },
        },
        data: { isDefault: false },
      });
    }

    // Don't allow unsetting default if it's the only role
    if (data.isDefault === false) {
      const otherDefaultExists = await this.prisma.role.findFirst({
        where: {
          applicationId: role.applicationId,
          isDefault: true,
          id: { not: roleId },
        },
      });
      if (!otherDefaultExists) {
        delete data.isDefault;
      }
    }

    return this.prisma.role.update({
      where: { id: roleId },
      data,
    });
  }

  /**
   * Set a role as the default for an application
   * Only one role can be default per app
   */
  async setDefaultRole(roleId: string) {
    const role = await this.prisma.role.findUnique({
      where: { id: roleId },
    });

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    // Unset any existing default
    await this.prisma.role.updateMany({
      where: { applicationId: role.applicationId, isDefault: true },
      data: { isDefault: false },
    });

    // Set this role as default
    return this.prisma.role.update({
      where: { id: roleId },
      data: { isDefault: true },
    });
  }

  /**
   * Delete a role
   */
  async deleteRole(roleId: string) {
    const role = await this.prisma.role.findUnique({
      where: { id: roleId },
    });

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    await this.prisma.role.delete({ where: { id: roleId } });
    return { success: true, message: 'Role deleted' };
  }
}
