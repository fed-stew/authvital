// =============================================================================
// STANDALONE RUNNER — `npm run prisma:seed` entry point
// =============================================================================
// Thin wrapper: resolve config, run the canonical pipeline, print a summary.
// The docker bootstrap path uses the same pipeline (see src/bootstrap.ts).

import { PrismaClient } from '@prisma/client';
import * as path from 'path';
import { loadConfig, resolveConfigPath } from './config';
import { createSeedContext } from './context';
import { log, logSection } from './logger';
import { runSeedPipeline } from './pipeline';
import { AppRef, SeedConfig } from './types';

/**
 * Seed database from YAML configuration.
 *
 * @param skipSuperAdmin - If true, skips the super_admin seeding section.
 *                        Useful when bootstrap already handled super admin creation.
 * @returns true if YAML config was found and processed, false if no config found
 */
export async function seedFromYaml(skipSuperAdmin = false): Promise<boolean> {
  const configPath = resolveConfigPath();

  if (!configPath) {
    return false; // No YAML config found, caller should fall back
  }

  const fileName = path.basename(configPath);
  console.log('\n' + '='.repeat(60));
  console.log('  AuthVital YAML Seed');
  console.log('  ' + '─'.repeat(56));
  console.log(`  Config: ${fileName}`);
  console.log('='.repeat(60));

  const config = loadConfig(configPath);
  const prisma = new PrismaClient();

  const ctx = createSeedContext(prisma, config, {
    superAdmin: skipSuperAdmin ? 'skip' : 'standard',
    includeSubscriptions: true,
  });

  try {
    await runSeedPipeline(ctx);
    await printSummary(prisma, config, ctx.appIdMap, skipSuperAdmin);
    return true;
  } finally {
    await prisma.$disconnect();
  }
}

/** Print the human-friendly recap (admin creds, app client ids/secrets, users). */
async function printSummary(
  prisma: PrismaClient,
  config: SeedConfig,
  appIdMap: Map<string, AppRef>,
  skipSuperAdmin: boolean,
): Promise<void> {
  logSection('Seed Complete');

  if (config.super_admin && !skipSuperAdmin) {
    log('', `Admin Panel:  /admin/login`);
    log('  ', `Email:        ${config.super_admin.email}`);
    log('  ', `Password:     ${config.super_admin.password}`);
  }

  if (config.applications?.length) {
    console.log('');
    log('', 'Applications:');
    for (const app of config.applications) {
      const appData = appIdMap.get(app.slug);
      if (!appData) continue;

      // clientId + type live on ApplicationClient now (one client per app).
      const dbApp = await prisma.applicationClient.findFirst({
        where: { applicationId: appData.id },
        select: { clientId: true, type: true },
      });
      let appLine = `  ${app.name}: client_id=${dbApp?.clientId}`;
      if (dbApp?.type === 'MACHINE') {
        // Show the secret if we have it (provided or generated)
        const secretToShow =
          appData.clientSecret || app.client_secret || '(existing - see above logs)';
        appLine += `, client_secret=${secretToShow}`;
      }
      log('  ', appLine);
    }
  }

  if (config.users?.length) {
    console.log('');
    log('', 'Users (all passwords shown in output above)');
  }

  console.log('\n' + '='.repeat(60) + '\n');
}
