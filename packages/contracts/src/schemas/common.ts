import { z } from 'zod';

// =============================================================================
// COMMON SCHEMAS — Shared across all domains
// =============================================================================

// ---------------------------------------------------------------------------
// Primitives & Reusable Patterns
// ---------------------------------------------------------------------------

/** UUID string (cuid or uuid format accepted) */
export const IdSchema = z.string().min(1);

/** ISO 8601 date string */
export const DateStringSchema = z.string().datetime({ offset: true }).or(z.string().datetime());

/** Slug: lowercase alphanumeric + hyphens */
export const SlugSchema = z
  .string()
  .min(2)
  .regex(/^[a-z0-9-]+$/, 'Must contain only lowercase letters, numbers, and hyphens');

/** Email address */
export const EmailSchema = z.string().email();

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

export const PaginationQuerySchema = z.object({
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

export const PaginatedResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    total: z.number(),
    limit: z.number(),
    offset: z.number(),
  });

// ---------------------------------------------------------------------------
// Standard Responses
// ---------------------------------------------------------------------------

export const SuccessResponseSchema = z.object({
  success: z.literal(true),
  message: z.string().optional(),
});
export type SuccessResponse = z.infer<typeof SuccessResponseSchema>;

export const ErrorResponseSchema = z.object({
  statusCode: z.number(),
  message: z.string(),
  error: z.string().optional(),
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

// ---------------------------------------------------------------------------
// Enums (mirroring Prisma enums — single source for contracts)
// ---------------------------------------------------------------------------

export const LicensingModeSchema = z.enum(['FREE', 'PER_SEAT', 'TENANT_WIDE']);
export type LicensingMode = z.infer<typeof LicensingModeSchema>;

export const AccessModeSchema = z.enum(['AUTOMATIC', 'MANUAL_AUTO_GRANT', 'MANUAL_NO_DEFAULT', 'DISABLED']);
export type AccessMode = z.infer<typeof AccessModeSchema>;

export const AccessStatusSchema = z.enum(['ACTIVE', 'REVOKED', 'SUSPENDED']);
export type AccessStatus = z.infer<typeof AccessStatusSchema>;

export const AccessTypeSchema = z.enum(['GRANTED', 'INVITED', 'AUTO_FREE', 'AUTO_TENANT', 'AUTO_OWNER']);
export type AccessType = z.infer<typeof AccessTypeSchema>;

export const MembershipStatusSchema = z.enum(['ACTIVE', 'SUSPENDED', 'INVITED']);
export type MembershipStatus = z.infer<typeof MembershipStatusSchema>;

export const LicenseTypeStatusSchema = z.enum(['DRAFT', 'ACTIVE', 'HIDDEN', 'ARCHIVED']);
export type LicenseTypeStatus = z.infer<typeof LicenseTypeStatusSchema>;

export const SubscriptionStatusSchema = z.enum(['ACTIVE', 'CANCELED', 'EXPIRED']);
export type SubscriptionStatus = z.infer<typeof SubscriptionStatusSchema>;

export const SsoProviderTypeSchema = z.enum(['GOOGLE', 'MICROSOFT', 'GITHUB', 'SAML', 'OIDC']);
export type SsoProviderType = z.infer<typeof SsoProviderTypeSchema>;

export const MfaPolicySchema = z.enum(['DISABLED', 'OPTIONAL', 'ENCOURAGED', 'REQUIRED']);
export type MfaPolicy = z.infer<typeof MfaPolicySchema>;
