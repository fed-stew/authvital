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

/**
 * User with tenant memberships included (for admin detail views).
 *
 * Accurate standalone shape mirroring AdminUsersService.getUser. NOT an
 * extension of UserSchema: getUser returns displayName/pictureUrl and grouped
 * rolesByApplication, and does NOT return mfaEnabled/isAnonymous/emailVerified.
 * Dates are z.string() because they serialize to strings over HTTP.
 */
export const UserDetailSchema = z.object({
  id: z.string(),
  email: z.string().nullable(),
  givenName: z.string().nullable(),
  familyName: z.string().nullable(),
  phone: z.string().nullable(),
  displayName: z.string().nullable(),
  pictureUrl: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  memberships: z.array(z.object({
    id: z.string(),
    tenantId: z.string(),
    tenant: z.object({ id: z.string(), name: z.string(), slug: z.string() }),
    status: z.string(),
    joinedAt: z.string().nullable(),
    createdAt: z.string(),
    rolesByApplication: z.array(z.object({
      appId: z.string(),
      appName: z.string(),
      roles: z.array(z.object({ id: z.string(), name: z.string(), slug: z.string() })),
    })),
    totalRoles: z.number(),
  })),
  membershipCount: z.number(),
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
