/**
 * Migration Runner Entry Point
 * 
 * This runs after Prisma migrations in the Cloud Run Job.
 * Handles bootstrap tasks like creating initial super admin and system roles.
 * 
 * Usage: node dist/src/migrate-runner.js
 */

import * as path from 'path';
// eslint-disable-next-line @typescript-eslint/no-var-requires
require('dotenv').config({ path: path.join(process.cwd(), '.env') });

// Build DATABASE_URL from components if not provided directly (Cloud SQL socket connection)
if (!process.env.DATABASE_URL && process.env.DB_HOST && process.env.DB_USERNAME && process.env.DB_PASSWORD && process.env.DB_DATABASE) {
  const { DB_HOST, DB_USERNAME, DB_PASSWORD, DB_DATABASE } = process.env;
  process.env.DATABASE_URL = `postgresql://${DB_USERNAME}:${encodeURIComponent(DB_PASSWORD)}@localhost/${DB_DATABASE}?host=${DB_HOST}`;
}

import { PrismaClient } from '@prisma/client';
import { bootstrap } from './bootstrap';
import { DEFAULT_TENANT_ROLES } from './authorization/constants/default-tenant-roles';

async function ensureSystemTenantRoles(prisma: PrismaClient): Promise<void> {
  console.log('Ensuring system tenant roles exist...');
  
  for (const roleData of DEFAULT_TENANT_ROLES) {
    const existing = await prisma.tenantRole.findUnique({
      where: { slug: roleData.slug },
    });

    if (!existing) {
      await prisma.tenantRole.create({
        data: {
          name: roleData.name,
          slug: roleData.slug,
          description: roleData.description,
          permissions: roleData.permissions,
          isSystem: true,
        },
      });
      console.log(`  Created system tenant role: ${roleData.name}`);
    }
  }
}

async function runMigration(): Promise<void> {
  const prisma = new PrismaClient();
  
  try {
    // Run super admin bootstrap
    console.log('Running bootstrap checks...');
    await bootstrap();
    
    // Ensure system tenant roles exist
    await ensureSystemTenantRoles(prisma);
    
    console.log('Bootstrap complete');
    process.exit(0);
  } catch (error) {
    console.error('Bootstrap failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runMigration();
