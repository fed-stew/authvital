import {
  IsString,
  IsNotEmpty,
  IsEmail,
  IsOptional,
  IsInt,
  Min,
} from 'class-validator';

/**
 * Body for `POST /api/integration/invite` (M2M).
 *
 * These fields are EXACTLY what IntegrationInvitationsService.sendInvitation
 * consumes (the previous inline controller type advertised
 * `roleIds[]/applicationId/invitedById`, none of which the service reads — a
 * pure documentation drift). This DTO is the real runtime contract and matches
 * the SDK's `sendInvitation` body.
 *
 * `roleId` is a TenantRole **id** (see GET /api/integration/tenant-roles) and
 * is required by the service. With the global ValidationPipe running
 * `whitelist + forbidNonWhitelisted`, only these fields are accepted.
 */
export class SendInvitationDto {
  @IsString()
  @IsNotEmpty()
  tenantId!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  roleId!: string;

  /** Application clientId this invite is for (drives the accept redirect). */
  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  expiresInDays?: number;

  @IsOptional()
  @IsString()
  givenName?: string;

  @IsOptional()
  @IsString()
  familyName?: string;
}
