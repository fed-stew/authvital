import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Self-service profile update for the authenticated user.
 *
 * DELIBERATELY narrow: only the user's own editable display/name fields are
 * accepted here. Identity- and authorization-sensitive fields (email, roles,
 * tenant membership, MFA, machine flags, etc.) are intentionally NOT editable
 * through this endpoint and must go through their dedicated, guarded flows.
 */
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  givenName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  familyName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  displayName?: string;
}
