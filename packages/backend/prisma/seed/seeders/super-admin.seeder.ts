// =============================================================================
// SUPER ADMIN SEEDER — the platform super admin (standard/manual seeding)
// =============================================================================
// NOTE: the docker bootstrap path creates the super admin with its own
// production-safe logic (random password + email delivery) and runs the
// pipeline with superAdmin: 'skip'. This seeder is the plain dev/manual path.

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { SALT_ROUNDS } from '../constants';
import { Seeder } from '../context';
import { log, logSection } from '../logger';
import { SeedSuperAdmin } from '../types';

export async function seedSuperAdmin(
  prisma: PrismaClient,
  config: SeedSuperAdmin,
): Promise<void> {
  logSection('Super Admin');

  const passwordHash = await bcrypt.hash(config.password, SALT_ROUNDS);

  await prisma.superAdmin.upsert({
    where: { email: config.email.toLowerCase() },
    update: {
      passwordHash,
      displayName: config.display_name ?? 'System Administrator',
    },
    create: {
      email: config.email.toLowerCase(),
      passwordHash,
      displayName: config.display_name ?? 'System Administrator',
    },
  });

  log('', `Email:    ${config.email}`);
  log('', `Password: ${config.password}`);
}

export const superAdminSeeder: Seeder = {
  name: 'super-admin',
  shouldRun: (ctx) => ctx.options.superAdmin === 'standard' && !!ctx.config.super_admin,
  run: async (ctx) => {
    if (ctx.config.super_admin) {
      await seedSuperAdmin(ctx.prisma, ctx.config.super_admin);
    }
  },
};
