import { IsString, IsNotEmpty } from 'class-validator';

/**
 * Body for `POST /api/integration/set-member-role` (M2M).
 *
 * Sets a member's role WITHIN an application (the app-scoped role, i.e. a
 * MembershipRole -> Role binding), NOT the tenant-level role. All three fields
 * are meaningful:
 *  - `membershipId`  : the target membership.
 *  - `roleId`        : an application Role **id** (from GET /roles/:clientId).
 *  - `applicationId` : the application the role belongs to (guards against
 *                      assigning a role from a different app).
 *
 * This matches the SDK's fixed body shape `{ membershipId, roleId, applicationId }`.
 * IDs are cuids -> validate as non-empty strings (NOT @IsUUID).
 */
export class SetMemberRoleDto {
  @IsString()
  @IsNotEmpty()
  membershipId!: string;

  @IsString()
  @IsNotEmpty()
  roleId!: string;

  @IsString()
  @IsNotEmpty()
  applicationId!: string;
}
