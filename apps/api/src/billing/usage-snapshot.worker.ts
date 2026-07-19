import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service";
import { UsageMeteringService } from "./usage-metering.service";
import { FeatureGateService } from "./feature-gate.service";

/// Usage snapshot worker - aggregates raw usage records into daily/monthly snapshots.
///
/// Runs daily at 1am UTC (after renewal worker). Processes:
/// 1. Daily snapshots: aggregate yesterday's usage records per org/metric
/// 2. Monthly snapshots: on first day of month, aggregate previous month
/// 3. Cache refresh: invalidate cached plan limits after snapshot to reflect new usage
/// 4. Cleanup: delete raw usage records older than 90 days
///
/// Why snapshots:
/// - Performance: quota checks read snapshots, not raw records (fast aggregates)
/// - Retention: raw records deleted after 90 days, snapshots kept forever (billing history)
/// - Accuracy: snapshots are point-in-time; raw records can be deleted without losing totals
///
/// Safety:
/// - Idempotent: creating same snapshot twice = no-op (unique constraint)
/// - Organization-scoped: processes all orgs independently
/// - Atomic: each org's snapshot is a single transaction
@Injectable()
export class UsageSnapshotWorker {
  private readonly logger = new Logger(UsageSnapshotWorker.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly usageMeteringService: UsageMeteringService,
    private readonly featureGateService: FeatureGateService,
  ) {}

  /// Run daily at 1am UTC
  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async handleUsageSnapshots(): Promise<void> {
    this.logger.log("Starting usage snapshot worker");

    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const periodStart = yesterday;
    const periodEnd = new Date(yesterday);
    periodEnd.setDate(periodEnd.getDate() + 1);

    let dailySnapshotCount = 0;
    let monthlySnapshotCount = 0;
    let cacheInvalidatedCount = 0;
    let cleanupCount = 0;
    let errorCount = 0;

    try {
      // 1. Get all organizations with subscriptions
      const organizations = await this.prisma.organization.findMany({
        where: {
          subscription: { isNot: null },
        },
        include: {
          subscription: { include: { plan: true } },
        },
      });

      // 2. Create daily snapshots for each org
      for (const org of organizations) {
        try {
          await this.createDailySnapshot(org.id, periodStart, periodEnd);
          dailySnapshotCount++;

          // Invalidate cached plan limits for this org
          this.featureGateService.clearCache(org.id);
          cacheInvalidatedCount++;
        } catch (error: any) {
          errorCount++;
          this.logger.error(`Failed to create daily snapshot for org ${org.id}:`, error);
        }
      }

      // 3. If first day of month, create monthly snapshots
      if (now.getDate() === 1) {
        const lastMonth = new Date(now);
        lastMonth.setMonth(lastMonth.getMonth() - 1);
        lastMonth.setDate(1);
        lastMonth.setHours(0, 0, 0, 0);

        const monthEnd = new Date(now);
        monthEnd.setDate(1);
        monthEnd.setHours(0, 0, 0, 0);

        for (const org of organizations) {
          try {
            await this.createMonthlySnapshot(org.id, lastMonth, monthEnd);
            monthlySnapshotCount++;
          } catch (error: any) {
            errorCount++;
            this.logger.error(`Failed to create monthly snapshot for org ${org.id}:`, error);
          }
        }
      }

      // 4. Cleanup: delete raw usage records older than 90 days
      const ninetyDaysAgo = new Date(now);
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

      const deleted = await this.prisma.usageRecord.deleteMany({
        where: {
          recordedAt: { lt: ninetyDaysAgo },
        },
      });

      cleanupCount = deleted.count;

      // Summary
      this.logger.log(
        `Usage snapshot worker completed: ${dailySnapshotCount} daily snapshots, ` +
        `${monthlySnapshotCount} monthly snapshots, ${cacheInvalidatedCount} caches invalidated, ` +
        `${cleanupCount} records cleaned up, ${errorCount} errors`,
      );
    } catch (error: any) {
      this.logger.error("Usage snapshot worker failed:", error);
      throw error;
    }
  }

  private async createDailySnapshot(
    organizationId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<void> {
    // Aggregate usage records for this org/period across all metric types
    const metricTypes = [
      "API_REQUESTS",
      "AI_CREDITS",
      "STORAGE_GB",
      "ORDERS",
      "WEBHOOKS",
      "USERS",
      "VEHICLES",
      "DRIVERS",
      "CUSTOMERS",
    ];

    for (const metricType of metricTypes) {
      const aggregate = await this.prisma.usageRecord.aggregate({
        where: {
          organizationId,
          metricType: metricType as any,
          recordedAt: {
            gte: periodStart,
            lt: periodEnd,
          },
        },
        _sum: { value: true },
      });

      const totalValue = aggregate._sum.value || 0;

      // Get current subscription
      const subscription = await this.prisma.organizationSubscription.findUnique({
        where: { organizationId },
        include: { plan: true },
      });

      // Create snapshot (upsert for idempotency)
      await this.prisma.usageSnapshot.upsert({
        where: {
          organizationId_metricType_period_periodStart: {
            organizationId,
            metricType: metricType as any,
            period: "daily",
            periodStart,
          },
        },
        create: {
          organizationId,
          planId: subscription?.planId,
          metricType: metricType as any,
          value: totalValue,
          unit: this.getUnitForMetricType(metricType as any),
          period: "daily",
          periodStart,
          periodEnd,
        },
        update: {
          value: totalValue,
          periodEnd,
        },
      });
    }
  }

  private async createMonthlySnapshot(
    organizationId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<void> {
    const metricTypes = [
      "API_REQUESTS",
      "AI_CREDITS",
      "STORAGE_GB",
      "ORDERS",
      "WEBHOOKS",
      "USERS",
      "VEHICLES",
      "DRIVERS",
      "CUSTOMERS",
    ];

    for (const metricType of metricTypes) {
      const aggregate = await this.prisma.usageRecord.aggregate({
        where: {
          organizationId,
          metricType: metricType as any,
          recordedAt: {
            gte: periodStart,
            lt: periodEnd,
          },
        },
        _sum: { value: true },
      });

      const totalValue = aggregate._sum.value || 0;

      const subscription = await this.prisma.organizationSubscription.findUnique({
        where: { organizationId },
        include: { plan: true },
      });

      await this.prisma.usageSnapshot.upsert({
        where: {
          organizationId_metricType_period_periodStart: {
            organizationId,
            metricType: metricType as any,
            period: "monthly",
            periodStart,
          },
        },
        create: {
          organizationId,
          planId: subscription?.planId,
          metricType: metricType as any,
          value: totalValue,
          unit: this.getUnitForMetricType(metricType as any),
          period: "monthly",
          periodStart,
          periodEnd,
        },
        update: {
          value: totalValue,
          periodEnd,
        },
      });
    }
  }

  private getUnitForMetricType(metricType: string): string {
    const units: Record<string, string> = {
      API_REQUESTS: "requests",
      AI_CREDITS: "credits",
      STORAGE_GB: "gb",
      ORDERS: "count",
      WEBHOOKS: "count",
      USERS: "count",
      VEHICLES: "count",
      DRIVERS: "count",
      CUSTOMERS: "count",
    };
    return units[metricType] || "count";
  }
}
