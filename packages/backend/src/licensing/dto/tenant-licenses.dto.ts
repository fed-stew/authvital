import {
  IsString,
  IsInt,
  Min,
  Max,
  IsOptional,
  IsDateString,
  IsArray,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Tenant-facing licensing DTOs.
 *
 * NOTE: none of these carry `tenantId` — it is ALWAYS taken from the URL
 * (`/tenants/:tenantId/...`) and enforced by TenantAccessGuard. Trusting a
 * body-supplied tenantId would be a cross-tenant injection foot-gun. IDs are
 * cuids, so validate as strings (NOT @IsUUID).
 */

export class GrantLicenseBodyDto {
  @IsString() userId!: string;
  @IsString() applicationId!: string;
  @IsString() licenseTypeId!: string;
}

export class RevokeLicenseBodyDto {
  @IsString() userId!: string;
  @IsString() applicationId!: string;
}

export class ChangeLicenseBodyDto {
  @IsString() userId!: string;
  @IsString() applicationId!: string;
  @IsString() newLicenseTypeId!: string;
}

export class BulkGrantBodyDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => GrantLicenseBodyDto)
  assignments!: GrantLicenseBodyDto[];
}

export class BulkRevokeBodyDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RevokeLicenseBodyDto)
  revocations!: RevokeLicenseBodyDto[];
}

export class ProvisionSubscriptionBodyDto {
  @IsString() applicationId!: string;
  @IsString() licenseTypeId!: string;
  @IsInt() @Min(1) quantityPurchased!: number;
  @IsDateString() currentPeriodEnd!: string;
}

export class UpdateQuantityBodyDto {
  @IsInt() @Min(0) quantityPurchased!: number;
}

/**
 * Query params for the usage-trends endpoint. `days` is the trailing window
 * size; capped to keep the query cheap. tenantId is taken from the URL.
 */
export class UsageTrendsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  days?: number;
}
