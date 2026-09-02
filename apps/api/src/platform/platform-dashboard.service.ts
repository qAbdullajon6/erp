import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class PlatformDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async summary() {
    const startOfMonth = new Date();
    startOfMonth.setUTCDate(1);
    startOfMonth.setUTCHours(0, 0, 0, 0);

    const [
      activeOrganizations,
      newOrganizations,
      openTickets,
      unreadNotifications,
      failedPayments,
      attention,
      subscriptions,
    ] = await Promise.all([
      this.prisma.organization.count({ where: { deletedAt: null, status: "ACTIVE" } }),
      this.prisma.organization.count({
        where: { deletedAt: null, createdAt: { gte: startOfMonth } },
      }),
      this.prisma.supportTicket.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] } } }),
      this.prisma.platformNotification.count({ where: { isRead: false } }),
      this.prisma.organizationSubscription.count({ where: { status: "SUSPENDED" } }),
      this.prisma.platformNotification.findMany({
        where: { isRead: false },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
      this.prisma.organizationSubscription.findMany({
        where: { status: { in: ["ACTIVE", "TRIAL"] } },
        include: { plan: true },
      }),
    ]);

    const mrrCents = subscriptions.reduce((sum, s) => sum + (s.plan?.price ?? 0), 0);

    return {
      kpis: {
        activeOrganizations,
        newOrganizationsThisMonth: newOrganizations,
        openTickets,
        unreadNotifications,
        failedPayments,
        mrrCents,
      },
      attention,
    };
  }
}
