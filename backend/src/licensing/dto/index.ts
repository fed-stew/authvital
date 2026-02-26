import {
  IsString,
  IsOptional,
  IsNumber,
  IsEnum,
  IsArray,
  IsUUID,
  IsObject,
  IsDateString,
  Min,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { LicenseTypeStatus } from "@prisma/client";

// =============================================================================
// LICENSE TYPE DTOs
// =============================================================================

export class CreateLicenseTypeDto {
  @IsString()
  name!: string;

  @IsString()
  slug!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsUUID()
  applicationId!: string;

  @IsOptional()
  @IsObject()
  features?: Record<string, boolean>;

  @IsOptional()
  @IsNumber()
  displayOrder?: number;

  @IsOptional()
  @IsEnum(LicenseTypeStatus)
  status?: LicenseTypeStatus;

  @IsOptional()
  @IsNumber()
  @Min(1)
  maxMembers?: number;
}

export class UpdateLicenseTypeDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsObject()
  features?: Record<string, boolean>;

  @IsOptional()
  @IsNumber()
  displayOrder?: number;

  @IsOptional()
  @IsEnum(LicenseTypeStatus)
  status?: LicenseTypeStatus;

  @IsOptional()
  @IsNumber()
  @Min(1)
  maxMembers?: number;
}

// =============================================================================
// SUBSCRIPTION DTOs
// =============================================================================

export class ProvisionSubscriptionDto {
  @IsUUID()
  tenantId!: string;

  @IsUUID()
  applicationId!: string;

  @IsUUID()
  licenseTypeId!: string;

  @IsNumber()
  @Min(1)
  quantityPurchased!: number;

  @IsDateString()
  currentPeriodEnd!: string;
}

export class UpdateSubscriptionQuantityDto {
  @IsNumber()
  @Min(0)
  quantityPurchased!: number;
}

// =============================================================================
// LICENSE ASSIGNMENT DTOs
// =============================================================================

export class GrantLicenseDto {
  @IsUUID()
  tenantId!: string;

  @IsUUID()
  userId!: string;

  @IsUUID()
  applicationId!: string;

  @IsUUID()
  licenseTypeId!: string;
}

export class RevokeLicenseDto {
  @IsUUID()
  tenantId!: string;

  @IsUUID()
  userId!: string;

  @IsUUID()
  applicationId!: string;
}

export class ChangeLicenseTypeDto {
  @IsUUID()
  tenantId!: string;

  @IsUUID()
  userId!: string;

  @IsUUID()
  applicationId!: string;

  @IsUUID()
  newLicenseTypeId!: string;
}

// =============================================================================
// LICENSE CHECK DTOs
// =============================================================================

export class CheckLicenseDto {
  @IsUUID()
  tenantId!: string;

  @IsUUID()
  userId!: string;

  @IsUUID()
  applicationId!: string;
}

export class BulkCheckLicenseDto {
  @IsUUID()
  tenantId!: string;

  @IsUUID()
  userId!: string;

  @IsArray()
  @IsUUID("4", { each: true })
  applicationIds!: string[];
}

export class CheckFeatureDto {
  @IsUUID()
  tenantId!: string;

  @IsUUID()
  userId!: string;

  @IsUUID()
  applicationId!: string;

  @IsString()
  featureKey!: string;
}

// =============================================================================
// BULK LICENSE OPERATIONS DTOs
// =============================================================================

export class BulkGrantLicenseDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GrantLicenseDto)
  assignments!: GrantLicenseDto[];
}

export class BulkRevokeLicenseDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RevokeLicenseDto)
  revocations!: RevokeLicenseDto[];
}
