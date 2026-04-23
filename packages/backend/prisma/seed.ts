import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { seedFromYaml } from './seed-from-yaml';

// =============================================================================
// SYSTEM TENANT ROLES (fallback — used only if no YAML config found)
// =============================================================================

const SYSTEM_TENANT_ROLES = [
  {
    name: 'Owner',
    slug: 'owner',
    description: 'Full control over the tenant. Cannot be removed if last owner.',
    permissions: ['tenant:*'],
  },
  {
    name: 'Admin',
    slug: 'admin',
    description: 'Operational management of the tenant.',
    permissions: [
      'tenant:view',
      'tenant:manage',
      'members:view',
      'members:invite',
      'members:remove',
      'members:manage-roles',
      'licenses:view',
      'licenses:manage',
      'service-accounts:view',
      'service-accounts:manage',
      'domains:view',
      'domains:manage',
      'billing:view',
      'app-access:view',
      'app-access:manage',
      'tenant:sso:manage',
    ],
  },
  {
    name: 'Member',
    slug: 'member',
    description: 'Standard tenant membership with minimal permissions.',
    permissions: [
      'tenant:view',
      'members:view',
      'licenses:view',
      'app-access:view',
    ],
  },
];

// =============================================================================
// LEGACY SEED (fallback if no YAML config exists)
// =============================================================================

async function legacySeed() {
  const prisma = new PrismaClient();

  try {
    console.log('🌱 Seeding database (legacy mode — no YAML config found)...\n');

    // 1. Create Super Admin
    const superAdminPassword = await bcrypt.hash('superadmin123', 12);

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

    // 2. Create Instance Meta
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

    // 3. Create System Tenant Roles
    console.log('Creating system tenant roles...');

    for (const roleData of SYSTEM_TENANT_ROLES) {
      const tenantRole = await prisma.tenantRole.upsert({
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
      console.log(`   ${tenantRole.name} role (${roleData.permissions.length} permissions)`);
    }

    console.log('\n========================================');
    console.log('Seed completed successfully!');
    console.log('========================================\n');
    console.log('Super Admin Login:');
    console.log('  Email: admin@idp.system');
    console.log('  Password: superadmin123');
    console.log('\n');
  } finally {
    await prisma.$disconnect();
  }
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  // Try YAML seed first (looks for seed.config.yaml, then seed.config.example.yaml)
  // Note: In manual seed mode, we don't skip super admin (false = process super admin from YAML)
  const yamlSeeded = await seedFromYaml(false);

  if (!yamlSeeded) {
    // No YAML config found — fall back to legacy hardcoded seed
    console.log('No YAML seed config found, using legacy seed...');
    console.log('Tip: Copy seed.config.example.yaml to seed.config.yaml for a better experience!\n');
    await legacySeed();
  }
}

main().catch((e) => {
  console.error('Seed failed:', e);
  process.exit(1);
});
