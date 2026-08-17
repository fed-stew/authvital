// =============================================================================
// USERS SEEDER — users, memberships, tenant-role & app-role assignments
// =============================================================================
// Depends on: system-roles (tenant roles), tenants (tenantIdMap) and
// applications (appIdMap) having run first. See pipeline.ts for the order.

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { SALT_ROUNDS } from '../constants';
import { Seeder } from '../context';
import { log, logSection } from '../logger';
import { AppRef, SeedMembership, SeedUser } from '../types';

export async function seedUsers(
  prisma: PrismaClient,
  users: SeedUser[],
  tenantIdMap: Map<string, string>,
  appIdMap: Map<string, AppRef>,
): Promise<void> {
  logSection('Users & Memberships');

  for (const userConfig of users) {
    const email = userConfig.email.toLowerCase();
    const passwordHash = await bcrypt.hash(userConfig.password, SALT_ROUNDS);

    const user = await prisma.user.upsert({
      where: { email },
      update: {
        passwordHash,
        givenName: userConfig.given_name,
        familyName: userConfig.family_name,
        displayName: userConfig.display_name,
        phone: userConfig.phone,
        emailVerified: true,
      },
      create: {
        ...(userConfig.id && { id: userConfig.id }), // Use explicit ID if provided
        email,
        passwordHash,
        givenName: userConfig.given_name,
        familyName: userConfig.family_name,
        displayName: userConfig.display_name,
        phone: userConfig.phone,
        emailVerified: true,
      },
    });

    const displayName =
      [userConfig.given_name, userConfig.family_name].filter(Boolean).join(' ') || email;

    const idDisplay = userConfig.id ? ` [id: ${user.id.substring(0, 8)}...]` : '';
    log('', `${displayName} <${email}>${idDisplay} - password: ${userConfig.password}`);

    if (userConfig.memberships?.length) {
      for (const membershipConfig of userConfig.memberships) {
        await seedMembership(prisma, user.id, membershipConfig, tenantIdMap, appIdMap);
      }
    }
  }
}

/** Seed a single membership: tenant role + optional per-app access & roles. */
async function seedMembership(
  prisma: PrismaClient,
  userId: string,
  membershipConfig: SeedMembership,
  tenantIdMap: Map<string, string>,
  appIdMap: Map<string, AppRef>,
): Promise<void> {
  const tenantId = tenantIdMap.get(membershipConfig.tenant);
  if (!tenantId) {
    console.warn(
      `   Skipping membership: tenant "${membershipConfig.tenant}" not found. Available: ${Array.from(
        tenantIdMap.keys(),
      ).join(', ')}`,
    );
    return;
  }

  const membership = await prisma.membership.upsert({
    where: {
      userId_tenantId: { userId, tenantId },
    },
    update: {
      status: 'ACTIVE',
    },
    create: {
      userId,
      tenantId,
      status: 'ACTIVE',
      joinedAt: new Date(),
    },
  });

  log(
    '  ',
    `  -> ${membershipConfig.tenant} (${membershipConfig.tenant_role}) - membership: ${membership.id.substring(
      0,
      8,
    )}...`,
  );

  await assignTenantRole(prisma, membership.id, membershipConfig.tenant_role);

  if (membershipConfig.app_roles) {
    for (const [appSlug, roleSlugs] of Object.entries(membershipConfig.app_roles)) {
      await assignAppRoles(prisma, {
        userId,
        tenantId,
        membershipId: membership.id,
        appSlug,
        roleSlugs,
        appIdMap,
      });
    }
  }
}

/** Attach a system tenant role to a membership. */
async function assignTenantRole(
  prisma: PrismaClient,
  membershipId: string,
  tenantRoleSlug: string,
): Promise<void> {
  const tenantRole = await prisma.tenantRole.findUnique({
    where: { slug: tenantRoleSlug },
  });

  if (!tenantRole) {
    const availableRoles = await prisma.tenantRole.findMany({ select: { slug: true } });
    console.warn(
      `   Tenant role "${tenantRoleSlug}" not found. Available: ${availableRoles
        .map((r) => r.slug)
        .join(', ')}`,
    );
    return;
  }

  await prisma.membershipTenantRole.upsert({
    where: {
      membershipId_tenantRoleId: {
        membershipId,
        tenantRoleId: tenantRole.id,
      },
    },
    update: {},
    create: {
      membershipId,
      tenantRoleId: tenantRole.id,
    },
  });
}

/** Grant app access + attach the requested app roles for a membership. */
async function assignAppRoles(
  prisma: PrismaClient,
  args: {
    userId: string;
    tenantId: string;
    membershipId: string;
    appSlug: string;
    roleSlugs: string[];
    appIdMap: Map<string, AppRef>;
  },
): Promise<void> {
  const { userId, tenantId, membershipId, appSlug, roleSlugs, appIdMap } = args;

  const appData = appIdMap.get(appSlug);
  if (!appData) {
    console.warn(`   Skipping app roles: application "${appSlug}" not found`);
    return;
  }

  // Ensure app access exists for this user+tenant+app
  await prisma.appAccess.upsert({
    where: {
      userId_tenantId_applicationId: {
        userId,
        tenantId,
        applicationId: appData.id,
      },
    },
    update: {
      status: 'ACTIVE',
    },
    create: {
      userId,
      tenantId,
      applicationId: appData.id,
      accessType: 'GRANTED',
      status: 'ACTIVE',
    },
  });

  log('  ', `    -> AppAccess: ${appSlug} = ACTIVE`);

  for (const roleSlug of roleSlugs) {
    const role = await prisma.role.findUnique({
      where: {
        slug_applicationId: { slug: roleSlug, applicationId: appData.id },
      },
    });

    if (!role) {
      console.warn(`   Role "${roleSlug}" not found for app "${appSlug}"`);
      continue;
    }

    await prisma.membershipRole.upsert({
      where: {
        membershipId_roleId: { membershipId, roleId: role.id },
      },
      update: {},
      create: {
        membershipId,
        roleId: role.id,
      },
    });
    log('  ', `    -> ${appSlug}: ${roleSlug}`);
  }
}

export const usersSeeder: Seeder = {
  name: 'users',
  shouldRun: (ctx) => !!ctx.config.users?.length,
  run: async (ctx) => {
    if (!ctx.config.users?.length) return;
    await seedUsers(ctx.prisma, ctx.config.users, ctx.tenantIdMap, ctx.appIdMap);
  },
};
