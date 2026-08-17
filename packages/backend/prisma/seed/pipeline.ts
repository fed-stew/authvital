// =============================================================================
// SEED PIPELINE — THE canonical ordering (defined exactly once)
// =============================================================================
// Every entry point (standalone `npm run prisma:seed` and the docker bootstrap)
// runs THIS list. Dependencies flow top-to-bottom:
//
//   instance         (standalone)
//   system-roles  -> required before memberships reference tenant roles
//   internal-client  -> reserved credential for internal auth-flow sessions
//   super-admin      (skipped by bootstrap, which creates it specially)
//   applications  -> fills appIdMap
//   tenants       -> fills tenantIdMap
//   m2m-grants    -> needs appIdMap + tenantIdMap (per-tenant M2M authz)
//   users         -> needs system-roles + tenants + applications
//   subscriptions -> needs tenants + applications + users
//
// Reorder here and BOTH entry points stay in sync. Do not inline ordering
// anywhere else.

import { SeedContext, Seeder } from './context';
import { applicationsSeeder } from './seeders/applications.seeder';
import { instanceSeeder } from './seeders/instance.seeder';
import { internalClientSeeder } from './seeders/internal-client.seeder';
import { m2mGrantsSeeder } from './seeders/m2m-grants.seeder';
import { subscriptionsSeeder } from './seeders/subscriptions.seeder';
import { superAdminSeeder } from './seeders/super-admin.seeder';
import { systemRolesSeeder } from './seeders/system-roles.seeder';
import { tenantsSeeder } from './seeders/tenants.seeder';
import { usersSeeder } from './seeders/users.seeder';

/** The single source of truth for seed ordering. */
export const SEED_PIPELINE: readonly Seeder[] = [
  instanceSeeder,
  systemRolesSeeder,
  internalClientSeeder,
  superAdminSeeder,
  applicationsSeeder,
  tenantsSeeder,
  m2mGrantsSeeder,
  usersSeeder,
  subscriptionsSeeder,
];

/** Run the full pipeline in order, skipping seeders that opt out via shouldRun. */
export async function runSeedPipeline(ctx: SeedContext): Promise<void> {
  for (const seeder of SEED_PIPELINE) {
    if (seeder.shouldRun(ctx)) {
      await seeder.run(ctx);
    }
  }
}
