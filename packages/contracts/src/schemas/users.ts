import { z } from 'zod';

// =============================================================================
// USER SCHEMAS
// =============================================================================

export const UserSchema = z.object({
  id: z.string(),
  email: z.string().email().nullable(),
  givenName: z.string().nullable(),
  familyName: z.string().nullable(),
  phone: z.string().nullable(),
  mfaEnabled: z.boolean(),
  isAnonymous: z.boolean(),
  emailVerified: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type User = z.infer<typeof UserSchema>;

/** User with tenant memberships included (for admin detail views) */
export const UserDetailSchema = UserSchema.extend({
  memberships: z.array(z.object({
    id: z.string(),
    status: z.string(),
    joinedAt: z.string().nullable(),
    tenant: z.object({
      id: z.string(),
      name: z.string(),
      slug: z.string(),
    }),
    tenantRoles: z.array(z.object({
      id: z.string(),
      name: z.string(),
      slug: z.string(),
    })),
  })),
});
export type UserDetail = z.infer<typeof UserDetailSchema>;

export const CreateUserRequestSchema = z.object({
  email: z.string().email().optional(),
  password: z.string().min(8).optional(),
  givenName: z.string().optional(),
  familyName: z.string().optional(),
  phone: z.string().optional(),
});
export type CreateUserRequest = z.infer<typeof CreateUserRequestSchema>;

export const UpdateUserRequestSchema = z.object({
  email: z.string().email().optional(),
  givenName: z.string().optional(),
  familyName: z.string().optional(),
  phone: z.string().optional(),
});
export type UpdateUserRequest = z.infer<typeof UpdateUserRequestSchema>;

export const UsersListResponseSchema = z.object({
  users: z.array(UserSchema),
  total: z.number(),
});
export type UsersListResponse = z.infer<typeof UsersListResponseSchema>;
