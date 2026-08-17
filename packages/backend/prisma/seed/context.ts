// =============================================================================
// SEED CONTEXT & CONTRACT
// =============================================================================
// The shared state threaded through the ordered pipeline, plus the `Seeder`
// interface every seeder module implements. This is what lets each seeder live
// in its own file yet still hand results (ids) to later seeders.

import { PrismaClient } from '@prisma/client';
import { AppRef, SeedConfig } from './types';

/** How the super-admin step should behave for a given run. */
export type SuperAdminMode =
  | 'standard' // seed the YAML super_admin as-is (dev/manual seeding)
  | 'skip'; // caller already created the super admin (docker bootstrap)

export interface SeedOptions {
  /** Controls the super-admin seeder. Defaults to 'standard'. */
  superAdmin: SuperAdminMode;
  /** Whether to seed subscriptions. Defaults to true. */
  includeSubscriptions: boolean;
}

/**
 * Shared, mutable state for one seed run. Earlier seeders populate the id maps
 * so later seeders (users, subscriptions) can resolve slugs → ids.
 */
export interface SeedContext {
  prisma: PrismaClient;
  config: SeedConfig;
  tenantIdMap: Map<string, string>;
  appIdMap: Map<string, AppRef>;
  options: SeedOptions;
}

/**
 * A single, self-contained unit of seeding. Add/remove/reorder these in
 * pipeline.ts — never inline the ordering anywhere else.
 */
export interface Seeder {
  /** Human-readable name, used only for logging/debugging. */
  readonly name: string;
  /** Return false to no-op this seeder for the current config/options. */
  shouldRun(ctx: SeedContext): boolean;
  /** Do the work. Must be idempotent (safe to re-run). */
  run(ctx: SeedContext): Promise<void>;
}

/** Build a SeedContext with sane defaults. */
export function createSeedContext(
  prisma: PrismaClient,
  config: SeedConfig,
  options: Partial<SeedOptions> = {},
): SeedContext {
  return {
    prisma,
    config,
    tenantIdMap: new Map<string, string>(),
    appIdMap: new Map<string, AppRef>(),
    options: {
      superAdmin: options.superAdmin ?? 'standard',
      includeSubscriptions: options.includeSubscriptions ?? true,
    },
  };
}
