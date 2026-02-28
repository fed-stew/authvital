import { IsString, IsOptional, IsNotEmpty, IsEmail } from 'class-validator';

/**
 * DTO for inviting a new member to the tenant
 * Supports both email-based invites and direct user ID invites
 */
export class InviteMemberDto {
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @IsString()
  @IsNotEmpty()
  tenantId!: string;

  @IsString()
  @IsOptional()
  userId?: string; // For direct membership creation (user already exists)

  @IsString()
  @IsOptional()
  tenantRoleSlug?: string; // defaults to 'member'

  @IsString()
  @IsOptional()
  applicationId?: string; // Pre-assign app access

  @IsString()
  @IsOptional()
  roleId?: string; // App role if applicationId is provided
}
