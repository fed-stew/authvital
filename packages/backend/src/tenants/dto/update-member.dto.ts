import {
  IsString,
  IsOptional,
  IsArray,
  IsEnum,
  IsNotEmpty,
} from 'class-validator';

/**
 * DTO for updating a member's status
 */
export class UpdateMemberDto {
  @IsOptional()
  @IsEnum(['ACTIVE', 'SUSPENDED'])
  status?: 'ACTIVE' | 'SUSPENDED';
}

/**
 * DTO for assigning an app role to a member
 */
export class AssignAppRoleDto {
  @IsString()
  @IsNotEmpty()
  roleId!: string;
}

/**
 * DTO for granting app access to multiple members
 */
export class GrantAppAccessDto {
  @IsArray()
  @IsString({ each: true })
  membershipIds!: string[];

  @IsString()
  @IsNotEmpty()
  roleId!: string;
}

/**
 * DTO for changing a member's tenant role
 */
export class ChangeMemberRoleDto {
  @IsString()
  @IsNotEmpty()
  roleSlug!: string;
}

/**
 * DTO for toggling app access
 */
export class ToggleAppAccessDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @IsNotEmpty()
  enable!: boolean;

  @IsString()
  @IsOptional()
  roleId?: string;
}
