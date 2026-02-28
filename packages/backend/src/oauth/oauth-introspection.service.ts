import {
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { KeyService } from './key.service';

/**
 * Handles OAuth token introspection (RFC 7662) and validation.
 *
 * Provides:
 * - JWT validation (signature verification)
 * - Token introspection endpoint support
 * - OIDC UserInfo endpoint support
 */
@Injectable()
export class OAuthIntrospectionService {
  private readonly issuer: string;
  private readonly logger = new Logger(OAuthIntrospectionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly keyService: KeyService,
    private readonly configService: ConfigService,
  ) {
    this.issuer = this.configService.getOrThrow<string>('BASE_URL');
  }

  /**
   * Validate JWT token - verifies RSA signature
   * Returns user info if valid, null if invalid/forged
   */
  async validateJwt(
    token: string,
  ): Promise<{
    userId: string;
    email: string | null;
    clientId?: string;
    scope?: string;
  } | null> {
    try {
      const payload = await this.keyService.verifyJwt(token, this.issuer);
      if (!payload) {
        return null;
      }

      return {
        userId: payload.sub as string,
        email: (payload.email as string) || null,
        clientId: payload.client_id as string,
        scope: payload.scope as string,
      };
    } catch {
      return null; // Invalid, expired, or forged token
    }
  }

  /**
   * Validate OAuth access token (RS256) - async version with proper signature verification
   */
  async validateAccessToken(
    token: string,
  ): Promise<{
    userId: string;
    email: string | null;
    clientId?: string;
    scope?: string;
  } | null> {
    try {
      const payload = await this.keyService.verifyJwt(token, this.issuer);
      return {
        userId: payload.sub as string,
        email: (payload.email as string) || null,
        clientId: payload.client_id as string,
        scope: payload.scope as string,
      };
    } catch {
      return null;
    }
  }

  /**
   * Introspect a token - validate and return token metadata
   * Used by resource servers to validate tokens (RFC 7662)
   */
  async introspect(token: string, _tokenTypeHint?: string) {
    // Try to decode as JWT first
    try {
      const decoded = await this.keyService.verifyJwt(token, this.issuer);

      if (!decoded) {
        return { active: false };
      }

      // Get user with their memberships and roles
      const user = await this.prisma.user.findUnique({
        where: { id: decoded.sub as string },
        include: {
          memberships: {
            where: { status: 'ACTIVE' },
            include: {
              tenant: true,
              membershipRoles: {
                include: {
                  role: true,
                },
              },
            },
          },
        },
      });

      if (!user) {
        return { active: false };
      }

      // Collect roles by tenant (no permissions - roles are just identifiers now)
      const rolesByTenant: Record<string, string[]> = {};
      const tenants: Array<{ id: string; slug: string; name: string }> = [];

      for (const membership of user.memberships) {
        const roles = membership.membershipRoles.map((mr) => mr.role.slug);
        rolesByTenant[membership.tenant.id] = [...new Set(roles)];
        tenants.push({
          id: membership.tenant.id,
          slug: membership.tenant.slug,
          name: membership.tenant.name,
        });
      }

      return {
        active: true,
        sub: user.id,
        email: user.email,
        // OIDC standard claims
        given_name: user.givenName,
        family_name: user.familyName,
        iat: decoded.iat,
        exp: decoded.exp,
        aud: decoded.aud,
        iss: decoded.iss,
        scope: decoded.scope,
        tenants,
        rolesByTenant,
        isAnonymous: user.isAnonymous,
        isMachine: user.isMachine,
      };
    } catch {
      // Token is invalid or expired
      return { active: false };
    }
  }

  /**
   * Get user info (OIDC UserInfo endpoint)
   */
  async getUserInfo(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        memberships: {
          where: { status: 'ACTIVE' },
          include: {
            tenant: {
              select: { id: true, name: true, slug: true },
            },
            membershipRoles: {
              include: {
                role: {
                  select: { id: true, name: true, slug: true },
                },
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      sub: user.id,
      email: user.email,
      email_verified: true, // TODO: implement email verification
      name:
        [user.givenName, user.familyName].filter(Boolean).join(' ') ||
        undefined,
      given_name: user.givenName,
      family_name: user.familyName,
      phone_number: user.phone,
      updated_at: Math.floor(user.updatedAt.getTime() / 1000),
      tenants: user.memberships.map((m) => ({
        id: m.tenant.id,
        name: m.tenant.name,
        slug: m.tenant.slug,
        roles: m.membershipRoles.map((mr) => ({
          id: mr.role.id,
          name: mr.role.name,
          slug: mr.role.slug,
        })),
      })),
    };
  }

  /**
   * Get user's tenants (for separate /tenants endpoint)
   * Returns only tenant_id and tenant_name for each tenant the user belongs to
   */
  async getTenants(
    userId: string,
  ): Promise<{ tenants: Array<{ tenant_id: string; tenant_name: string }> }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        memberships: {
          where: { status: 'ACTIVE' },
          include: {
            tenant: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      tenants: user.memberships.map((m) => ({
        tenant_id: m.tenant.id,
        tenant_name: m.tenant.name,
      })),
    };
  }
}
