import { IsInt, IsOptional, IsString, IsDateString, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Query params for the tenant audit read/export endpoints.
 *
 * NOTE: `tenantId` is intentionally absent — it ALWAYS comes from the URL
 * (`/tenants/:tenantId/audit`) and is enforced by TenantAccessGuard. Trusting a
 * query-supplied tenantId would be a cross-tenant read foot-gun.
 */
export class QueryAuditDto {
  /** Exact action token, e.g. "member.role_changed". */
  @IsOptional()
  @IsString()
  action?: string;

  /** Actor userId (exact) or email substring (case-insensitive). */
  @IsOptional()
  @IsString()
  actor?: string;

  /** ISO date-time lower bound (inclusive). */
  @IsOptional()
  @IsDateString()
  from?: string;

  /** ISO date-time upper bound (inclusive). */
  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number;
}
