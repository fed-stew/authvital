// =============================================================================
// SUBSCRIPTIONS SEEDER — tenant subscriptions + seat assignments
// =============================================================================
// Depends on tenants, applications (with license types) and users existing.
//
// Mirrors LicensePoolService.provisionSubscription + LicenseAssignmentService
// .grantLicense at runtime, but standalone (no Nest DI): upserts the
// AppSubscription, creates missing LicenseAssignment rows, and reconciles the
// stored `quantityAssigned` counter. Fully idempotent.

import { PrismaClient } from '@prisma/client';
import { AppRef, SeedSubscription } from '../types';
import { Seeder } from '../context';
import { log, logSection } from '../logger';

export async function seedSubscriptions(
  prisma: PrismaClient,
  subs: SeedSubscription[],
  tenantIdMap: Map<string, string>,
  appIdMap: Map<string, AppRef>,
): Promise<void> {
  logSection('Subscriptions & Seat Assignments');

  for (const subConfig of subs) {
    const tenantId = tenantIdMap.get(subConfig.tenant);
    if (!tenantId) {
      console.warn(`   Skipping subscription: tenant "${subConfig.tenant}" not found.`);
      continue;
    }

    const appEntry = appIdMap.get(subConfig.application);
    if (!appEntry) {
      console.warn(
        `   Skipping subscription: application "${subConfig.application}" not found.`,
      );
      continue;
    }
    const applicationId = appEntry.id;

    const licenseType = await prisma.licenseType.findUnique({
      where: { applicationId_slug: { applicationId, slug: subConfig.license_type } },
    });
    if (!licenseType) {
      console.warn(
        `   Skipping subscription: license type "${subConfig.license_type}" not found for app "${subConfig.application}".`,
      );
      continue;
    }

    // Resolve assignees so we can size the seat ceiling to fit them.
    const wantedEmails = (subConfig.assign_to ?? []).map((e) => e.toLowerCase());
    const assignees = wantedEmails.length
      ? await prisma.user.findMany({
          where: { email: { in: wantedEmails } },
          select: { id: true, email: true },
        })
      : [];
    const foundEmails = new Set(assignees.map((a) => (a.email ?? '').toLowerCase()));
    for (const email of wantedEmails) {
      if (!foundEmails.has(email)) {
        console.warn(`   Assignee "${email}" not found - skipping that seat.`);
      }
    }

    const quantityPurchased = Math.max(subConfig.quantity, assignees.length);
    const periodEnd = subConfig.current_period_end
      ? new Date(subConfig.current_period_end)
      : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

    const subscription = await prisma.appSubscription.upsert({
      where: {
        tenantId_applicationId_licenseTypeId: {
          tenantId,
          applicationId,
          licenseTypeId: licenseType.id,
        },
      },
      update: {
        quantityPurchased,
        status: 'ACTIVE',
        currentPeriodEnd: periodEnd,
        canceledAt: null,
      },
      create: {
        tenantId,
        applicationId,
        licenseTypeId: licenseType.id,
        quantityPurchased,
        quantityAssigned: 0,
        status: 'ACTIVE',
        currentPeriodEnd: periodEnd,
      },
    });

    log(
      '',
      `${subConfig.tenant} -> ${subConfig.application}/${subConfig.license_type}: ${quantityPurchased} seat(s)`,
    );

    // Create any missing seat assignments (idempotent via the unique constraint).
    for (const user of assignees) {
      const existing = await prisma.licenseAssignment.findUnique({
        where: {
          tenantId_userId_applicationId: { tenantId, userId: user.id, applicationId },
        },
      });
      if (existing) continue;

      const assignment = await prisma.licenseAssignment.create({
        data: {
          userId: user.id,
          tenantId,
          applicationId,
          subscriptionId: subscription.id,
          licenseTypeId: licenseType.id,
          licenseTypeName: licenseType.name,
        },
      });

      // Link the entitlement row (if the user already has app access via
      // app_roles) so revoke/consistency logic matches a real grant.
      // Best-effort.
      await prisma.appAccess
        .updateMany({
          where: { tenantId, userId: user.id, applicationId },
          data: { licenseAssignmentId: assignment.id },
        })
        .catch(() => undefined);

      log('  ', `-> seat -> ${user.email}`);
    }

    // Reconcile the stored counter to the true number of assignments.
    const trueAssigned = await prisma.licenseAssignment.count({
      where: { subscriptionId: subscription.id },
    });
    if (trueAssigned !== subscription.quantityAssigned) {
      await prisma.appSubscription.update({
        where: { id: subscription.id },
        data: { quantityAssigned: trueAssigned },
      });
    }
  }
}

export const subscriptionsSeeder: Seeder = {
  name: 'subscriptions',
  shouldRun: (ctx) =>
    ctx.options.includeSubscriptions && !!ctx.config.subscriptions?.length,
  run: async (ctx) => {
    if (!ctx.config.subscriptions?.length) return;
    await seedSubscriptions(
      ctx.prisma,
      ctx.config.subscriptions,
      ctx.tenantIdMap,
      ctx.appIdMap,
    );
  },
};
