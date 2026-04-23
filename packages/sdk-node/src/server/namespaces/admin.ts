/**
 * @authvital/sdk - Admin Namespace
 *
 * Instance-level administration operations.
 * These operations require super admin or system:admin scope.
 */

import type { BaseClient } from '../base-client';

/**
 * Instance settings.
 */
export interface InstanceSettings {
  /** Require MFA for all super admins */
  superAdminMfaRequired: boolean;
  /** Default MFA policy for new tenants */
  defaultMfaPolicy: 'OPTIONAL' | 'REQUIRED' | 'ENFORCED_AFTER_GRACE';
  /** Allow public registration */
  publicRegistrationEnabled: boolean;
  /** Require email verification */
  emailVerificationRequired: boolean;
  /** Session timeout in seconds */
  sessionTimeoutSeconds: number;
  /** Access token lifetime in seconds */
  accessTokenLifetimeSeconds: number;
  /** Refresh token lifetime in seconds */
  refreshTokenLifetimeSeconds: number;
}

/**
 * Instance SSO configuration.
 */
export interface InstanceSsoConfig {
  provider: 'GOOGLE' | 'MICROSOFT';
  enabled: boolean;
  clientId: string;
  scopes: string[];
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
  scopes?: string[];
  allowedDomains?: string[];
  autoCreateUser?: boolean;
  autoLinkExisting?: boolean;
}

/**
 * Creates the admin namespace with instance-level admin methods.
 *
 * @param client - The base client instance for making authenticated requests
 * @returns Object containing all admin methods
 */
export function createAdminNamespace(client: BaseClient) {
  return {
    /**
     * Get current instance settings.
     *
     * @example
     * ```ts
     * const settings = await authvital.admin.getInstanceSettings();
     * console.log('MFA required for admins:', settings.superAdminMfaRequired);
     * ```
     */
    getInstanceSettings: async (): Promise<InstanceSettings> => {
      return client.request<InstanceSettings>('GET', '/api/admin/settings');
    },

    /**
     * Update instance settings.
     *
     * @param params - Settings to update
     *
     * @example
     * ```ts
     * await authvital.admin.updateInstanceSettings({
     *   superAdminMfaRequired: true,
     *   sessionTimeoutSeconds: 3600,
     * });
     * ```
     */
    updateInstanceSettings: async (
      params: Partial<InstanceSettings>,
    ): Promise<InstanceSettings> => {
      return client.request<InstanceSettings>('PATCH', '/api/admin/settings', params);
    },

    /**
     * Configure instance-level SSO.
     *
     * This is the default SSO for all tenants without custom config.
     *
     * @param params - SSO configuration
     *
     * @example
     * ```ts
     * await authvital.admin.configureSso({
     *   provider: 'GOOGLE',
     *   enabled: true,
     *   clientId: 'google-client-id',
     *   clientSecret: 'google-client-secret',
     *   scopes: ['openid', 'email', 'profile'],
     *   allowedDomains: ['yourcompany.com'],
     * });
     * ```
     */
    configureSso: async (params: ConfigureSsoParams): Promise<InstanceSsoConfig> => {
      return client.request<InstanceSsoConfig>(
        'PUT',
        `/api/admin/sso/${params.provider.toLowerCase()}`,
        params,
      );
    },

    /**
     * Get instance SSO configuration.
     *
     * @param provider - SSO provider
     *
     * @example
     * ```ts
     * const googleConfig = await authvital.admin.getSsoConfig('GOOGLE');
     * ```
     */
    getSsoConfig: async (
      provider: 'GOOGLE' | 'MICROSOFT',
    ): Promise<InstanceSsoConfig | null> => {
      try {
        return await client.request<InstanceSsoConfig>(
          'GET',
          `/api/admin/sso/${provider.toLowerCase()}`,
        );
      } catch {
        return null;
      }
    },

    /**
     * Disable user's MFA (admin emergency operation).
     *
     * Use when user has lost access to authenticator AND backup codes.
     *
     * @param userId - The user ID
     * @param params - Audit information
     *
     * @example
     * ```ts
     * await authvital.admin.disableUserMfa('user-123', {
     *   reason: 'User lost access to authenticator app',
     *   adminId: currentAdminId,
     * });
     * ```
     */
    disableUserMfa: async (
      userId: string,
      params: { reason: string; adminId: string },
    ): Promise<{ success: boolean }> => {
      return client.request<{ success: boolean }>(
        'POST',
        `/api/admin/users/${encodeURIComponent(userId)}/disable-mfa`,
        params,
      );
    },

    /**
     * Force password reset for a user.
     *
     * @param userId - The user ID
     *
     * @example
     * ```ts
     * await authvital.admin.forcePasswordReset('user-123');
     * ```
     */
    forcePasswordReset: async (userId: string): Promise<{ success: boolean }> => {
      return client.request<{ success: boolean }>(
        'POST',
        `/api/admin/users/${encodeURIComponent(userId)}/force-password-reset`,
      );
    },

    /**
     * Disable a user account.
     *
     * @param userId - The user ID
     * @param params - Audit information
     *
     * @example
     * ```ts
     * await authvital.admin.disableUser('user-123', {
     *   reason: 'Policy violation',
     * });
     * ```
     */
    disableUser: async (
      userId: string,
      params: { reason: string },
    ): Promise<{ success: boolean }> => {
      return client.request<{ success: boolean }>(
        'POST',
        `/api/admin/users/${encodeURIComponent(userId)}/disable`,
        params,
      );
    },

    /**
     * Enable a disabled user account.
     *
     * @param userId - The user ID
     *
     * @example
     * ```ts
     * await authvital.admin.enableUser('user-123');
     * ```
     */
    enableUser: async (userId: string): Promise<{ success: boolean }> => {
      return client.request<{ success: boolean }>(
        'POST',
        `/api/admin/users/${encodeURIComponent(userId)}/enable`,
      );
    },

    /**
     * Revoke all sessions for a user.
     *
     * @param userId - The user ID
     *
     * @example
     * ```ts
     * await authvital.admin.revokeUserSessions('user-123');
     * ```
     */
    revokeUserSessions: async (userId: string): Promise<{ count: number }> => {
      return client.request<{ count: number }>(
        'POST',
        `/api/admin/users/${encodeURIComponent(userId)}/revoke-sessions`,
      );
    },
  };
}

export type AdminNamespace = ReturnType<typeof createAdminNamespace>;
