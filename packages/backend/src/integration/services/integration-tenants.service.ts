import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { InstanceService } from '../../instance/instance.service';
import { buildInitiateLoginUri, MembershipInfoInternal } from '../types';
import type { MembershipRole } from '@authvital/shared';

/** Shape of membershipRole when role and application are included */
interface MembershipRoleWithRelations {
  id: string;
  role: {
    id: string;
    name: string;
    slug: string;
    application: {
      id: string;
      name: string;
    };
  };
}

/**
 * Handles tenant and membership queries for M2M integration.
 */
@Injectable()
export class IntegrationTenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly instanceService: InstanceService,
  ) {}

  /**
   * Validate that a user is a member of a tenant
   */
  async validateMembership(
    userId: string,
    tenantId: string,
  ): Promise<{
    isMember: boolean;
    membership: {
      id: string;
      status: string;
      joinedAt: Date | null;
    } | null;
  }> {
    const membership = await this.prisma.membership.findFirst({
      where: {
        userId,
        tenantId,
      },
    });

    if (!membership) {
      return { isMember: false, membership: null };
    }

    return {
      isMember: membership.status === 'ACTIVE',
      membership: {
        id: membership.id,
        status: membership.status,
        joinedAt: membership.joinedAt,
      },
    };
  }

  /**
   * Get all memberships for a tenant
   * Returns user info, roles, and membership status for all members
   */
  async getTenantMemberships(
    tenantId: string,
    options?: {
      status?: 'ACTIVE' | 'INVITED' | 'SUSPENDED';
      includeRoles?: boolean;
    },
  ): Promise<{
    tenantId: string;
    tenantName: string;
    tenantSlug: string;
    initiateLoginUri: string | null;
    memberships: MembershipInfoInternal[];
    totalCount: number;
  }> {
    // Get instance branding for initiateLoginUri fallback
    const instanceBranding = await this.instanceService.getBrandingConfig();

    // Get tenant
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
        slug: true,
        initiateLoginUri: true,
      },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    // Build the query
    const whereClause: Prisma.MembershipWhereInput = { tenantId };
    if (options?.status) {
      whereClause.status = options.status;
    }

    const memberships = await this.prisma.membership.findMany({
      where: whereClause,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            givenName: true,
            familyName: true,
          },
        },
        membershipRoles: options?.includeRoles !== false ? {
          include: {
            role: {
              include: {
                application: {
                  select: { id: true, name: true },
                },
              },
            },
          },
        } : false,
      },
      orderBy: { createdAt: 'asc' },
    });

    return {
      tenantId: tenant.id,
      tenantName: tenant.name,
      tenantSlug: tenant.slug,
      initiateLoginUri: buildInitiateLoginUri(
        tenant.slug,
        tenant.initiateLoginUri,
        instanceBranding.initiateLoginUri,
      ),
      memberships: memberships.map((m) => ({
        id: m.id,
        status: m.status,
        joinedAt: m.joinedAt,
        createdAt: m.createdAt,
        user: {
          id: m.user.id,
          email: m.user.email,
          givenName: m.user.givenName,
          familyName: m.user.familyName,
        },
        roles: options?.includeRoles !== false && m.membershipRoles
          ? (m.membershipRoles as unknown as MembershipRoleWithRelations[]).map((mr) => ({
              id: mr.role.id,
              name: mr.role.name,
              slug: mr.role.slug,
              applicationId: mr.role.application.id,
              applicationName: mr.role.application.name,
            }))
          : [],
      })),
      totalCount: memberships.length,
    };
  }

  /**
   * Get all memberships that have roles for a specific application
   * Identified by client_id
   */
  async getApplicationMemberships(
    clientId: string,
    options?: {
      status?: 'ACTIVE' | 'INVITED' | 'SUSPENDED';
      tenantId?: string; // Filter to a specific tenant
    },
  ): Promise<{
    applicationId: string;
    applicationName: string;
    clientId: string;
    memberships: Array<{
      id: string;
      status: string;
      joinedAt: Date | null;
      createdAt: Date;
      user: {
        id: string;
        email: string | null;
        givenName: string | null;
        familyName: string | null;
      };
      tenant: {
        id: string;
        name: string;
        slug: string;
        initiateLoginUri: string | null;
      };
      roles: MembershipRole[];
    }>;
    totalCount: number;
  }> {
    // Get instance branding for initiateLoginUri fallback
    const instanceBranding = await this.instanceService.getBrandingConfig();

    // Get the application
    const application = await this.prisma.application.findUnique({
      where: { clientId },
      select: { id: true, name: true, clientId: true },
    });

    if (!application) {
      throw new NotFoundException('Application not found');
    }

    // Build the query - find memberships that have roles for this application
    const whereClause: Prisma.MembershipWhereInput = {
      membershipRoles: {
        some: {
          role: {
            applicationId: application.id,
          },
        },
      },
    };

    if (options?.status) {
      whereClause.status = options.status;
    }

    if (options?.tenantId) {
      whereClause.tenantId = options.tenantId;
    }

    const memberships = await this.prisma.membership.findMany({
      where: whereClause,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            givenName: true,
            familyName: true,
          },
        },
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
            initiateLoginUri: true,
          },
        },
        membershipRoles: {
          where: {
            role: {
              applicationId: application.id,
            },
          },
          include: {
            role: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return {
      applicationId: application.id,
      applicationName: application.name,
      clientId: application.clientId,
      memberships: memberships.map((m) => ({
        id: m.id,
        status: m.status,
        joinedAt: m.joinedAt,
        createdAt: m.createdAt,
        user: {
          id: m.user.id,
          email: m.user.email,
          givenName: m.user.givenName,
          familyName: m.user.familyName,
        },
        tenant: {
          id: m.tenant.id,
          name: m.tenant.name,
          slug: m.tenant.slug,
          initiateLoginUri: buildInitiateLoginUri(
            m.tenant.slug,
            m.tenant.initiateLoginUri,
            instanceBranding.initiateLoginUri,
          ),
        },
        roles: m.membershipRoles.map((mr) => ({
          id: mr.role.id,
          name: mr.role.name,
          slug: mr.role.slug,
        })),
      })),
      totalCount: memberships.length,
    };
  }

  /**
   * Get all tenants for a user
   * Returns tenant info, roles, and membership status for all user's memberships
   */
  async getUserTenants(
    userId: string,
    options?: {
      status?: 'ACTIVE' | 'INVITED' | 'SUSPENDED';
      includeRoles?: boolean;
    },
  ): Promise<{
    userId: string;
    memberships: Array<{
      id: string;
      status: string;
      joinedAt: Date | null;
      createdAt: Date;
      tenant: {
        id: string;
        name: string;
        slug: string;
        initiateLoginUri: string | null;
      };
      roles: MembershipRole[];
    }>;
    totalCount: number;
  }> {
    // Get instance branding for initiateLoginUri fallback
    const instanceBranding = await this.instanceService.getBrandingConfig();

    // Verify user exists
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Build the query
    const whereClause: Prisma.MembershipWhereInput = { userId };
    if (options?.status) {
      whereClause.status = options.status;
    }

    const memberships = await this.prisma.membership.findMany({
      where: whereClause,
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
            initiateLoginUri: true,
          },
        },
        membershipRoles: options?.includeRoles !== false ? {
          include: {
            role: {
              include: {
                application: {
                  select: { id: true, name: true },
                },
              },
            },
          },
        } : false,
      },
      orderBy: { createdAt: 'asc' },
    });

    return {
      userId: user.id,
      memberships: memberships.map((m) => ({
        id: m.id,
        status: m.status,
        joinedAt: m.joinedAt,
        createdAt: m.createdAt,
        tenant: {
          id: m.tenant.id,
          name: m.tenant.name,
          slug: m.tenant.slug,
          initiateLoginUri: buildInitiateLoginUri(
            m.tenant.slug,
            m.tenant.initiateLoginUri,
            instanceBranding.initiateLoginUri,
          ),
        },
        roles: options?.includeRoles !== false && m.membershipRoles
          ? (m.membershipRoles as unknown as MembershipRoleWithRelations[]).map((mr) => ({
              id: mr.role.id,
              name: mr.role.name,
              slug: mr.role.slug,
              applicationId: mr.role.application.id,
              applicationName: mr.role.application.name,
            }))
          : [],
      })),
      totalCount: memberships.length,
    };
  }
}
