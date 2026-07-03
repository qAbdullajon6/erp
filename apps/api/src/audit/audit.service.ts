import { Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

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
/// never throws: an audit-logging failure must never break the request that
/// triggered it — it only logs the failure so it's visible in server logs.
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
}
