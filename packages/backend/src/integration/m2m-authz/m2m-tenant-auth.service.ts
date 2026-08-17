import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Deny-by-default authorization for M2M clients acting on a specific tenant.
 *
 * An M2M client (identified by its OAuth clientId) may only operate on a tenant
 * when either:
 *   - the Application is flagged `m2mTrustedAllTenants` (global trust), OR
 *   - an explicit `M2mTenantGrant` exists for (application, tenant).
 *
 * Anything else is denied.
 */
@Injectable()
export class M2mTenantAuthService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Assert that the M2M client is authorized to act on the given tenant.
   * Throws ForbiddenException when access is not permitted.
   */
  async assertTenantAccess(clientId: string, tenantId: string): Promise<void> {
    // M2M authz lives on the (MACHINE) ApplicationClient identified by clientId.
    const app = await this.prisma.applicationClient.findUnique({
      where: { clientId },
      select: { id: true, m2mTrustedAllTenants: true },
    });

    if (!app) {
      throw new ForbiddenException('Unknown M2M client');
    }

    if (app.m2mTrustedAllTenants === true) {
      return;
    }

    const grant = await this.prisma.m2mTenantGrant.findUnique({
      where: {
        applicationClientId_tenantId: {
          applicationClientId: app.id,
          tenantId,
        },
      },
    });

    if (grant) {
      return;
    }

    throw new ForbiddenException(
      `M2M client is not authorized for tenant '${tenantId}'`,
    );
  }

  /**
   * Non-throwing variant of {@link assertTenantAccess}, useful for filtering.
   * Returns true when the client may act on the tenant, false otherwise.
   */
  async hasTenantAccess(clientId: string, tenantId: string): Promise<boolean> {
    const app = await this.prisma.applicationClient.findUnique({
      where: { clientId },
      select: { id: true, m2mTrustedAllTenants: true },
    });

    if (!app) {
      return false;
    }

    if (app.m2mTrustedAllTenants === true) {
      return true;
    }

    const grant = await this.prisma.m2mTenantGrant.findUnique({
      where: {
        applicationClientId_tenantId: {
          applicationClientId: app.id,
          tenantId,
        },
      },
    });

    return grant !== null;
  }

  /**
   * Assert that the M2M client is trusted to act across ALL tenants.
   * Used by cross-tenant endpoints where no single tenant is targeted.
   * Throws ForbiddenException when the client is unknown or not globally trusted.
   */
  async assertAllTenants(clientId: string): Promise<void> {
    const app = await this.prisma.applicationClient.findUnique({
      where: { clientId },
      select: { id: true, m2mTrustedAllTenants: true },
    });

    if (!app) {
      throw new ForbiddenException('Unknown M2M client');
    }

    if (!app.m2mTrustedAllTenants) {
      throw new ForbiddenException(
        'M2M client is not authorized for cross-tenant access',
      );
    }
  }
}
