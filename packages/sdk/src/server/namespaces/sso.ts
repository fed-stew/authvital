/**
 * @authvital/sdk - SSO Namespace
 *
 * Single Sign-On operations for users (linking/unlinking accounts).
 */

import type { BaseClient, RequestLike } from '../base-client';

/**
 * Available SSO provider info.
 */
export interface SsoProvider {
  provider: 'GOOGLE' | 'MICROSOFT';
  enabled: boolean;
  name: string;
}

/**
 * Linked SSO account info.
 */
export interface SsoLink {
  provider: 'GOOGLE' | 'MICROSOFT';
  email: string;
  displayName: string;
  avatarUrl?: string;
  linkedAt: string;
  lastUsedAt?: string;
}

/**
 * Creates the SSO namespace with user-facing SSO methods.
 *
 * @param client - The base client instance for making authenticated requests
 * @returns Object containing all SSO methods
 */
export function createSsoNamespace(client: BaseClient) {
  return {
    /**
     * Get available SSO providers for the instance.
     *
     * Use this to show SSO buttons on login page.
     *
     * @example
     * ```ts
     * const providers = await authvital.sso.getAvailableProviders();
     * // [{ provider: 'GOOGLE', enabled: true }, { provider: 'MICROSOFT', enabled: true }]
     * ```
     */
    getAvailableProviders: async (): Promise<SsoProvider[]> => {
      return client.request<SsoProvider[]>('GET', '/api/sso/providers');
    },

    /**
     * Get available SSO providers for a specific tenant.
     *
     * @param tenantSlug - The tenant slug or subdomain
     *
     * @example
     * ```ts
     * const providers = await authvital.sso.getProvidersForTenant('acme-corp');
     * if (providers[0]?.enforced) {
     *   // Only show SSO button, hide password login
     * }
     * ```
     */
    getProvidersForTenant: async (
      tenantSlug: string,
    ): Promise<(SsoProvider & { enforced: boolean })[]> => {
      return client.request<(SsoProvider & { enforced: boolean })[]>(
        'GET',
        `/api/tenants/${encodeURIComponent(tenantSlug)}/sso/providers`,
      );
    },

    /**
     * Get SSO accounts linked to the current user.
     *
     * @param request - The incoming HTTP request
     *
     * @example
     * ```ts
     * app.get('/api/me/sso-links', async (req, res) => {
     *   const links = await authvital.sso.getLinkedAccounts(req);
     *   res.json(links);
     * });
     * ```
     */
    getLinkedAccounts: async (request: RequestLike): Promise<SsoLink[]> => {
      await client.validateRequest(request);
      return client.request<SsoLink[]>('GET', '/api/users/me/sso');
    },

    /**
     * Initiate linking an SSO provider to the current user's account.
     *
     * Returns a URL to redirect the user to for OAuth.
     *
     * @param request - The incoming HTTP request
     * @param params - Link parameters
     *
     * @example
     * ```ts
     * app.post('/api/me/link-sso', async (req, res) => {
     *   const { url } = await authvital.sso.initiateLink(req, {
     *     provider: 'GOOGLE',
     *     redirectUri: 'https://app.example.com/settings/account',
     *   });
     *   res.json({ url });
     * });
     * ```
     */
    initiateLink: async (
      request: RequestLike,
      params: {
        provider: 'GOOGLE' | 'MICROSOFT';
        redirectUri: string;
      },
    ): Promise<{ url: string }> => {
      await client.validateRequest(request);
      return client.request<{ url: string }>('POST', '/api/users/me/sso/link', params);
    },

    /**
     * Unlink an SSO provider from the current user's account.
     *
     * User must have a password set to unlink SSO.
     *
     * @param request - The incoming HTTP request
     * @param provider - The provider to unlink
     *
     * @example
     * ```ts
     * app.delete('/api/me/sso/:provider', async (req, res) => {
     *   await authvital.sso.unlink(req, req.params.provider as 'GOOGLE' | 'MICROSOFT');
     *   res.json({ success: true });
     * });
     * ```
     */
    unlink: async (
      request: RequestLike,
      provider: 'GOOGLE' | 'MICROSOFT',
    ): Promise<{ success: boolean }> => {
      await client.validateRequest(request);
      return client.request<{ success: boolean }>(
        'DELETE',
        `/api/users/me/sso/${provider.toLowerCase()}`,
      );
    },

    /**
     * Get the SSO login URL for a provider.
     *
     * Use this to redirect users to SSO login.
     *
     * @param provider - The SSO provider
     * @param params - Login parameters
     *
     * @example
     * ```ts
     * const url = authvital.sso.getLoginUrl('GOOGLE', {
     *   redirectUri: 'https://app.example.com/callback',
     *   state: crypto.randomUUID(),
     * });
     * // Redirect user to url
     * ```
     */
    getLoginUrl: (
      provider: 'GOOGLE' | 'MICROSOFT',
      params: {
        redirectUri: string;
        state?: string;
        tenantSlug?: string;
      },
    ): string => {
      const url = new URL(
        `/sso/${provider.toLowerCase()}/authorize`,
        client.config.authVitalHost,
      );
      url.searchParams.set('client_id', client.config.clientId);
      url.searchParams.set('redirect_uri', params.redirectUri);
      if (params.state) url.searchParams.set('state', params.state);
      if (params.tenantSlug) url.searchParams.set('tenant', params.tenantSlug);
      return url.toString();
    },
  };
}

export type SsoNamespace = ReturnType<typeof createSsoNamespace>;
