import { z } from 'zod';
import { SsoProviderTypeSchema } from './common.js';

// =============================================================================
// SSO SCHEMAS
// =============================================================================

export const SsoProviderSchema = z.object({
  id: z.string(),
  provider: SsoProviderTypeSchema,
  clientId: z.string(),
  enabled: z.boolean(),
  scopes: z.array(z.string()),
  allowedDomains: z.array(z.string()),
  autoCreateUser: z.boolean(),
  autoLinkExisting: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type SsoProvider = z.infer<typeof SsoProviderSchema>;

export const CreateSsoProviderRequestSchema = z.object({
  provider: z.string(),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  enabled: z.boolean().optional(),
  scopes: z.array(z.string()).optional(),
  allowedDomains: z.array(z.string()).optional(),
  autoCreateUser: z.boolean().optional(),
  autoLinkExisting: z.boolean().optional(),
});
export type CreateSsoProviderRequest = z.infer<typeof CreateSsoProviderRequestSchema>;

export const UpdateSsoProviderRequestSchema = z.object({
  clientId: z.string().optional(),
  clientSecret: z.string().optional(),
  enabled: z.boolean().optional(),
  scopes: z.array(z.string()).optional(),
  allowedDomains: z.array(z.string()).optional(),
  autoCreateUser: z.boolean().optional(),
  autoLinkExisting: z.boolean().optional(),
});
export type UpdateSsoProviderRequest = z.infer<typeof UpdateSsoProviderRequestSchema>;
