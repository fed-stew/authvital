// =============================================================================
// TENANTS SEEDER
// =============================================================================
// Populates ctx.tenantIdMap (slug -> id) for the users & subscriptions seeders.

import { PrismaClient } from '@prisma/client';
import { Seeder } from '../context';
import { log, logSection } from '../logger';
import { SeedTenant } from '../types';

export async function seedTenants(
  prisma: PrismaClient,
  tenants: SeedTenant[],
): Promise<Map<string, string>> {
  logSection('Tenants');

  // Map of slug -> tenant.id
  const tenantIdMap = new Map<string, string>();

  for (const tenantConfig of tenants) {
    const tenant = await prisma.tenant.upsert({
      where: { slug: tenantConfig.slug },
      update: {
        name: tenantConfig.name,
      },
      create: {
        ...(tenantConfig.id && { id: tenantConfig.id }), // Use explicit ID if provided
        name: tenantConfig.name,
        slug: tenantConfig.slug,
      },
    });

    tenantIdMap.set(tenantConfig.slug, tenant.id);
    const idDisplay = tenantConfig.id ? ` [id: ${tenant.id}]` : '';
    log('', `${tenant.name} (${tenant.slug})${idDisplay}`);
  }

  return tenantIdMap;
}

export const tenantsSeeder: Seeder = {
  name: 'tenants',
  shouldRun: (ctx) => !!ctx.config.tenants?.length,
  run: async (ctx) => {
    if (!ctx.config.tenants?.length) return;
    const map = await seedTenants(ctx.prisma, ctx.config.tenants);
    for (const [slug, id] of map) {
      ctx.tenantIdMap.set(slug, id);
    }
  },
};
