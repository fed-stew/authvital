import { Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantAccessGuard, TenantIdentifierGuard } from '../tenants/guards';
import { PermissionGuard } from '../authorization/guards/permission.guard';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';
import { TENANT_PERMISSIONS } from '../authorization/constants';
import { AuditService, AuditQueryFilters } from './audit.service';
import { QueryAuditDto } from './dto/query-audit.dto';

/**
 * AuditController - tenant-scoped audit trail (read-only).
 *
 * Security model mirrors the other tenant-scoped controllers:
 * - JwtAuthGuard              -> authenticated user
 * - TenantIdentifierGuard     -> slug -> id normalisation
 * - TenantAccessGuard         -> caller is a member of :tenantId (fresh perms)
 * - PermissionGuard           -> @RequirePermission enforcement
 *
 * tenantId ALWAYS comes from the URL; there are no cross-tenant reads.
 */
@Controller('tenants/:tenantId/audit')
@UseGuards(JwtAuthGuard, TenantIdentifierGuard, TenantAccessGuard, PermissionGuard)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  private toFilters(dto: QueryAuditDto): AuditQueryFilters {
    return {
      action: dto.action,
      actor: dto.actor,
      from: dto.from ? new Date(dto.from) : undefined,
      to: dto.to ? new Date(dto.to) : undefined,
      page: dto.page,
      pageSize: dto.pageSize,
    };
  }

  /**
   * GET /api/tenants/:tenantId/audit
   * Paginated, filterable audit log for the tenant.
   */
  @Get()
  @RequirePermission(TENANT_PERMISSIONS.AUDIT_VIEW)
  async list(@Param('tenantId') tenantId: string, @Query() dto: QueryAuditDto) {
    return this.auditService.query(tenantId, this.toFilters(dto));
  }

  /**
   * GET /api/tenants/:tenantId/audit/export
   * CSV export of the (filtered) audit log.
   */
  @Get('export')
  @RequirePermission(TENANT_PERMISSIONS.AUDIT_EXPORT)
  async export(
    @Param('tenantId') tenantId: string,
    @Query() dto: QueryAuditDto,
    @Res() res: Response,
  ): Promise<void> {
    const rows = await this.auditService.exportRows(tenantId, this.toFilters(dto));
    const csv = this.toCsv(rows);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="audit-${tenantId}-${new Date().toISOString().slice(0, 10)}.csv"`,
    );
    res.send(csv);
  }

  private toCsv(
    rows: Array<{
      createdAt: Date;
      action: string;
      targetType: string;
      targetId: string | null;
      userId: string | null;
      actorEmail: string | null;
      ipAddress: string | null;
      metadata: unknown;
    }>,
  ): string {
    const header = [
      'createdAt',
      'action',
      'targetType',
      'targetId',
      'actorUserId',
      'actorEmail',
      'ipAddress',
      'metadata',
    ];

    const escape = (value: unknown): string => {
      const str =
        value == null
          ? ''
          : typeof value === 'object'
            ? JSON.stringify(value)
            : String(value);
      // RFC 4180: wrap in quotes and double any embedded quotes.
      return `"${str.replace(/"/g, '""')}"`;
    };

    const lines = [header.join(',')];
    for (const r of rows) {
      lines.push(
        [
          r.createdAt.toISOString(),
          r.action,
          r.targetType,
          r.targetId,
          r.userId,
          r.actorEmail,
          r.ipAddress,
          r.metadata,
        ]
          .map(escape)
          .join(','),
      );
    }
    return lines.join('\r\n');
  }
}
