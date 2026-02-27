import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

// =============================================================================
// SYSTEM TENANT ROLES
// Used for tenant-level permissions (managing members, billing, etc.)
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
      'tenant:settings:view',
      'tenant:settings:edit',
      'tenant:member:view',
      'tenant:member:invite',
      'tenant:member:remove',
      'tenant:member:edit',
      'tenant:role:view',
      'tenant:role:manage',
      'tenant:domain:view',
      'tenant:domain:manage',
    ],
  },
  {
    name: 'Member',
    slug: 'member',
    description: 'Standard tenant membership with minimal permissions.',
    permissions: ['tenant:member:view'],
  },
];

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...\n');

  // ==========================================================================
  // 1. Create Super Admin (Bootstrap User)
  // ==========================================================================
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

  // ==========================================================================
  // 2. Create Instance Meta (Required Singleton Configuration)
  // ==========================================================================
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

  // ==========================================================================
  // 3. Create System Tenant Roles
  // ==========================================================================
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
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
