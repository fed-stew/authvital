import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma';

/**
 * TenantAccessGuard - Verifies user has access to the requested tenant
 *
 * This guard checks:
 * 1. The tenant exists
 * 2. The user has an active membership in the tenant
 *
 * Attaches tenant info and membership to the request for downstream use.
 */
@Injectable()
export class TenantAccessGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const tenantId = request.params.tenantId;

    if (!user?.sub) {
      throw new ForbiddenException('Authentication required');
    }

    if (!tenantId) {
      throw new ForbiddenException('Tenant ID required');
    }

    // Check if tenant exists
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, slug: true },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant not found`);
    }

    // Check if user has membership in this tenant
    const membership = await this.prisma.membership.findFirst({
      where: {
        tenantId,
        userId: user.sub,
        status: { in: ['ACTIVE', 'INVITED'] },
      },
      include: {
        membershipTenantRoles: {
          include: {
            tenantRole: {
              select: {
                id: true,
                name: true,
                slug: true,
                permissions: true,
              },
            },
          },
        },
      },
    });

    if (!membership) {
      throw new ForbiddenException('You do not have access to this tenant');
    }

    // Attach tenant and membership to request for use in controllers/services
    request.tenant = tenant;
    request.membership = membership;
    request.tenantPermissions = membership.membershipTenantRoles.flatMap(
      (mtr: { tenantRole: { permissions: string[] } }) => mtr.tenantRole.permissions,
    );
    request.isOwner = membership.membershipTenantRoles.some(
      (mtr: { tenantRole: { slug: string } }) => mtr.tenantRole.slug === 'owner',
    );

    return true;
  }
}
