import { z } from 'zod';
import { LicensingModeSchema, AccessModeSchema, SlugSchema } from './common.js';

// =============================================================================
// APPLICATION SCHEMAS
// =============================================================================

export const AppFeatureSchema = z.object({
  key: z.string(),
  name: z.string(),
  description: z.string().optional(),
});
export type AppFeature = z.infer<typeof AppFeatureSchema>;

export const AppBrandingFields = z.object({
  brandingName: z.string().nullable().optional(),
  brandingLogoUrl: z.string().nullable().optional(),
  brandingIconUrl: z.string().nullable().optional(),
  brandingPrimaryColor: z.string().nullable().optional(),
  brandingBackgroundColor: z.string().nullable().optional(),
  brandingAccentColor: z.string().nullable().optional(),
  brandingSupportUrl: z.string().nullable().optional(),
  brandingPrivacyUrl: z.string().nullable().optional(),
  brandingTermsUrl: z.string().nullable().optional(),
});

export const ApplicationSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  clientId: z.string(),
  description: z.string().nullable(),
  type: z.enum(['SPA', 'MACHINE']),
  isActive: z.boolean(),
  redirectUris: z.array(z.string()),
  postLogoutRedirectUris: z.array(z.string()),
  allowedWebOrigins: z.array(z.string()),
  initiateLoginUri: z.string().nullable(),
  accessTokenTtl: z.number(),
  refreshTokenTtl: z.number(),
  licensingMode: LicensingModeSchema,
  accessMode: AccessModeSchema,
  defaultLicenseTypeId: z.string().nullable(),
  defaultSeatCount: z.number(),
  autoProvisionOnSignup: z.boolean(),
  autoGrantToOwner: z.boolean(),
  availableFeatures: z.any().nullable(),
  allowMixedLicensing: z.boolean(),
  webhookUrl: z.string().nullable(),
  webhookEnabled: z.boolean(),
  webhookEvents: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
}).merge(AppBrandingFields);
export type Application = z.infer<typeof ApplicationSchema>;

/** Application list item — may include roles and counts */
export const ApplicationWithRolesSchema = ApplicationSchema.extend({
  roles: z.array(z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    description: z.string().nullable(),
    isDefault: z.boolean(),
  })).optional(),
  _count: z.object({
    roles: z.number(),
  }).optional(),
});
export type ApplicationWithRoles = z.infer<typeof ApplicationWithRolesSchema>;

// ---------------------------------------------------------------------------
// Create / Update
// ---------------------------------------------------------------------------

export const CreateApplicationRequestSchema = z.object({
  name: z.string().min(1),
  clientId: z.string().optional(),
  description: z.string().optional(),
  redirectUris: z.array(z.string()).optional(),
  postLogoutRedirectUri: z.string().optional(),
  initiateLoginUri: z.string().optional(),
  availableFeatures: z.array(AppFeatureSchema).optional(),
  allowMixedLicensing: z.boolean().optional(),
  licensingMode: LicensingModeSchema.optional(),
  accessMode: AccessModeSchema.optional(),
  defaultLicenseTypeId: z.string().optional(),
  defaultSeatCount: z.number().int().min(0).optional(),
  autoProvisionOnSignup: z.boolean().optional(),
  autoGrantToOwner: z.boolean().optional(),
}).merge(AppBrandingFields);
export type CreateApplicationRequest = z.infer<typeof CreateApplicationRequestSchema>;

export const UpdateApplicationRequestSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  redirectUris: z.array(z.string()).optional(),
  postLogoutRedirectUri: z.string().optional(),
  initiateLoginUri: z.string().optional(),
  accessTokenTtl: z.number().int().min(0).optional(),
  refreshTokenTtl: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  availableFeatures: z.array(AppFeatureSchema).optional(),
  allowMixedLicensing: z.boolean().optional(),
  licensingMode: LicensingModeSchema.optional(),
  accessMode: AccessModeSchema.optional(),
  defaultLicenseTypeId: z.string().optional(),
  defaultSeatCount: z.number().int().min(0).optional(),
  autoProvisionOnSignup: z.boolean().optional(),
  autoGrantToOwner: z.boolean().optional(),
  webhookUrl: z.string().nullable().optional(),
  webhookEnabled: z.boolean().optional(),
  webhookEvents: z.array(z.string()).optional(),
}).merge(AppBrandingFields);
export type UpdateApplicationRequest = z.infer<typeof UpdateApplicationRequestSchema>;

// ---------------------------------------------------------------------------
// Roles (per-application)
// ---------------------------------------------------------------------------

export const RoleSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  isDefault: z.boolean(),
  applicationId: z.string(),
});
export type Role = z.infer<typeof RoleSchema>;

export const CreateRoleRequestSchema = z.object({
  name: z.string().min(1),
  slug: SlugSchema,
  description: z.string().optional(),
  isDefault: z.boolean().optional(),
});
export type CreateRoleRequest = z.infer<typeof CreateRoleRequestSchema>;

export const UpdateRoleRequestSchema = z.object({
  name: z.string().min(1).optional(),
  slug: SlugSchema.optional(),
  description: z.string().optional(),
  isDefault: z.boolean().optional(),
});
export type UpdateRoleRequest = z.infer<typeof UpdateRoleRequestSchema>;

export const RegenerateSecretResponseSchema = z.object({
  clientSecret: z.string(),
  warning: z.string(),
});
export type RegenerateSecretResponse = z.infer<typeof RegenerateSecretResponseSchema>;
