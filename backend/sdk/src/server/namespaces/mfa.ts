/**
 * @authvital/sdk - MFA Namespace
 *
 * Multi-factor authentication setup, verification, and management.
 */

import type { BaseClient, RequestLike } from '../base-client';

/**
 * MFA setup response with QR code and backup codes.
 */
export interface MfaSetupResponse {
  /** TOTP secret for manual entry */
  secret: string;
  /** Data URL for QR code image */
  qrCodeUrl: string;
  /** otpauth:// URL for authenticator apps */
  otpauthUrl: string;
  /** One-time backup codes (store securely!) */
  backupCodes: string[];
}

/**
 * MFA verification result.
 */
export interface MfaVerifyResult {
  success: boolean;
  mfaEnabled: boolean;
}

/**
 * MFA challenge completion result with tokens.
 */
export interface MfaChallengeResult {
  accessToken: string;
  refreshToken: string;
  idToken: string;
  expiresIn: number;
}

/**
 * MFA status for a user.
 */
export interface MfaStatus {
  mfaEnabled: boolean;
  mfaVerifiedAt: string | null;
  backupCodesRemaining: number;
}

/**
 * Creates the MFA namespace with all MFA-related methods.
 *
 * @param client - The base client instance for making authenticated requests
 * @returns Object containing all MFA methods
 */
export function createMfaNamespace(client: BaseClient) {
  return {
    /**
     * Start MFA setup for the authenticated user.
     *
     * Returns a TOTP secret, QR code, and backup codes.
     * User must verify with a code before MFA is enabled.
     *
     * @param request - The incoming HTTP request (for JWT validation)
     *
     * @example
     * ```ts
     * app.post('/api/mfa/setup', async (req, res) => {
     *   const setup = await authvital.mfa.setup(req);
     *   res.json({
     *     qrCodeUrl: setup.qrCodeUrl,
     *     secret: setup.secret,
     *     // Don't send backup codes until verified!
     *   });
     * });
     * ```
     */
    setup: async (request: RequestLike): Promise<MfaSetupResponse> => {
      await client.validateRequest(request);
      return client.request<MfaSetupResponse>('POST', '/api/mfa/setup');
    },

    /**
     * Complete MFA setup by verifying the first TOTP code.
     *
     * After this succeeds, MFA is enabled for the user.
     *
     * @param request - The incoming HTTP request
     * @param params - Verification parameters
     *
     * @example
     * ```ts
     * app.post('/api/mfa/verify-setup', async (req, res) => {
     *   const result = await authvital.mfa.verifySetup(req, {
     *     code: req.body.code,
     *   });
     *   if (result.success) {
     *     res.json({ mfaEnabled: true });
     *   }
     * });
     * ```
     */
    verifySetup: async (
      request: RequestLike,
      params: { code: string },
    ): Promise<MfaVerifyResult> => {
      await client.validateRequest(request);
      return client.request<MfaVerifyResult>('POST', '/api/mfa/verify', params);
    },

    /**
     * Complete MFA challenge during login.
     *
     * Called after login returns `mfaRequired: true`.
     *
     * @param params - Challenge token and TOTP code
     *
     * @example
     * ```ts
     * app.post('/api/mfa/challenge', async (req, res) => {
     *   const tokens = await authvital.mfa.verifyChallenge({
     *     challengeToken: req.body.challengeToken,
     *     code: req.body.code,
     *   });
     *   // Set tokens as cookies
     *   res.cookie('access_token', tokens.accessToken, { httpOnly: true });
     *   res.json({ success: true });
     * });
     * ```
     */
    verifyChallenge: async (params: {
      challengeToken: string;
      code: string;
    }): Promise<MfaChallengeResult> => {
      return client.request<MfaChallengeResult>('POST', '/api/mfa/challenge', params);
    },

    /**
     * Use a backup code to complete MFA challenge.
     *
     * Each backup code can only be used once.
     *
     * @param params - Challenge token and backup code
     *
     * @example
     * ```ts
     * app.post('/api/mfa/backup', async (req, res) => {
     *   const tokens = await authvital.mfa.useBackupCode({
     *     challengeToken: req.body.challengeToken,
     *     backupCode: req.body.backupCode,
     *   });
     *   res.json({ success: true, remainingCodes: tokens.remainingCodes });
     * });
     * ```
     */
    useBackupCode: async (params: {
      challengeToken: string;
      backupCode: string;
    }): Promise<MfaChallengeResult & { remainingCodes: number }> => {
      return client.request<MfaChallengeResult & { remainingCodes: number }>(
        'POST',
        '/api/mfa/challenge',
        { challengeToken: params.challengeToken, backupCode: params.backupCode },
      );
    },

    /**
     * Disable MFA for the authenticated user.
     *
     * Requires current TOTP code for verification.
     *
     * @param request - The incoming HTTP request
     * @param params - Current TOTP code
     *
     * @example
     * ```ts
     * app.post('/api/mfa/disable', async (req, res) => {
     *   const result = await authvital.mfa.disable(req, {
     *     code: req.body.code,
     *   });
     *   res.json({ mfaEnabled: false });
     * });
     * ```
     */
    disable: async (
      request: RequestLike,
      params: { code: string },
    ): Promise<MfaVerifyResult> => {
      await client.validateRequest(request);
      return client.request<MfaVerifyResult>('POST', '/api/mfa/disable', params);
    },

    /**
     * Regenerate backup codes (invalidates old ones).
     *
     * Requires current TOTP code for verification.
     *
     * @param request - The incoming HTTP request
     * @param params - Current TOTP code
     *
     * @example
     * ```ts
     * app.post('/api/mfa/regenerate-backup', async (req, res) => {
     *   const { backupCodes } = await authvital.mfa.regenerateBackupCodes(req, {
     *     code: req.body.code,
     *   });
     *   res.json({ backupCodes });
     * });
     * ```
     */
    regenerateBackupCodes: async (
      request: RequestLike,
      params: { code: string },
    ): Promise<{ backupCodes: string[] }> => {
      await client.validateRequest(request);
      return client.request<{ backupCodes: string[] }>(
        'POST',
        '/api/mfa/regenerate-backup-codes',
        params,
      );
    },

    /**
     * Get MFA status for a user (admin operation).
     *
     * @param userId - The user ID to check
     *
     * @example
     * ```ts
     * const status = await authvital.mfa.getStatus('user-123');
     * if (!status.mfaEnabled && tenantPolicy === 'REQUIRED') {
     *   // Redirect to MFA setup
     * }
     * ```
     */
    getStatus: async (userId: string): Promise<MfaStatus> => {
      return client.request<MfaStatus>(
        'GET',
        `/api/users/${encodeURIComponent(userId)}/mfa-status`,
      );
    },
  };
}

export type MfaNamespace = ReturnType<typeof createMfaNamespace>;
