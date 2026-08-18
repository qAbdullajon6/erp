import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { ListAuditLogsQueryDto } from "./dto/list-audit-logs-query.dto";

export interface AuditLogEntry {
  /// Null for security events that happen before an organization is known
  /// (e.g. a failed login against an email that matches no user at all).
  organizationId?: string | null;
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}

/// Single place every module writes audit events through. Deliberately
/// never throws on write: an audit-logging failure must never break the
/// request that triggered it — it only logs the failure so it's visible
/// in server logs. Read methods (list/getById) do throw as normal.
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditLogEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          organizationId: entry.organizationId ?? null,
          actorUserId: entry.actorUserId ?? null,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId ?? null,
          metadata: (entry.metadata as Prisma.InputJsonValue) ?? undefined,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to write audit log for action "${entry.action}"`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /// Tenant-scoped list for `/app/audit-logs`. Never returns another org's
  /// events — `organizationId` is taken from the JWT membership only.
  async listForOrganization(organizationId: string, query: ListAuditLogsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const sortBy = query.sortBy ?? "createdAt";
    const sortOrder = query.sortOrder ?? "desc";

    const where: Prisma.AuditLogWhereInput = {
      organizationId,
      ...(query.action ? { action: { contains: query.action, mode: "insensitive" } } : {}),
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
      ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { action: { contains: query.search, mode: "insensitive" } },
              { entityType: { contains: query.search, mode: "insensitive" } },
              { entityId: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [total, items] = await this.prisma.$transaction([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          actor: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      }),
    ]);

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async getByIdForOrganization(organizationId: string, id: string) {
    const entry = await this.prisma.auditLog.findFirst({
      where: { id, organizationId },
      include: {
        actor: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });
    if (!entry) throw new NotFoundException("Audit log entry not found");
    return entry;
  }
}
