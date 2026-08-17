// =============================================================================
// SYSTEM ROLES SEEDER — the tenant roles memberships depend on
// =============================================================================
// MUST run before the users seeder: memberships reference these role slugs.
// The canonical ordering lives in pipeline.ts; this file just does the work.

import { PrismaClient } from '@prisma/client';
import { SYSTEM_TENANT_ROLES } from '../constants';
import { Seeder } from '../context';
import { log, logSection } from '../logger';

export async function seedSystemTenantRoles(prisma: PrismaClient): Promise<void> {
  logSection('System Tenant Roles');

  for (const roleData of SYSTEM_TENANT_ROLES) {
    await prisma.tenantRole.upsert({
      where: { slug: roleData.slug },
      update: {
        name: roleData.name,
        description: roleData.description,
        permissions: roleData.permissions,
        isSystem: true,
      },
      create: {
        name: roleData.name,
        slug: roleData.slug,
        description: roleData.description,
        permissions: roleData.permissions,
        isSystem: true,
      },
    });
    log('', `${roleData.name} (${roleData.permissions.length} permissions)`);
  }
}

export const systemRolesSeeder: Seeder = {
  name: 'system-roles',
  shouldRun: () => true, // always required
  run: (ctx) => seedSystemTenantRoles(ctx.prisma),
};
