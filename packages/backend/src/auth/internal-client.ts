// =============================================================================
// INTERNAL AUTH-FLOW CLIENT (app-client-split)
// =============================================================================
// Some auth flows (notably the admin-console redirect `exchange-token`) mint a
// session refresh token that is NOT tied to any customer OAuth application.
// After the Application/ApplicationClient split, `RefreshToken.applicationClientId`
// is a real FK into `application_clients`, so those internal sessions need a
// concrete credential row to point at — the old magic literal `'internal'` id
// no longer satisfies the constraint.
//
// We reserve ONE dedicated container ("internal") holding a single SPA
// credential with the well-known clientId `'internal'`. It is created here via
// an idempotent get-or-create so it:
//   * survives a fresh `migrate` + `seed` (the seeder calls this on bootstrap), and
//   * self-heals if it is somehow missing when an internal session is minted.
//
// This is the single source of truth for how the internal client is shaped —
// both the seeder and the auth controller import from here (DRY).

import { ApplicationType, PrismaClient } from '@prisma/client';

/** Reserved slug for the internal auth-flow container. */
export const INTERNAL_APP_SLUG = 'internal';

/** Human-friendly name for the reserved internal container. */
export const INTERNAL_APP_NAME = 'AuthVital Internal';

/** Reserved, well-known clientId for the internal auth-flow credential. */
export const INTERNAL_CLIENT_ID = 'internal';

// PrismaService extends PrismaClient, so both the Nest service and the raw
// seed-time PrismaClient satisfy this parameter.
type PrismaLike = Pick<PrismaClient, 'application' | 'applicationClient'>;

/**
 * Idempotently ensure the reserved internal Application container and its sole
 * SPA credential exist, returning the credential row. Safe to call on every
 * bootstrap and on every internal session mint.
 */
export async function ensureInternalClient(prisma: PrismaLike) {
  const app = await prisma.application.upsert({
    where: { slug: INTERNAL_APP_SLUG },
    update: {},
    create: {
      name: INTERNAL_APP_NAME,
      slug: INTERNAL_APP_SLUG,
      description:
        'Reserved container for AuthVital internal auth-flow sessions ' +
        '(e.g. admin-console redirect exchange). Managed by the platform — ' +
        'not a customer application.',
      isActive: true,
    },
  });

  return prisma.applicationClient.upsert({
    where: {
      applicationId_type: { applicationId: app.id, type: ApplicationType.SPA },
    },
    update: {},
    create: {
      applicationId: app.id,
      type: ApplicationType.SPA,
      clientId: INTERNAL_CLIENT_ID,
    },
  });
}
