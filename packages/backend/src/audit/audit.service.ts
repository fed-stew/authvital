import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * A single audit entry to record. `tenantId` + `action` + `targetType` are the
 * only hard requirements; everything else is best-effort context.
 */
export interface AuditLogInput {
  tenantId: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  /** Acting user id. Null/undefined for system or M2M-initiated actions. */
  actorUserId?: string | null;
  /** Denormalized actor email; looked up from actorUserId if omitted. */
  actorEmail?: string | null;
  metadata?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
}

export interface AuditQueryFilters {
  action?: string;
  /** Matches actor by userId OR (case-insensitive) email substring. */
  actor?: string;
  from?: Date;
  to?: Date;
  page?: number;
  pageSize?: number;
}

/**
 * AuditService — the tenant audit trail. 
 *
 * Two responsibilities:
 *  1. `log()` — record a security-relevant tenant mutation. This is
 *     DELIBERATELY non-fatal: an audit write must NEVER break the business
 *     operation it is describing, so every failure is swallowed + logged.
 *  2. read APIs (`query`, `exportRows`) — tenant-scoped, paginated,
 *     filterable. tenantId is always supplied by the caller from the
 *     authenticated context (never from a client body).
 *
 * Reuses the existing `AuditLog` model (see prisma/schema/11_audit.prisma)
 * rather than introducing a parallel table.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);
  private static readonly MAX_PAGE_SIZE = 200;
  private static readonly MAX_EXPORT_ROWS = 10_000;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Record an audit entry. Never throws — a failure here must not roll back or
   * break the operation being audited. Fire-and-forget friendly.
   */
  async log(input: AuditLogInput): Promise<void> {
    try {
      let actorEmail = input.actorEmail ?? null;
      if (!actorEmail && input.actorUserId) {
        const actor = await this.prisma.user.findUnique({
          where: { id: input.actorUserId },
          select: { email: true },
        });
        actorEmail = actor?.email ?? null;
      }

      await this.prisma.auditLog.create({
        data: {
          tenantId: input.tenantId,
          userId: input.actorUserId ?? null,
          actorEmail,
          action: input.action,
          targetType: input.targetType,
          targetId: input.targetId ?? null,
          metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
          ipAddress: input.ip ?? null,
          userAgent: input.userAgent ?? null,
        },
      });
    } catch (err) {
      // Non-fatal by design: log and move on.
      this.logger.warn(
        `Failed to write audit log (action=${input.action}, tenant=${input.tenantId}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /** Build the tenant-scoped where clause shared by query + export. */
  private buildWhere(
    tenantId: string,
    filters: AuditQueryFilters,
  ): Prisma.AuditLogWhereInput {
    const where: Prisma.AuditLogWhereInput = { tenantId };

    if (filters.action) {
      where.action = filters.action;
    }

    if (filters.actor) {
      where.OR = [
        { userId: filters.actor },
        { actorEmail: { contains: filters.actor, mode: 'insensitive' } },
      ];
    }

    if (filters.from || filters.to) {
      where.createdAt = {};
      if (filters.from) where.createdAt.gte = filters.from;
      if (filters.to) where.createdAt.lte = filters.to;
    }

    return where;
  }

  /**
   * Paginated, filterable audit read for a single tenant.
   */
  async query(tenantId: string, filters: AuditQueryFilters) {
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(
      AuditService.MAX_PAGE_SIZE,
      Math.max(1, filters.pageSize ?? 50),
    );
    const where = this.buildWhere(tenantId, filters);

    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * Fetch up to MAX_EXPORT_ROWS matching rows (newest first) for CSV export.
   */
  async exportRows(tenantId: string, filters: AuditQueryFilters) {
    const where = this.buildWhere(tenantId, filters);
    return this.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: AuditService.MAX_EXPORT_ROWS,
    });
  }
}
