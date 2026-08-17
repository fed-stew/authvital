// =============================================================================
// SEED CLI — `npm run prisma:seed` / `prisma db seed` entry point
// =============================================================================
// Tries the YAML seed first (seed.config.yaml -> seed.config.example.yaml).
// If no YAML config exists at all, falls back to a minimal legacy seed so a
// bare `prisma db seed` still yields a usable super admin + system roles.

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { SALT_ROUNDS } from './constants';
import { seedFromYaml } from './run';
import { seedSystemTenantRoles } from './seeders/system-roles.seeder';

/**
 * Minimal fallback seed used only when NO YAML config is found. Reuses the
 * shared system-roles seeder so there is a single source of truth for roles.
 */
async function legacySeed(): Promise<void> {
  const prisma = new PrismaClient();

  try {
    console.log('Seeding database (legacy mode - no YAML config found)...\n');

    const superAdminPassword = await bcrypt.hash('superadmin123', SALT_ROUNDS);
    const superAdmin = await prisma.superAdmin.upsert({
      where: { email: 'admin@idp.system' },
      update: {},
      create: {
        email: 'admin@idp.system',
        passwordHash: superAdminPassword,
        displayName: 'System Administrator',
      },
    });
    console.log('Super Admin created:', superAdmin.email);
    console.log('   Password: superadmin123\n');

    const instanceMeta = await prisma.instanceMeta.upsert({
      where: { id: 'instance' },
      update: {},
      create: {
        id: 'instance',
        name: 'AuthVital IDP',
        allowSignUp: true,
        autoCreateTenant: true,
        allowGenericDomains: true,
        allowAnonymousSignUp: false,
      },
    });
    console.log('Instance Meta created:', instanceMeta.name);
    console.log('   Instance UUID:', instanceMeta.instanceUuid, '\n');

    await seedSystemTenantRoles(prisma);

    console.log('\n========================================');
    console.log('Seed completed successfully!');
    console.log('========================================\n');
    console.log('Super Admin Login:');
    console.log('  Email: admin@idp.system');
    console.log('  Password: superadmin123\n');
  } finally {
    await prisma.$disconnect();
  }
}

async function main(): Promise<void> {
  // Try YAML seed first. In manual seed mode we process super_admin from YAML.
  const yamlSeeded = await seedFromYaml(false);

  if (!yamlSeeded) {
    console.log('No YAML seed config found, using legacy seed...');
    console.log('Tip: Copy seed.config.example.yaml to seed.config.yaml for a better experience!\n');
    await legacySeed();
  }
}

main().catch((e) => {
  console.error('Seed failed:', e);
  process.exit(1);
});
