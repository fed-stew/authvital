/**
 * @authvital/sdk - Tenants Namespace
 *
 * Tenant CRUD operations and configuration.
 */

import type { BaseClient, RequestLike } from '../base-client';

/**
 * Tenant details.
 */
export interface Tenant {
  id: string;
  name: string;
  slug: string;
  settings: Record<string, unknown>;
  mfaPolicy: 'OPTIONAL' | 'REQUIRED' | 'ENFORCED_AFTER_GRACE';
  mfaGracePeriodDays?: number;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Tenant creation parameters.
 */
export interface CreateTenantParams {
  name: string;
  slug?: string;
}

/**
 * Tenant update parameters.
 */
export interface UpdateTenantParams {
  name?: string;
  settings?: Record<string, unknown>;
  mfaPolicy?: 'OPTIONAL' | 'REQUIRED' | 'ENFORCED_AFTER_GRACE';
  mfaGracePeriodDays?: number;
}

/**
 * SSO configuration for a tenant.
 */
export interface TenantSsoConfig {
  provider: 'GOOGLE' | 'MICROSOFT';
  enabled: boolean;
  clientId?: string;
  enforced: boolean;
  allowedDomains: string[];
  autoCreateUser: boolean;
  autoLinkExisting: boolean;
}

/**
 * SSO configuration parameters.
 */
export interface ConfigureSsoParams {
  provider: 'GOOGLE' | 'MICROSOFT';
  enabled: boolean;
  clientId: string;
  clientSecret: string;
  enforced?: boolean;
  allowedDomains?: string[];
  autoCreateUser?: boolean;
  autoLinkExisting?: boolean;
  scopes?: string[];
}

/**
 * Creates the tenants namespace with all tenant-related methods.
 *
 * @param client - The base client instance for making authenticated requests
 * @returns Object containing all tenant methods
 */
export function createTenantsNamespace(client: BaseClient) {
  return {
    /**
     * Get tenant details by ID.
     *
     * @param tenantId - The tenant ID
     *
     * @example
     * ```ts
     * const tenant = await authvital.tenants.get('tenant-123');
     * console.log(tenant.name, tenant.mfaPolicy);
     * ```
     */
    get: async (tenantId: string): Promise<Tenant> => {
      return client.request<Tenant>(
        'GET',
        `/api/tenants/${encodeURIComponent(tenantId)}`,
      );
    },

    /**
     * Create a new tenant.
     *
     * The authenticated user becomes the owner.
     *
     * @param request - The incoming HTTP request
     * @param params - Tenant creation parameters
     *
     * @example
     * ```ts
     * const tenant = await authvital.tenants.create(req, {
     *   name: 'Acme Corporation',
     *   slug: 'acme-corp',
     * });
     * ```
     */
    create: async (
      request: RequestLike,
      params: CreateTenantParams,
    ): Promise<Tenant> => {
      await client.validateRequest(request);
      return client.request<Tenant>('POST', '/api/tenants', params);
    },

    /**
     * Update tenant settings.
     *
     * Requires admin or owner role.
     *
     * @param tenantId - The tenant ID
     * @param params - Fields to update
     *
     * @example
     * ```ts
     * await authvital.tenants.update('tenant-123', {
     *   name: 'Acme Corp Inc.',
     *   mfaPolicy: 'REQUIRED',
     * });
     * ```
     */
    update: async (
      tenantId: string,
      params: UpdateTenantParams,
    ): Promise<Tenant> => {
      return client.request<Tenant>(
        'PATCH',
        `/api/tenants/${encodeURIComponent(tenantId)}`,
        params,
      );
    },

    /**
     * Delete a tenant.
     *
     * Requires owner role. This is destructive!
     *
     * @param tenantId - The tenant ID
     *
     * @example
     * ```ts
     * await authvital.tenants.delete('tenant-123');
     * ```
     */
    delete: async (tenantId: string): Promise<{ success: boolean }> => {
      return client.request<{ success: boolean }>(
        'DELETE',
        `/api/tenants/${encodeURIComponent(tenantId)}`,
      );
    },

    /**
     * Configure SSO for a tenant.
     *
     * @param tenantId - The tenant ID
     * @param params - SSO configuration
     *
     * @example
     * ```ts
     * await authvital.tenants.configureSso('tenant-123', {
     *   provider: 'MICROSOFT',
     *   enabled: true,
     *   clientId: 'azure-app-id',
     *   clientSecret: 'azure-secret',
     *   enforced: true,
     *   allowedDomains: ['acme.com'],
     * });
     * ```
     */
    configureSso: async (
      tenantId: string,
      params: ConfigureSsoParams,
    ): Promise<TenantSsoConfig> => {
      return client.request<TenantSsoConfig>(
        'PUT',
        `/api/tenants/${encodeURIComponent(tenantId)}/sso/${params.provider.toLowerCase()}`,
        params,
      );
    },

    /**
     * Get SSO configuration for a tenant.
     *
     * @param tenantId - The tenant ID
     * @param provider - SSO provider ('GOOGLE' or 'MICROSOFT')
     *
     * @example
     * ```ts
     * const ssoConfig = await authvital.tenants.getSsoConfig('tenant-123', 'MICROSOFT');
     * if (ssoConfig.enforced) {
     *   // Hide password login
     * }
     * ```
     */
    getSsoConfig: async (
      tenantId: string,
      provider: 'GOOGLE' | 'MICROSOFT',
    ): Promise<TenantSsoConfig | null> => {
      try {
        return await client.request<TenantSsoConfig>(
          'GET',
          `/api/tenants/${encodeURIComponent(tenantId)}/sso/${provider.toLowerCase()}`,
        );
      } catch {
        return null;
      }
    },

    /**
     * Disable SSO for a tenant.
     *
     * @param tenantId - The tenant ID
     * @param provider - SSO provider to disable
     *
     * @example
     * ```ts
     * await authvital.tenants.disableSso('tenant-123', 'GOOGLE');
     * ```
     */
    disableSso: async (
      tenantId: string,
      provider: 'GOOGLE' | 'MICROSOFT',
    ): Promise<{ success: boolean }> => {
      return client.request<{ success: boolean }>(
        'DELETE',
        `/api/tenants/${encodeURIComponent(tenantId)}/sso/${provider.toLowerCase()}`,
      );
    },
  };
}

export type TenantsNamespace = ReturnType<typeof createTenantsNamespace>;
