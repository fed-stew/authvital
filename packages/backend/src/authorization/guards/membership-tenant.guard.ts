import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  resolveEffectiveTenantPermissions,
  membershipIsOwner,
} from '../utils/tenant-permissions.util';

/**
 * MembershipTenantGuard - Resolves the target tenant from a `membershipId`
 * (or an explicit `tenantId`) param, then verifies the *caller* has an active
 * membership in that tenant and attaches their tenant context.
 *
 * === Why this exists ===
 * `TenantRolesController` mutates tenant roles addressed by a bare
 * `membershipId` with NO `:tenantId` in the URL. `TenantAccessGuard` keys off
 * `params.tenantId`, so it cannot protect those routes - which left the classic
 * "assign myself the Owner role" privilege-escalation path wide open. This
 * guard closes it by resolving the tenant server-side from the membership.
 *
 * === Ordering ===
 * Must run AFTER `JwtAuthGuard` (needs `request.user`) and BEFORE
 * `PermissionGuard` (which reads the `request.tenantPermissions` this guard
 * populates). It intentionally mirrors `TenantAccessGuard`'s request contract
 * so `PermissionGuard` behaves identically on both.
 */
@Injectable()
export class MembershipTenantGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user?.sub) {
      throw new ForbiddenException('Authentication required');
    }

    const tenantId = await this.resolveTenantId(request);
    if (!tenantId) {
      throw new ForbiddenException('Unable to resolve tenant context');
    }

    // Verify the CALLER (not the target membership) is an active member of the
    // resolved tenant. This is what stops a user from acting on a membership
    // that belongs to a tenant they have no business in.
    const membership = await this.prisma.membership.findFirst({
      where: {
        tenantId,
        userId: user.sub,
        status: 'ACTIVE',
      },
      include: {
        membershipTenantRoles: {
          include: {
            tenantRole: { select: { slug: true, permissions: true } },
          },
        },
      },
    });

    if (!membership) {
      throw new ForbiddenException('You do not have access to this tenant');
    }

    // Attach the same context TenantAccessGuard would, so PermissionGuard can
    // read fresh, DB-derived permissions.
    const roles = membership.membershipTenantRoles.map(
      (mtr: { tenantRole: { slug: string; permissions: string[] } }) =>
        mtr.tenantRole,
    );
    request.tenant = { id: tenantId };
    request.membership = membership;
    request.tenantPermissions = resolveEffectiveTenantPermissions(roles);
    request.isOwner = membershipIsOwner(roles);

    return true;
  }

  /**
   * Resolve the tenant for this request: prefer an explicit `tenantId` param,
   * otherwise derive it from the target `membershipId`.
   */
  private async resolveTenantId(request: {
    params?: Record<string, string>;
  }): Promise<string | null> {
    const params = request.params ?? {};

    if (params.tenantId) {
      return params.tenantId;
    }

    if (params.membershipId) {
      const target = await this.prisma.membership.findUnique({
        where: { id: params.membershipId },
        select: { tenantId: true },
      });
      if (!target) {
        throw new NotFoundException('Membership not found');
      }
      return target.tenantId;
    }

    return null;
  }
}
