/**
 * @authvital/sdk - Invitations Namespace
 *
 * Manage tenant invitations: send, list pending, resend, and revoke.
 */

import type { BaseClient, RequestLike } from '../base-client';
import type {
  InvitationResponse,
  PendingInvitationsResponse,
  SendInvitationParams,
  ResendInvitationParams,
  RevokeInvitationResponse,
} from '../types';

/**
 * Creates the invitations namespace with all invitation-related methods.
 *
 * @param client - The base client instance for making authenticated requests
 * @returns Object containing all invitation methods
 */
export function createInvitationsNamespace(client: BaseClient) {
  return {
    /**
     * Send an invitation to join a tenant
     *
     * Automatically validates JWT and uses tenantId from it.
     * If a user with this email already exists, uses that user.
     * If not, creates a new user with the provided details.
     * Returns only the user's sub (ID) and invitation expiry for security.
     *
     * @example
     * ```ts
     * // First, get the role ID from available roles
     * const { roles } = await authvital.memberships.getTenantRoles();
     * const adminRole = roles.find(r => r.slug === 'admin');
     *
     * const { sub, expiresAt } = await authvital.invitations.send(request, {
     *   email: 'newuser@example.com',
     *   givenName: 'John',
     *   familyName: 'Doe',
     *   roleId: adminRole?.id,  // Use role ID, not slug
     * });
     * // sub = user's ID (can be used in your app's database)
     * // expiresAt = when the invitation expires
     * ```
     */
    send: async (
      request: RequestLike,
      params: Omit<SendInvitationParams, 'tenantId'>,
    ): Promise<InvitationResponse> => {
      const claims = await client.validateRequest(request);
      return client.request<InvitationResponse>('POST', '/api/integration/invitations/send', {
        ...params,
        tenantId: claims.tenantId,
        // Auto-include clientId from SDK config (allows redirect after invite acceptance)
        // Can be overridden by explicitly passing clientId in params
        clientId: params.clientId ?? client.config.clientId,
      });
    },

    /**
     * Get all pending invitations for a tenant
     *
     * Automatically validates JWT and uses tenantId from it.
     *
     * @example
     * ```ts
     * const { invitations, totalCount } = await authvital.invitations.listPending(request);
     * ```
     */
    listPending: async (request: RequestLike): Promise<PendingInvitationsResponse> => {
      const claims = await client.validateRequest(request);
      const params = new URLSearchParams({ tenantId: claims.tenantId });
      return client.request<PendingInvitationsResponse>(
        'GET',
        `/api/integration/invitations/pending?${params.toString()}`,
      );
    },

    /**
     * Resend an invitation (generates new token, extends expiry)
     *
     * Automatically validates JWT and uses tenantId from it.
     * Returns the new expiration date
     *
     * @example
     * ```ts
     * const { expiresAt } = await authvital.invitations.resend(request, {
     *   invitationId: 'inv-123',
     *   expiresInDays: 7,
     * });
     * ```
     */
    resend: async (
      request: RequestLike,
      params: ResendInvitationParams,
    ): Promise<{ expiresAt: string }> => {
      // Validate JWT even though we don't use the claims (security check)
      await client.validateRequest(request);
      return client.request<{ expiresAt: string }>(
        'POST',
        '/api/integration/invitations/resend',
        params,
      );
    },

    /**
     * Revoke an invitation
     *
     * @example
     * ```ts
     * await authvital.invitations.revoke(request, 'inv-123');
     * ```
     */
    revoke: async (
      request: RequestLike,
      invitationId: string,
    ): Promise<RevokeInvitationResponse> => {
      // Validate JWT even though we don't use the claims (security check)
      await client.validateRequest(request);
      return client.request<RevokeInvitationResponse>(
        'DELETE',
        `/api/integration/invitations/${encodeURIComponent(invitationId)}`,
      );
    },
  };
}

export type InvitationsNamespace = ReturnType<typeof createInvitationsNamespace>;
