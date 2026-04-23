import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import {
  LicenseTypeSchema,
  CreateLicenseTypeRequestSchema,
  UpdateLicenseTypeRequestSchema,
  AppSubscriptionSchema,
  ProvisionSubscriptionRequestSchema,
  UpdateSubscriptionQuantityRequestSchema,
  GrantLicenseRequestSchema,
  RevokeLicenseRequestSchema,
  ChangeLicenseTypeRequestSchema,
  BulkGrantLicenseRequestSchema,
  BulkRevokeLicenseRequestSchema,
  LicenseAssignmentSchema,
  TenantLicenseOverviewSchema,
  AppSubscriptionStatsSchema,
} from '../schemas/licensing.js';
import { SuccessResponseSchema, IdSchema } from '../schemas/common.js';

const c = initContract();

export const licensingContract = c.router(
  {
    // =========================================================================
    // LICENSE TYPES (Catalog)
    // =========================================================================

    createLicenseType: {
      method: 'POST',
      path: '/license-types',
      body: CreateLicenseTypeRequestSchema,
      responses: {
        201: LicenseTypeSchema,
      },
      summary: 'Create a license type',
    },

    getLicenseType: {
      method: 'GET',
      path: '/license-types/:id',
      pathParams: z.object({ id: IdSchema }),
      responses: {
        200: LicenseTypeSchema,
      },
      summary: 'Get a license type',
    },

    getAllLicenseTypes: {
      method: 'GET',
      path: '/license-types',
      query: z.object({ includeArchived: z.coerce.boolean().optional() }),
      responses: {
        200: z.array(LicenseTypeSchema),
      },
      summary: 'List all license types',
    },

    getApplicationLicenseTypes: {
      method: 'GET',
      path: '/applications/:applicationId/license-types',
      pathParams: z.object({ applicationId: IdSchema }),
      query: z.object({ includeArchived: z.coerce.boolean().optional() }),
      responses: {
        200: z.array(LicenseTypeSchema),
      },
      summary: 'List license types for an application',
    },

    updateLicenseType: {
      method: 'PUT',
      path: '/license-types/:id',
      pathParams: z.object({ id: IdSchema }),
      body: UpdateLicenseTypeRequestSchema,
      responses: {
        200: LicenseTypeSchema,
      },
      summary: 'Update a license type',
    },

    archiveLicenseType: {
      method: 'POST',
      path: '/license-types/:id/archive',
      pathParams: z.object({ id: IdSchema }),
      body: z.object({}),
      responses: {
        200: LicenseTypeSchema,
      },
      summary: 'Archive a license type',
    },

    deleteLicenseType: {
      method: 'DELETE',
      path: '/license-types/:id',
      pathParams: z.object({ id: IdSchema }),
      body: z.object({}),
      responses: {
        204: z.void(),
      },
      summary: 'Delete a license type (no active subscriptions)',
    },

    getApplicationSubscriptionStats: {
      method: 'GET',
      path: '/applications/:applicationId/subscription-stats',
      pathParams: z.object({ applicationId: IdSchema }),
      responses: {
        200: AppSubscriptionStatsSchema,
      },
      summary: 'Get subscription stats for an application',
    },

    // =========================================================================
    // SUBSCRIPTIONS (Inventory)
    // =========================================================================

    provisionSubscription: {
      method: 'POST',
      path: '/subscriptions',
      body: ProvisionSubscriptionRequestSchema,
      responses: {
        201: AppSubscriptionSchema,
      },
      summary: 'Provision a new subscription',
    },

    getSubscription: {
      method: 'GET',
      path: '/subscriptions/:id',
      pathParams: z.object({ id: IdSchema }),
      responses: {
        200: AppSubscriptionSchema,
      },
      summary: 'Get a subscription',
    },

    updateSubscriptionQuantity: {
      method: 'PUT',
      path: '/subscriptions/:id/quantity',
      pathParams: z.object({ id: IdSchema }),
      body: UpdateSubscriptionQuantityRequestSchema,
      responses: {
        200: AppSubscriptionSchema,
      },
      summary: 'Update subscription seat count',
    },

    cancelSubscription: {
      method: 'POST',
      path: '/subscriptions/:id/cancel',
      pathParams: z.object({ id: IdSchema }),
      body: z.object({}),
      responses: {
        200: AppSubscriptionSchema,
      },
      summary: 'Cancel a subscription',
    },

    expireSubscription: {
      method: 'POST',
      path: '/subscriptions/:id/expire',
      pathParams: z.object({ id: IdSchema }),
      body: z.object({}),
      responses: {
        200: AppSubscriptionSchema,
      },
      summary: 'Expire a subscription immediately',
    },

    getSubscriptionAssignments: {
      method: 'GET',
      path: '/subscriptions/:id/assignments',
      pathParams: z.object({ id: IdSchema }),
      responses: {
        200: z.array(LicenseAssignmentSchema),
      },
      summary: 'Get assignments for a subscription',
    },

    getTenantSubscriptions: {
      method: 'GET',
      path: '/tenants/:tenantId/subscriptions',
      pathParams: z.object({ tenantId: IdSchema }),
      responses: {
        200: z.array(AppSubscriptionSchema),
      },
      summary: 'Get all subscriptions for a tenant',
    },

    getTenantLicenseOverview: {
      method: 'GET',
      path: '/tenants/:tenantId/license-overview',
      pathParams: z.object({ tenantId: IdSchema }),
      responses: {
        200: TenantLicenseOverviewSchema,
      },
      summary: 'Get full license overview for a tenant',
    },

    checkMemberAccess: {
      method: 'GET',
      path: '/tenants/:tenantId/applications/:applicationId/check-member-access',
      pathParams: z.object({ tenantId: IdSchema, applicationId: IdSchema }),
      responses: {
        200: z.object({
          allowed: z.boolean(),
          mode: z.string(),
          message: z.string().optional(),
          reason: z.string().optional(),
        }),
      },
      summary: 'Check if a new member can be added to an app',
    },

    // =========================================================================
    // LICENSE ASSIGNMENTS (Who has what)
    // =========================================================================

    grantLicense: {
      method: 'POST',
      path: '/licenses/grant',
      body: GrantLicenseRequestSchema,
      responses: {
        200: LicenseAssignmentSchema,
      },
      summary: 'Grant a license to a user',
    },

    revokeLicense: {
      method: 'POST',
      path: '/licenses/revoke',
      body: RevokeLicenseRequestSchema,
      responses: {
        200: SuccessResponseSchema,
      },
      summary: 'Revoke a license from a user',
    },

    changeLicenseType: {
      method: 'POST',
      path: '/licenses/change-type',
      body: ChangeLicenseTypeRequestSchema,
      responses: {
        200: LicenseAssignmentSchema,
      },
      summary: 'Change a user license type',
    },

    grantLicensesBulk: {
      method: 'POST',
      path: '/licenses/grant-bulk',
      body: BulkGrantLicenseRequestSchema,
      responses: {
        200: z.object({ granted: z.number(), errors: z.array(z.string()) }),
      },
      summary: 'Bulk grant licenses',
    },

    revokeLicensesBulk: {
      method: 'POST',
      path: '/licenses/revoke-bulk',
      body: BulkRevokeLicenseRequestSchema,
      responses: {
        200: z.object({ revoked: z.number(), errors: z.array(z.string()) }),
      },
      summary: 'Bulk revoke licenses',
    },

    getUserLicenses: {
      method: 'GET',
      path: '/tenants/:tenantId/users/:userId/licenses',
      pathParams: z.object({ tenantId: IdSchema, userId: IdSchema }),
      responses: {
        200: z.array(LicenseAssignmentSchema),
      },
      summary: 'Get licenses for a user in a tenant',
    },

    revokeAllUserLicenses: {
      method: 'DELETE',
      path: '/tenants/:tenantId/users/:userId/all-licenses',
      pathParams: z.object({ tenantId: IdSchema, userId: IdSchema }),
      body: z.object({}),
      responses: {
        200: SuccessResponseSchema,
      },
      summary: 'Revoke all licenses for a user',
    },

    getAppLicenseHolders: {
      method: 'GET',
      path: '/tenants/:tenantId/applications/:applicationId/license-holders',
      pathParams: z.object({ tenantId: IdSchema, applicationId: IdSchema }),
      responses: {
        200: z.array(z.object({
          userId: z.string(),
          userEmail: z.string(),
          userName: z.string().optional(),
          licenseTypeId: z.string(),
          licenseTypeName: z.string(),
          assignedAt: z.string(),
        })),
      },
      summary: 'Get all license holders for an app in a tenant',
    },

    getTenantMembersWithLicenses: {
      method: 'GET',
      path: '/tenants/:tenantId/members-with-licenses',
      pathParams: z.object({ tenantId: IdSchema }),
      responses: {
        200: z.array(z.object({
          userId: z.string(),
          email: z.string().nullable(),
          givenName: z.string().nullable(),
          familyName: z.string().nullable(),
          membershipId: z.string(),
          licenses: z.array(z.object({
            applicationId: z.string(),
            applicationName: z.string(),
            licenseTypeName: z.string(),
            assignedAt: z.string(),
          })),
        })),
      },
      summary: 'Get tenant members with their license assignments',
    },

    getAvailableLicenseTypesForTenant: {
      method: 'GET',
      path: '/tenants/:tenantId/available-license-types',
      pathParams: z.object({ tenantId: IdSchema }),
      responses: {
        200: z.array(LicenseTypeSchema),
      },
      summary: 'Get license types available for provisioning',
    },
  },
  {
    pathPrefix: '/licensing',
    strictStatusCodes: true,
  },
);
