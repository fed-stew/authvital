import { z } from 'zod';

// =============================================================================
// SUPER ADMIN AUTH SCHEMAS
// =============================================================================

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

export const SuperAdminSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  displayName: z.string().nullable(),
  mfaEnabled: z.boolean(),
  createdAt: z.string(),
});
export type SuperAdmin = z.infer<typeof SuperAdminSchema>;

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

/** Login may return admin info OR an MFA challenge */
export const LoginResponseSchema = z.discriminatedUnion('mfaRequired', [
  z.object({
    mfaRequired: z.literal(false).optional(),
    mfaSetupRequired: z.literal(false).optional(),
    admin: SuperAdminSchema,
    mustChangePassword: z.boolean().optional(),
  }),
  z.object({
    mfaRequired: z.literal(true),
    mfaSetupRequired: z.boolean().optional(),
    mfaChallengeToken: z.string(),
  }),
]);
export type LoginResponse = z.infer<typeof LoginResponseSchema>;

// ---------------------------------------------------------------------------
// MFA
// ---------------------------------------------------------------------------

export const MfaVerifyRequestSchema = z.object({
  challengeToken: z.string(),
  code: z.string(),
});
export type MfaVerifyRequest = z.infer<typeof MfaVerifyRequestSchema>;

export const MfaVerifyResponseSchema = z.object({
  admin: SuperAdminSchema,
  mustChangePassword: z.boolean().optional(),
});
export type MfaVerifyResponse = z.infer<typeof MfaVerifyResponseSchema>;

export const MfaSetupResponseSchema = z.object({
  secret: z.string(),
  qrCodeDataUrl: z.string(),
  backupCodes: z.array(z.string()),
});
export type MfaSetupResponse = z.infer<typeof MfaSetupResponseSchema>;

export const MfaEnableRequestSchema = z.object({
  secret: z.string(),
  code: z.string(),
  backupCodes: z.array(z.string()),
});
export type MfaEnableRequest = z.infer<typeof MfaEnableRequestSchema>;

export const MfaDisableRequestSchema = z.object({
  code: z.string(),
});
export type MfaDisableRequest = z.infer<typeof MfaDisableRequestSchema>;

export const MfaStatusResponseSchema = z.object({
  enabled: z.boolean(),
  verifiedAt: z.string().nullable(),
  backupCodesRemaining: z.number(),
});
export type MfaStatusResponse = z.infer<typeof MfaStatusResponseSchema>;

export const MfaPolicyResponseSchema = z.object({
  superAdminMfaRequired: z.boolean(),
});
export type MfaPolicyResponse = z.infer<typeof MfaPolicyResponseSchema>;

export const UpdateMfaPolicyRequestSchema = z.object({
  required: z.boolean(),
});
export type UpdateMfaPolicyRequest = z.infer<typeof UpdateMfaPolicyRequestSchema>;

// ---------------------------------------------------------------------------
// Password
// ---------------------------------------------------------------------------

export const ChangePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});
export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequestSchema>;

export const ForgotPasswordRequestSchema = z.object({
  email: z.string().email(),
});
export type ForgotPasswordRequest = z.infer<typeof ForgotPasswordRequestSchema>;

export const ResetPasswordRequestSchema = z.object({
  token: z.string(),
  newPassword: z.string().min(8),
});
export type ResetPasswordRequest = z.infer<typeof ResetPasswordRequestSchema>;

export const VerifyResetTokenRequestSchema = z.object({
  token: z.string(),
});
export type VerifyResetTokenRequest = z.infer<typeof VerifyResetTokenRequestSchema>;

// ---------------------------------------------------------------------------
// Create Admin
// ---------------------------------------------------------------------------

export const CreateSuperAdminRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).optional(),
  displayName: z.string().optional(),
  givenName: z.string().optional(),
  familyName: z.string().optional(),
});
export type CreateSuperAdminRequest = z.infer<typeof CreateSuperAdminRequestSchema>;
