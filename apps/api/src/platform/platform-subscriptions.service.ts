import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, SubscriptionStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import type { CurrentUserPayload } from "../auth/interfaces/current-user.interface";
import { PlatformNotificationsService } from "./platform-notifications.service";

@Injectable()
export class PlatformSubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: PlatformNotificationsService,
  ) {}

  async list(page = 1, limit = 20, status?: SubscriptionStatus) {
    const where: Prisma.OrganizationSubscriptionWhereInput = status ? { status } : {};
    const [total, items] = await this.prisma.$transaction([
      this.prisma.organizationSubscription.count({ where }),
      this.prisma.organizationSubscription.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          plan: true,
          organization: { select: { id: true, name: true, slug: true, status: true } },
        },
      }),
    ]);

    return {
      items,
      meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  async updateStatus(id: string, status: SubscriptionStatus, actor: CurrentUserPayload) {
    const sub = await this.prisma.organizationSubscription.findUnique({
      where: { id },
      include: { organization: true, plan: true },
    });
    if (!sub) throw new NotFoundException("Subscription not found");

    const updated = await this.prisma.organizationSubscription.update({
      where: { id },
      data: { status },
      include: { plan: true, organization: true },
    });

    await this.audit.log({
      organizationId: sub.organizationId,
      actorUserId: actor.userId,
      action: "platform.subscription.status_change",
      entityType: "OrganizationSubscription",
      entityId: id,
      metadata: { from: sub.status, to: status },
    });

    if (status === "SUSPENDED") {
      await this.notifications.create({
        type: "payment.failed",
        severity: "CRITICAL",
        title: "Payment failed / subscription suspended",
        body: `${sub.organization.name} subscription moved to ${status}.`,
        entityType: "OrganizationSubscription",
        entityId: id,
        metadata: { organizationId: sub.organizationId },
      });
    }

    return updated;
  }
}
