import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class PlatformAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async overview() {
    const now = new Date();
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      activeOrganizations,
      newOrganizations,
      subscriptions,
      cancelledRecent,
      usageAgg,
    ] = await Promise.all([
      this.prisma.organization.count({ where: { deletedAt: null, status: "ACTIVE" } }),
      this.prisma.organization.count({
        where: { deletedAt: null, createdAt: { gte: startOfMonth } },
      }),
      this.prisma.organizationSubscription.findMany({
        where: { status: { in: ["ACTIVE", "TRIAL"] } },
        include: { plan: true, organization: { select: { id: true, name: true, status: true } } },
      }),
      this.prisma.subscriptionHistory.count({
        where: {
          eventType: "CANCELLED",
          createdAt: { gte: thirtyDaysAgo },
        },
      }),
      this.prisma.usageRecord.groupBy({
        by: ["organizationId"],
        _sum: { value: true },
        orderBy: { _sum: { value: "desc" } },
        take: 10,
      }),
    ]);

    const mrrCents = subscriptions.reduce((sum, s) => sum + (s.plan?.price ?? 0), 0);

    const orgIds = usageAgg.map((u) => u.organizationId);
    const orgs = await this.prisma.organization.findMany({
      where: { id: { in: orgIds } },
      select: { id: true, name: true, status: true },
    });
    const orgMap = new Map(orgs.map((o) => [o.id, o]));

    const priorMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const priorMonthOrgs = await this.prisma.organization.count({
      where: {
        deletedAt: null,
        createdAt: { gte: priorMonthStart, lt: startOfMonth },
      },
    });

    return {
      revenue: {
        mrrCents,
        currency: "USD",
        activeSubscriptions: subscriptions.length,
      },
      growth: {
        newOrganizationsThisMonth: newOrganizations,
        newOrganizationsPriorMonth: priorMonthOrgs,
      },
      churn: {
        cancellationsLast30Days: cancelledRecent,
      },
      usage: {
        topCustomers: usageAgg.map((u) => ({
          organizationId: u.organizationId,
          organizationName: orgMap.get(u.organizationId)?.name ?? "Unknown",
          status: orgMap.get(u.organizationId)?.status ?? null,
          usageQuantity: Number(u._sum.value ?? 0),
        })),
      },
      activeOrganizations,
      planMix: Object.entries(
        subscriptions.reduce<Record<string, number>>((acc, s) => {
          const key = s.plan?.name ?? "Unknown";
          acc[key] = (acc[key] ?? 0) + 1;
          return acc;
        }, {}),
      ).map(([plan, count]) => ({ plan, count })),
    };
  }
}
