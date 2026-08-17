// =============================================================================
// M2M GRANTS SEEDER — per-tenant authorization for MACHINE clients
// =============================================================================
// Depends on applications (fills appIdMap) and tenants (fills tenantIdMap)
// existing, so it must run AFTER both in the pipeline.
//
// Under the new deny-by-default M2M rules, a MACHINE client that is NOT
// `m2mTrustedAllTenants` may only act on tenants it has an explicit
// M2mTenantGrant for. This seeder materialises those grants from the YAML
// `m2m_tenant_grants` list. Fully idempotent via the composite unique key.

import { PrismaClient } from '@prisma/client';
import { AppRef, SeedApplication } from '../types';
import { Seeder } from '../context';
import { log, logSection } from '../logger';

export async function seedM2mGrants(
  prisma: PrismaClient,
  apps: SeedApplication[],
  tenantIdMap: Map<string, string>,
  appIdMap: Map<string, AppRef>,
): Promise<void> {
  logSection('M2M Tenant Grants');

  for (const app of apps) {
    if (!app.m2m_tenant_grants?.length) continue;

    const appEntry = appIdMap.get(app.slug);
    if (!appEntry) {
      console.warn(`   Skipping M2M grants: application "${app.slug}" not found.`);
      continue;
    }

    // Grants now hang off the MACHINE ApplicationClient credential.
    const machineClient = await prisma.applicationClient.findUnique({
      where: {
        applicationId_type: { applicationId: appEntry.id, type: 'MACHINE' },
      },
      select: { id: true },
    });
    if (!machineClient) {
      console.warn(
        `   Skipping M2M grants: application "${app.slug}" has no MACHINE client.`,
      );
      continue;
    }
    const applicationClientId = machineClient.id;

    for (const tenantSlug of app.m2m_tenant_grants) {
      const tenantId = tenantIdMap.get(tenantSlug);
      if (!tenantId) {
        console.warn(
          `   Skipping M2M grant: tenant "${tenantSlug}" not found (app "${app.slug}").`,
        );
        continue;
      }

      await prisma.m2mTenantGrant.upsert({
        where: {
          applicationClientId_tenantId: { applicationClientId, tenantId },
        },
        update: {},
        create: { applicationClientId, tenantId },
      });

      log('', `${app.slug} -> ${tenantSlug}`);
    }
  }
}

export const m2mGrantsSeeder: Seeder = {
  name: 'm2m-grants',
  shouldRun: (ctx) =>
    !!ctx.config.applications?.some((a) => a.m2m_tenant_grants?.length),
  run: async (ctx) => {
    if (!ctx.config.applications?.length) return;
    await seedM2mGrants(
      ctx.prisma,
      ctx.config.applications,
      ctx.tenantIdMap,
      ctx.appIdMap,
    );
  },
};
