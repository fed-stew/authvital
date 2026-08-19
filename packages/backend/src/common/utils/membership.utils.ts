import { PrismaService } from '../../prisma/prisma.service';

/**
 * Tenant-first login primitive.
 *
 * The single source of truth for "does this user belong to ANY organization?".
 * Both the IdP console login flow (AuthFlowService) and the OAuth authorize
 * endpoint (OAuthController) consult this before deciding where to send the
 * user — so a corrupted / zero-membership session is caught in exactly one
 * place instead of two subtly different ones.
 *
 * A user with zero active memberships cannot be scoped to a tenant, so the
 * caller should route them to the "create your first organization" experience
 * rather than an app-picker that would render empty.
 */
export async function hasActiveMembership(
  prisma: PrismaService,
  userId: string,
): Promise<boolean> {
  const count = await prisma.membership.count({
    where: { userId, status: 'ACTIVE' },
  });
  return count > 0;
}
