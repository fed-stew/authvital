import { z } from 'zod';

// =============================================================================
// INSTANCE & BRANDING SCHEMAS
// =============================================================================

export const BrandingSchema = z.object({
  brandingName: z.string().nullable().optional(),
  brandingLogoUrl: z.string().url().nullable().optional(),
  brandingIconUrl: z.string().url().nullable().optional(),
  brandingPrimaryColor: z.string().nullable().optional(),
  brandingBackgroundColor: z.string().nullable().optional(),
  brandingAccentColor: z.string().nullable().optional(),
  brandingSupportUrl: z.string().url().nullable().optional(),
  brandingPrivacyUrl: z.string().url().nullable().optional(),
  brandingTermsUrl: z.string().url().nullable().optional(),
});

export const InstanceMetaSchema = z.object({
  id: z.string(),
  instanceUuid: z.string(),
  name: z.string(),
  allowSignUp: z.boolean(),
  autoCreateTenant: z.boolean(),
  allowGenericDomains: z.boolean(),
  allowAnonymousSignUp: z.boolean(),
  requiredUserFields: z.array(z.string()),
  defaultTenantRoleIds: z.array(z.string()),
  initiateLoginUri: z.string().nullable(),
  superAdminMfaRequired: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
}).merge(BrandingSchema);
export type InstanceMeta = z.infer<typeof InstanceMetaSchema>;

export const UpdateInstanceSchema = z.object({
  name: z.string().optional(),
  allowSignUp: z.boolean().optional(),
  autoCreateTenant: z.boolean().optional(),
  allowGenericDomains: z.boolean().optional(),
  allowAnonymousSignUp: z.boolean().optional(),
  requiredUserFields: z.array(z.string()).optional(),
  defaultTenantRoleIds: z.array(z.string()).optional(),
  initiateLoginUri: z.string().nullable().optional(),
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
export type UpdateInstance = z.infer<typeof UpdateInstanceSchema>;

// ---------------------------------------------------------------------------
// Instance API Keys
// ---------------------------------------------------------------------------

export const InstanceApiKeySchema = z.object({
  id: z.string(),
  prefix: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  permissions: z.array(z.string()),
  lastUsedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.string(),
});
export type InstanceApiKey = z.infer<typeof InstanceApiKeySchema>;

export const CreateInstanceApiKeySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});
export type CreateInstanceApiKey = z.infer<typeof CreateInstanceApiKeySchema>;

// Response when creating — includes the raw key (shown once)
export const CreateInstanceApiKeyResponseSchema = InstanceApiKeySchema.extend({
  rawKey: z.string(),
});
export type CreateInstanceApiKeyResponse = z.infer<typeof CreateInstanceApiKeyResponseSchema>;
