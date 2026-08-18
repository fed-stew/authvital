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

// NOTE: The old FLAT application model (ApplicationSchema / ApplicationWithRolesSchema
// / CreateApplicationRequestSchema / UpdateApplicationRequestSchema) was removed in the
// app-client-split refactor. OAuth credentials now live on ApplicationClient — see the
// CONTAINER MODEL section below (ApplicationContainerSchema / AppWithClientsSchema /
// CreateApplicationInputSchema / UpdateApplicationInputSchema).

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

export const RotateSecretResponseSchema = z.object({
  clientSecret: z.string(),
  warning: z.string(),
});
export type RotateSecretResponse = z.infer<typeof RotateSecretResponseSchema>;

// ---------------------------------------------------------------------------
// M2M Tenant Grants (MACHINE apps)
// ---------------------------------------------------------------------------

export const M2mTenantGrantSchema = z.object({
  id: z.string(),
  applicationId: z.string(),
  /** The MACHINE credential this grant belongs to (app-client-split). */
  clientId: z.string().optional(),
  tenantId: z.string(),
  tenant: z.object({ id: z.string(), name: z.string(), slug: z.string() }),
  createdAt: z.string(),
});
export type M2mTenantGrant = z.infer<typeof M2mTenantGrantSchema>;

export const AddTenantGrantRequestSchema = z.object({ tenantId: z.string().min(1) });
export type AddTenantGrantRequest = z.infer<typeof AddTenantGrantRequestSchema>;

// ===========================================================================
// CONTAINER MODEL (app-client-split — Phase 2)
// ===========================================================================
// An Application is a CONTAINER. OAuth credentials live on child
// ApplicationClient rows: at most one SPA + one MACHINE per app. These are the
// canonical types the frontend consumes in Phase 3.

/** Credential kind. Frontend should import this as `ClientType`. */
export const ClientTypeSchema = z.enum(['SPA', 'MACHINE']);
export type ClientType = z.infer<typeof ClientTypeSchema>;

/**
 * Public view of an OAuth credential (ApplicationClient). NEVER includes the
 * hashed secret — `hasClientSecret` signals presence only.
 */
export const ApplicationClientSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  type: ClientTypeSchema,
  redirectUris: z.array(z.string()),
  postLogoutRedirectUris: z.array(z.string()),
  allowedWebOrigins: z.array(z.string()),
  initiateLoginUri: z.string().nullable(),
  accessTokenTtl: z.number(),
  refreshTokenTtl: z.number(),
  /**
   * Rotation reuse grace window (seconds, 0..300). Within this window after
   * a refresh token rotation, replaying the old token is forgiven instead of
   * revoking the whole token family. 0 = strict.
   */
  rotationReuseIntervalSeconds: z.number(),
  /** True when a MACHINE secret is set. SPA credentials are always false. */
  hasClientSecret: z.boolean(),
  m2mTrustedAllTenants: z.boolean(),
  m2mAllowedScopes: z.array(z.string()),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ApplicationClient = z.infer<typeof ApplicationClientSchema>;

/** Container-only fields (no OAuth credential fields — those live on clients). */
export const ApplicationContainerSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  isActive: z.boolean(),
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

/**
 * Application container + its credentials[]. Canonical detail/list shape.
 * Frontend should import this as `AppWithClients`.
 */
export const AppWithClientsSchema = ApplicationContainerSchema.extend({
  clients: z.array(ApplicationClientSchema),
  roles: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        slug: z.string(),
        description: z.string().nullable(),
        isDefault: z.boolean(),
      }),
    )
    .optional(),
  licenseTypes: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        slug: z.string(),
        status: z.string(),
        features: z.any(),
        displayOrder: z.number(),
      }),
    )
    .optional(),
  roleCount: z.number().optional(),
  licenseTypeCount: z.number().optional(),
});
export type AppWithClients = z.infer<typeof AppWithClientsSchema>;

// ---------------------------------------------------------------------------
// Credential inputs (type-discriminated)
// ---------------------------------------------------------------------------

export const SpaClientInputSchema = z.object({
  type: z.literal('SPA'),
  // SPA requires at least one redirect URI (enforced here + in the service).
  redirectUris: z.array(z.string()).min(1, 'A SPA credential requires at least one redirect URI'),
  postLogoutRedirectUris: z.array(z.string()).optional(),
  allowedWebOrigins: z.array(z.string()).optional(),
  initiateLoginUri: z.string().optional(),
  accessTokenTtl: z.number().int().min(0).optional(),
  refreshTokenTtl: z.number().int().min(0).optional(),
  rotationReuseIntervalSeconds: z.number().int().min(0).max(300).optional(),
});

export const MachineClientInputSchema = z.object({
  type: z.literal('MACHINE'),
  // MACHINE credentials never take redirect URIs; they get a one-time secret.
  m2mTrustedAllTenants: z.boolean().optional(),
  m2mAllowedScopes: z.array(z.string()).optional(),
  accessTokenTtl: z.number().int().min(0).optional(),
  refreshTokenTtl: z.number().int().min(0).optional(),
});

/** Add a credential to an app. Frontend should import this as `AddClientInput`. */
export const AddClientInputSchema = z.discriminatedUnion('type', [
  SpaClientInputSchema,
  MachineClientInputSchema,
]);
export type AddClientInput = z.infer<typeof AddClientInputSchema>;

/** Partial update of an existing credential's editable fields (type is immutable). */
export const UpdateClientInputSchema = z.object({
  redirectUris: z.array(z.string()).optional(),
  postLogoutRedirectUris: z.array(z.string()).optional(),
  allowedWebOrigins: z.array(z.string()).optional(),
  initiateLoginUri: z.string().nullable().optional(),
  accessTokenTtl: z.number().int().min(0).optional(),
  refreshTokenTtl: z.number().int().min(0).optional(),
  rotationReuseIntervalSeconds: z.number().int().min(0).max(300).optional(),
  m2mTrustedAllTenants: z.boolean().optional(),
  m2mAllowedScopes: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateClientInput = z.infer<typeof UpdateClientInputSchema>;

/** Credential returned by add — includes the one-time plaintext secret (MACHINE). */
export const AddClientResponseSchema = ApplicationClientSchema.extend({
  /** Present exactly once, only for MACHINE credentials, at creation time. */
  clientSecret: z.string().optional(),
});
export type AddClientResponse = z.infer<typeof AddClientResponseSchema>;

// ---------------------------------------------------------------------------
// Application create / update (container model)
// ---------------------------------------------------------------------------

const ApplicationContainerInputFields = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  availableFeatures: z.array(AppFeatureSchema).optional(),
  allowMixedLicensing: z.boolean().optional(),
  licensingMode: LicensingModeSchema.optional(),
  accessMode: AccessModeSchema.optional(),
  defaultLicenseTypeId: z.string().optional(),
  defaultSeatCount: z.number().int().min(0).optional(),
  autoProvisionOnSignup: z.boolean().optional(),
  autoGrantToOwner: z.boolean().optional(),
}).merge(AppBrandingFields);

/**
 * Create an application: the CONTAINER, OPTIONALLY plus its FIRST credential.
 * When `client` is omitted, ONLY the container is created (zero credentials);
 * credentials are added later on the app's Credentials tab.
 * Frontend should import this as `CreateApplicationInput`.
 */
export const CreateApplicationInputSchema = ApplicationContainerInputFields.extend({
  /** Optional explicit clientId for the first credential (else auto-generated). */
  clientId: z.string().optional(),
  /** The first credential to create alongside the container. Omit to create an empty container. */
  client: AddClientInputSchema.optional(),
});
export type CreateApplicationInput = z.infer<typeof CreateApplicationInputSchema>;

/** Create response: the new container + clients[], plus one-time MACHINE secret. */
export const CreateApplicationResponseSchema = AppWithClientsSchema.extend({
  /** Present exactly once when the first credential is MACHINE. */
  clientSecret: z.string().optional(),
});
export type CreateApplicationResponse = z.infer<typeof CreateApplicationResponseSchema>;

/** Update an application — container-level fields only (credentials via /clients). */
export const UpdateApplicationInputSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
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
export type UpdateApplicationInput = z.infer<typeof UpdateApplicationInputSchema>;
