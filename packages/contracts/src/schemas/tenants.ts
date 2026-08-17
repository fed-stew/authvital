import { z } from 'zod';
import { MfaPolicySchema, MembershipStatusSchema, SlugSchema } from './common.js';

// =============================================================================
// TENANT SCHEMAS
// =============================================================================

export const TenantSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  settings: z.record(z.unknown()),
  initiateLoginUri: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Tenant = z.infer<typeof TenantSchema>;

export const TenantMemberSchema = z.object({
  id: z.string(), // membership id
  status: z.string(),
  joinedAt: z.string().nullable(),
  createdAt: z.string(),
  user: z.object({
    id: z.string(),
    email: z.string().nullable(),
    givenName: z.string().nullable(),
    familyName: z.string().nullable(),
    displayName: z.string().nullable().optional(),
  }),
  tenantRoles: z.array(z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    description: z.string().nullable(),
    isSystem: z.boolean(),
  })),
  rolesByApplication: z.array(z.object({
    appId: z.string(),
    appName: z.string(),
    roles: z.array(z.object({
      id: z.string(),
      name: z.string(),
      slug: z.string(),
    })),
  })),
  totalRoles: z.number(),
});
export type TenantMember = z.infer<typeof TenantMemberSchema>;

export const TenantDetailSchema = TenantSchema.extend({
  memberCount: z.number(),
  members: z.array(TenantMemberSchema),
  availableRoles: z.array(z.object({
    id: z.string(),
    name: z.string(),
  })),
});
export type TenantDetail = z.infer<typeof TenantDetailSchema>;

export const TenantsListResponseSchema = z.object({
  tenants: z.array(TenantSchema.extend({
    _count: z.object({ memberships: z.number() }).optional(),
  })),
  total: z.number(),
});
export type TenantsListResponse = z.infer<typeof TenantsListResponseSchema>;

export const CreateTenantRequestSchema = z.object({
  name: z.string().min(2),
  slug: SlugSchema,
  ownerEmail: z.string().email().optional(),
});
export type CreateTenantRequest = z.infer<typeof CreateTenantRequestSchema>;

export const UpdateTenantRequestSchema = z.object({
  name: z.string().min(2).optional(),
  slug: SlugSchema.optional(),
  initiateLoginUri: z.string().nullable().optional(),
});
export type UpdateTenantRequest = z.infer<typeof UpdateTenantRequestSchema>;

export const InviteToTenantRequestSchema = z.object({
  email: z.string().email(),
  role: z.string().optional(),
  applicationId: z.string().optional(),
  licenseTypeId: z.string().optional(),
  autoAssign: z.boolean().optional(),
});
export type InviteToTenantRequest = z.infer<typeof InviteToTenantRequestSchema>;

// ---------------------------------------------------------------------------
// Membership Management
// ---------------------------------------------------------------------------

export const UpdateMemberRolesRequestSchema = z.object({
  roleIds: z.array(z.string()),
});
export type UpdateMemberRolesRequest = z.infer<typeof UpdateMemberRolesRequestSchema>;

export const UpdateMembershipStatusRequestSchema = z.object({
  status: MembershipStatusSchema,
});
export type UpdateMembershipStatusRequest = z.infer<typeof UpdateMembershipStatusRequestSchema>;

// ---------------------------------------------------------------------------
// Service Accounts
// ---------------------------------------------------------------------------

export const ServiceAccountSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  tenantId: z.string(),
  isActive: z.boolean(),
  createdAt: z.string(),
});
export type ServiceAccount = z.infer<typeof ServiceAccountSchema>;

export const CreateServiceAccountRequestSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  roleIds: z.array(z.string()).optional(),
});
export type CreateServiceAccountRequest = z.infer<typeof CreateServiceAccountRequestSchema>;

export const UpdateServiceAccountRolesRequestSchema = z.object({
  roleIds: z.array(z.string()),
});
export type UpdateServiceAccountRolesRequest = z.infer<typeof UpdateServiceAccountRolesRequestSchema>;

// ---------------------------------------------------------------------------
// Tenant MFA
// ---------------------------------------------------------------------------

export const TenantMfaPolicyRequestSchema = z.object({
  policy: MfaPolicySchema,
  gracePeriodDays: z.number().int().min(0).optional(),
});
export type TenantMfaPolicyRequest = z.infer<typeof TenantMfaPolicyRequestSchema>;

export const TenantMfaPolicyResponseSchema = z.object({
  policy: MfaPolicySchema,
  gracePeriodDays: z.number().nullable(),
});
export type TenantMfaPolicyResponse = z.infer<typeof TenantMfaPolicyResponseSchema>;

export const TenantMfaStatsResponseSchema = z.object({
  totalMembers: z.number(),
  mfaEnabled: z.number(),
  mfaDisabled: z.number(),
  percentageEnabled: z.number(),
});
export type TenantMfaStatsResponse = z.infer<typeof TenantMfaStatsResponseSchema>;

// ---------------------------------------------------------------------------
// Tenant Roles
// ---------------------------------------------------------------------------

export const TenantRoleSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  permissions: z.array(z.string()),
  isSystem: z.boolean(),
});
export type TenantRole = z.infer<typeof TenantRoleSchema>;

export const AssignTenantRoleRequestSchema = z.object({
  tenantRoleSlug: z.string(),
});
export type AssignTenantRoleRequest = z.infer<typeof AssignTenantRoleRequestSchema>;

// ---------------------------------------------------------------------------
// Domains
// ---------------------------------------------------------------------------

export const DomainSchema = z.object({
  id: z.string(),
  domainName: z.string(),
  tenantId: z.string(),
  isVerified: z.boolean(),
  verifiedAt: z.string().nullable(),
  verificationToken: z.string().nullable(),
  createdAt: z.string(),
});
export type Domain = z.infer<typeof DomainSchema>;

export const RegisterDomainRequestSchema = z.object({
  tenantId: z.string(),
  domainName: z.string().min(3),
});
export type RegisterDomainRequest = z.infer<typeof RegisterDomainRequestSchema>;
