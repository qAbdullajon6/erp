import { Injectable } from "@nestjs/common";
import { PlatformNotificationSeverity, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

export interface CreatePlatformNotificationInput {
  type: string;
  severity?: PlatformNotificationSeverity;
  title: string;
  body: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class PlatformNotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreatePlatformNotificationInput) {
    return this.prisma.platformNotification.create({
      data: {
        type: input.type,
        severity: input.severity ?? "INFO",
        title: input.title,
        body: input.body,
        entityType: input.entityType,
        entityId: input.entityId,
        metadata: (input.metadata as Prisma.InputJsonValue) ?? undefined,
      },
    });
  }

  async list(limit = 50) {
    const [items, unreadCount] = await this.prisma.$transaction([
      this.prisma.platformNotification.findMany({
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
      this.prisma.platformNotification.count({ where: { isRead: false } }),
    ]);
    return { items, unreadCount };
  }

  async markRead(id: string) {
    return this.prisma.platformNotification.update({
      where: { id },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async markAllRead() {
    const result = await this.prisma.platformNotification.updateMany({
      where: { isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return { updated: result.count };
  }
}
