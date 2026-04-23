import { z } from 'zod';
import { LicenseTypeStatusSchema, SubscriptionStatusSchema } from './common.js';

// =============================================================================
// LICENSING SCHEMAS
// =============================================================================

// ---------------------------------------------------------------------------
// License Types (Catalog)
// ---------------------------------------------------------------------------

export const LicenseTypeSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  applicationId: z.string(),
  displayOrder: z.number(),
  status: LicenseTypeStatusSchema,
  features: z.record(z.boolean()),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type LicenseType = z.infer<typeof LicenseTypeSchema>;

export const CreateLicenseTypeRequestSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().optional(),
  applicationId: z.string(),
  displayOrder: z.number().int().min(0).optional(),
  status: LicenseTypeStatusSchema.optional(),
  features: z.record(z.boolean()).optional(),
});
export type CreateLicenseTypeRequest = z.infer<typeof CreateLicenseTypeRequestSchema>;

export const UpdateLicenseTypeRequestSchema = z.object({
  name: z.string().min(1).optional(),
  slug: z.string().min(1).optional(),
  description: z.string().optional(),
  displayOrder: z.number().int().min(0).optional(),
  status: LicenseTypeStatusSchema.optional(),
  features: z.record(z.boolean()).optional(),
});
export type UpdateLicenseTypeRequest = z.infer<typeof UpdateLicenseTypeRequestSchema>;

// ---------------------------------------------------------------------------
// Subscriptions (Inventory)
// ---------------------------------------------------------------------------

export const AppSubscriptionSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  applicationId: z.string(),
  licenseTypeId: z.string(),
  quantityPurchased: z.number(),
  quantityAssigned: z.number(),
  status: SubscriptionStatusSchema,
  currentPeriodStart: z.string(),
  currentPeriodEnd: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AppSubscription = z.infer<typeof AppSubscriptionSchema>;

export const ProvisionSubscriptionRequestSchema = z.object({
  tenantId: z.string(),
  applicationId: z.string(),
  licenseTypeId: z.string(),
  quantityPurchased: z.number().int().min(1),
  currentPeriodEnd: z.string(),
});
export type ProvisionSubscriptionRequest = z.infer<typeof ProvisionSubscriptionRequestSchema>;

export const UpdateSubscriptionQuantityRequestSchema = z.object({
  quantityPurchased: z.number().int().min(0),
});
export type UpdateSubscriptionQuantityRequest = z.infer<typeof UpdateSubscriptionQuantityRequestSchema>;

// ---------------------------------------------------------------------------
// License Assignments (Who has what)
// ---------------------------------------------------------------------------

export const LicenseAssignmentSchema = z.object({
  id: z.string(),
  userId: z.string(),
  tenantId: z.string(),
  applicationId: z.string(),
  licenseTypeId: z.string(),
  appSubscriptionId: z.string(),
  assignedAt: z.string(),
});
export type LicenseAssignment = z.infer<typeof LicenseAssignmentSchema>;

export const GrantLicenseRequestSchema = z.object({
  tenantId: z.string(),
  userId: z.string(),
  applicationId: z.string(),
  licenseTypeId: z.string(),
});
export type GrantLicenseRequest = z.infer<typeof GrantLicenseRequestSchema>;

export const RevokeLicenseRequestSchema = z.object({
  tenantId: z.string(),
  userId: z.string(),
  applicationId: z.string(),
});
export type RevokeLicenseRequest = z.infer<typeof RevokeLicenseRequestSchema>;

export const ChangeLicenseTypeRequestSchema = z.object({
  tenantId: z.string(),
  userId: z.string(),
  applicationId: z.string(),
  newLicenseTypeId: z.string(),
});
export type ChangeLicenseTypeRequest = z.infer<typeof ChangeLicenseTypeRequestSchema>;

export const BulkGrantLicenseRequestSchema = z.object({
  assignments: z.array(GrantLicenseRequestSchema),
});
export type BulkGrantLicenseRequest = z.infer<typeof BulkGrantLicenseRequestSchema>;

export const BulkRevokeLicenseRequestSchema = z.object({
  revocations: z.array(RevokeLicenseRequestSchema),
});
export type BulkRevokeLicenseRequest = z.infer<typeof BulkRevokeLicenseRequestSchema>;

// ---------------------------------------------------------------------------
// License Overview (Dashboard views)
// ---------------------------------------------------------------------------

export const TenantLicenseOverviewSchema = z.object({
  tenant: z.object({
    id: z.string(),
    name: z.string(),
  }),
  applications: z.array(z.object({
    applicationId: z.string(),
    applicationName: z.string(),
    licensingMode: z.string(),
    subscriptions: z.array(z.object({
      licenseTypeName: z.string(),
      quantityPurchased: z.number(),
      quantityAssigned: z.number(),
      available: z.number(),
    })),
  })),
});
export type TenantLicenseOverview = z.infer<typeof TenantLicenseOverviewSchema>;

export const AppSubscriptionStatsSchema = z.object({
  applicationId: z.string(),
  applicationName: z.string(),
  totalSubscriptions: z.number(),
  totalSeatsPurchased: z.number(),
  totalSeatsAssigned: z.number(),
  totalSeatsAvailable: z.number(),
});
export type AppSubscriptionStats = z.infer<typeof AppSubscriptionStatsSchema>;
