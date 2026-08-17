import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma';

/**
 * TenantIdentifierGuard - Normalises the tenant identifier on the request.
 *
 * Tenant-scoped URLs are addressed by tenant SLUG (the public, human-readable
 * pattern, e.g. `/api/tenants/acme/overview`). Internally every table joins on
 * the stable tenant `id` (UUID), so this guard resolves the slug to that id
 * ONCE, at the boundary, and rewrites it on the request. Downstream guards
 * (TenantAccessGuard, PermissionGuard, ...), `@Param('tenantId')` handlers and
 * services then all operate on the canonical id with no changes.
 *
 * Placed immediately AFTER JwtAuthGuard and BEFORE TenantAccessGuard /
 * PermissionGuard on every tenant-scoped controller, e.g.
 * `@UseGuards(JwtAuthGuard, TenantIdentifierGuard, TenantAccessGuard, PermissionGuard)`.
 * Ordering matters: auth first (so unknown slugs don't leak to anonymous
 * callers), then resolve, then access/permission checks that rely on the id.
 *
 * Behaviour:
 * - No `tenantId` on the request -> no-op (allows the request through).
 * - Value already a UUID -> left as-is (backward compatible with id-based URLs).
 * - Value is a slug -> resolved to the tenant id (404 if the tenant is unknown).
 *
 * Note: `req.params` and `req.body` are safely mutable under Express 5; the
 * resolved slug is also exposed as `req.tenantSlug` for anything that wants the
 * original human-readable value.
 */
@Injectable()
export class TenantIdentifierGuard implements CanActivate {
  // RFC 4122 UUID (any version). Tenant slugs are lowercase [a-z0-9-] and can
  // never match this, so it cleanly distinguishes id-vs-slug.
  private static readonly UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    const raw: unknown =
      request.params?.tenantId ?? request.body?.tenantId;

    // Nothing to resolve, or already a canonical id -> let it pass untouched.
    if (typeof raw !== 'string' || raw.length === 0) {
      return true;
    }
    if (TenantIdentifierGuard.UUID_RE.test(raw)) {
      return true;
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: raw },
      select: { id: true, slug: true },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant '${raw}' not found`);
    }

    // Rewrite everywhere the slug may appear so downstream code sees the id.
    if (request.params?.tenantId === raw) {
      request.params.tenantId = tenant.id;
    }
    if (request.body && request.body.tenantId === raw) {
      request.body.tenantId = tenant.id;
    }
    request.tenantSlug = tenant.slug;

    return true;
  }
}
