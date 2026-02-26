import { IsString, IsNotEmpty, IsArray, Matches } from 'class-validator';

/**
 * DTO for assigning a tenant role to a membership
 */
export class AssignTenantRoleDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z][a-z0-9-]*$/, {
    message: 'Role slug must be lowercase alphanumeric with hyphens, starting with a letter',
  })
  tenantRoleSlug!: string;
}

/**
 * DTO for checking a single permission
 */
export class CheckPermissionDto {
  @IsString()
  @IsNotEmpty()
  tenantId!: string;

  @IsString()
  @IsNotEmpty()
  permission!: string;
}

/**
 * DTO for checking multiple permissions
 */
export class CheckPermissionsDto {
  @IsString()
  @IsNotEmpty()
  tenantId!: string;

  @IsArray()
  @IsString({ each: true })
  permissions!: string[];
}

/**
 * DTO for granting app access
 */
export class GrantAppAccessDto {
  @IsArray()
  @IsString({ each: true })
  userIds!: string[];

  @IsString()
  accessType?: string;

  @IsString()
  grantedById?: string;
}
