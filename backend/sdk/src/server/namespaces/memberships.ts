/**
 * @authvader/sdk - Memberships Namespace
 *
 * Manage tenant and application memberships, roles, and user access.
 */

import { appendClientIdToUri, type BaseClient, type RequestLike } from '../base-client';
import type {
  TenantMembershipsResponse,
  ApplicationMembershipsResponse,
  ValidateMembershipResponse,
  UserTenantsResponse,
  TenantRolesResponse,
  ApplicationRolesResponse,
  SetMemberRoleResponse,
} from '../types';

/**
 * Creates the memberships namespace with all membership-related methods.
 *
 * @param client - The base client instance for making authenticated requests
 * @returns Object containing all membership methods
 */
export function createMembershipsNamespace(client: BaseClient) {
  return {
    /**
     * Get all memberships for the authenticated user's tenant
     *
     * Automatically validates JWT and uses tenantId from it.
     *
     * @param request - The incoming HTTP request
     * @param options - Optional filters and configuration
     *
     * @example
     * ```ts
     * app.get('/api/team', async (req, res) => {
     *   const members = await authvader.memberships.listForTenant(req, {
     *     status: 'ACTIVE',
     *   });
     *   res.json(members);
     * });
     * ```
     */
    listForTenant: async (
      request: RequestLike,
      options?: {
        status?: 'ACTIVE' | 'INVITED' | 'SUSPENDED';
        includeRoles?: boolean;
        /** Append client_id to initiateLoginUri using SDK's configured clientId */
        appendClientId?: boolean;
      },
    ): Promise<TenantMembershipsResponse> => {
      const claims = await client.validateRequest(request);
      const params = new URLSearchParams({ tenantId: claims.tenantId });
      if (options?.status) params.set('status', options.status);
      if (options?.includeRoles !== undefined)
        params.set('includeRoles', String(options.includeRoles));

      const response = await client.request<TenantMembershipsResponse>(
        'GET',
        `/api/integration/tenant-memberships?${params.toString()}`,
      );

      // Append client_id to initiateLoginUri if requested
      if (options?.appendClientId && response.initiateLoginUri) {
        response.initiateLoginUri = appendClientIdToUri(
          response.initiateLoginUri,
          client.config.clientId,
        );
      }

      return response;
    },

    /**
     * Get all memberships for your application in the authenticated user's tenant
     *
     * Automatically uses clientId from SDK config and tenantId from the validated JWT.
     *
     * @param request - The incoming HTTP request
     * @param options - Optional filters and configuration
     *
     * @example
     * ```ts
     * app.get('/api/members', async (req, res) => {
     *   const { memberships } = await authvader.memberships.listForApplication(req);
     *   res.json(memberships);
     * });
     * ```
     */
    listForApplication: async (
      request: RequestLike,
      options?: {
        status?: 'ACTIVE' | 'INVITED' | 'SUSPENDED';
        /** Append client_id to each tenant's initiateLoginUri using SDK's configured clientId */
        appendClientId?: boolean;
      },
    ): Promise<ApplicationMembershipsResponse> => {
      const claims = await client.validateRequest(request);
      const params = new URLSearchParams({
        clientId: client.config.clientId,
        tenantId: claims.tenantId,
      });
      if (options?.status) params.set('status', options.status);

      const response = await client.request<ApplicationMembershipsResponse>(
        'GET',
        `/api/integration/application-memberships?${params.toString()}`,
      );

      // Append client_id to each tenant's initiateLoginUri if requested
      if (options?.appendClientId) {
        response.memberships = response.memberships.map((m) => ({
          ...m,
          tenant: {
            ...m.tenant,
            initiateLoginUri: appendClientIdToUri(m.tenant.initiateLoginUri, client.config.clientId),
          },
        }));
      }

      return response;
    },

    /**
     * Validate that the authenticated user is a member of their tenant
     *
     * @param request - The incoming HTTP request
     */
    validate: async (request: RequestLike): Promise<ValidateMembershipResponse> => {
      const claims = await client.validateRequest(request);
      const params = new URLSearchParams({ userId: claims.sub, tenantId: claims.tenantId });
      return client.request('GET', `/api/integration/validate-membership?${params.toString()}`);
    },

    /**
     * Get all tenants for the authenticated user
     *
     * Returns all tenants the user is a member of, with optional role information.
     *
     * @param request - The incoming HTTP request
     * @param options - Optional filters and configuration
     *
     * @example
     * ```ts
     * app.get('/api/my-tenants', async (req, res) => {
     *   const result = await authvader.memberships.listTenantsForUser(req, {
     *     status: 'ACTIVE',
     *     appendClientId: true,
     *   });
     *   res.json(result.memberships);
     * });
     * ```
     */
    listTenantsForUser: async (
      request: RequestLike,
      options?: {
        status?: 'ACTIVE' | 'INVITED' | 'SUSPENDED';
        includeRoles?: boolean;
        /** Append client_id to each tenant's initiateLoginUri using SDK's configured clientId */
        appendClientId?: boolean;
      },
    ): Promise<UserTenantsResponse> => {
      const claims = await client.validateRequest(request);
      const params = new URLSearchParams({ userId: claims.sub });
      if (options?.status) params.set('status', options.status);
      if (options?.includeRoles !== undefined)
        params.set('includeRoles', String(options.includeRoles));

      const response = await client.request<UserTenantsResponse>(
        'GET',
        `/api/integration/user-tenants?${params.toString()}`,
      );

      // Append client_id to each tenant's initiateLoginUri if requested
      if (options?.appendClientId) {
        response.memberships = response.memberships.map((m) => ({
          ...m,
          tenant: {
            ...m.tenant,
            initiateLoginUri: appendClientIdToUri(m.tenant.initiateLoginUri, client.config.clientId),
          },
        }));
      }

      return response;
    },

    /**
     * Get all available tenant roles (IDP-level)
     *
     * Returns the role definitions (owner, admin, member, etc.) that can be
     * assigned to memberships. These are instance-wide, not tenant-specific.
     * Use this to populate a role picker dropdown.
     *
     * @example
     * ```ts
     * app.get('/api/roles', async (req, res) => {
     *   const { roles } = await authvader.memberships.getTenantRoles();
     *   res.json(roles);
     *   // [{ slug: 'owner', name: 'Owner', ... }, { slug: 'admin', ... }, ...]
     * });
     * ```
     */
    getTenantRoles: async (): Promise<TenantRolesResponse> => {
      return client.request<TenantRolesResponse>('GET', '/api/integration/tenant-roles');
    },

    /**
     * Get all roles for your application
     *
     * Returns the role definitions (admin, editor, viewer, etc.) specific to
     * your application. Uses the clientId from SDK config automatically.
     * Use this to populate a role picker for invite flows or role assignment.
     *
     * NOTE: These are APPLICATION-specific roles, different from tenant roles
     * (owner/admin/member). Application roles are used for fine-grained
     * permissions within your app.
     *
     * @example
     * ```ts
     * app.get('/api/app-roles', async (req, res) => {
     *   const { roles } = await authvader.memberships.getApplicationRoles();
     *   res.json(roles);
     *   // [{ slug: 'admin', name: 'Admin', permissions: [...] }, ...]
     * });
     *
     * // Use in invite flow:
     * const { roles } = await authvader.memberships.getApplicationRoles();
     * const editorRole = roles.find(r => r.slug === 'editor');
     * await authvader.invitations.send(request, {
     *   email: 'user@example.com',
     *   roleId: editorRole?.id,
     * });
     * ```
     */
    getApplicationRoles: async (): Promise<ApplicationRolesResponse> => {
      const params = new URLSearchParams({ clientId: client.config.clientId });
      return client.request<ApplicationRolesResponse>(
        'GET',
        `/api/integration/application-roles?${params.toString()}`,
      );
    },

    /**
     * Set a member's tenant role (replaces any existing roles)
     *
     * Performs a pre-flight check using the caller's JWT to catch obvious
     * permission violations before calling the IDP. The IDP then does the
     * full authoritative check (e.g., admin can't demote an owner).
     *
     * Role hierarchy: owner > admin > member
     * - Owners can change anyone's role
     * - Admins can change admins and members, but cannot touch owners or promote to owner
     * - Members cannot change roles
     *
     * @param request - The incoming HTTP request (used to read caller's JWT)
     * @param membershipId - The membership to update
     * @param roleSlug - The role slug to set (e.g., 'admin', 'member', 'owner')
     *
     * @example
     * ```ts
     * app.put('/api/team/:membershipId/role', async (req, res) => {
     *   const result = await authvader.memberships.setMemberRole(
     *     req,
     *     req.params.membershipId,
     *     req.body.role, // e.g., 'admin'
     *   );
     *   res.json(result.role); // { id, name, slug }
     * });
     * ```
     */
    setMemberRole: async (
      request: RequestLike,
      membershipId: string,
      roleSlug: string,
    ): Promise<SetMemberRoleResponse> => {
      const claims = await client.validateRequest(request);
      const callerRoles = (claims.payload.tenant_roles as string[]) ?? [];

      // Pre-flight: caller must be at least admin
      const isOwner = callerRoles.includes('owner');
      const isAdmin = callerRoles.includes('admin');

      if (!isOwner && !isAdmin) {
        throw new Error(
          'Insufficient permissions: only owners and admins can change member roles',
        );
      }

      // Pre-flight: only owners can promote to owner
      if (!isOwner && roleSlug === 'owner') {
        throw new Error('Insufficient permissions: only owners can promote to owner');
      }

      // IDP handles the rest (target's current role, last owner protection, etc.)
      return client.request<SetMemberRoleResponse>(
        'PUT',
        `/api/integration/memberships/${encodeURIComponent(membershipId)}/tenant-role`,
        { roleSlug, callerUserId: claims.sub },
      );
    },
  };
}

export type MembershipsNamespace = ReturnType<typeof createMembershipsNamespace>;
