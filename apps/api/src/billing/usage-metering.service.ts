import { Injectable, Logger } from "@nestjs/common";
import { Prisma, UsageMetricType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { FeatureGateService } from "./feature-gate.service";

/// Real-time usage tracking and quota enforcement.
///
/// Records every metered event (API call, AI message, order creation) to
/// UsageRecord table. Aggregates into daily/monthly snapshots for fast quota
/// checks. All writes are fire-and-forget (metering failure never blocks user
/// operations).
///
/// Metrics tracked:
/// - API_REQUESTS: Developer Portal API calls
/// - AI_CREDITS: AI Copilot messages (each message = 1 credit)
/// - STORAGE_GB: Document/attachment storage
/// - ORDERS: Orders created this billing period
/// - WEBHOOKS: Webhook deliveries
/// - USERS: Active user count (derived from memberships)
/// - VEHICLES: Active vehicle count
/// - DRIVERS: Active driver count
/// - CUSTOMERS: Active customer count
///
/// Usage:
///   await usageMetering.trackUsage(orgId, 'API_REQUESTS', 1)
///   const used = await usageMetering.getCurrentUsage(orgId, 'ORDERS')
///   const remaining = await usageMetering.getRemainingQuota(orgId, 'AI_CREDITS')
@Injectable()
export class UsageMeteringService {
  private readonly logger = new Logger(UsageMeteringService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly featureGate: FeatureGateService,
  ) {}

  /// Track a usage event. Fire-and-forget, never throws.
  /// Creates a UsageRecord for the current billing period.
  async trackUsage(
    organizationId: string,
    metricType: UsageMetricType,
    value: number,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    try {
      // Get current billing period
      const period = await this.getCurrentBillingPeriod(organizationId);
      if (!period) {
        this.logger.warn(`No active subscription for org ${organizationId}, skipping usage tracking`);
        return;
      }

      await this.prisma.usageRecord.create({
        data: {
          organizationId,
          subscriptionId: period.subscriptionId,
          metricType,
          value: new Prisma.Decimal(value),
          unit: this.getUnit(metricType),
          recordedAt: new Date(),
          periodStart: period.start,
          periodEnd: period.end,
          metadata: metadata ? (metadata as Prisma.InputJsonValue) : undefined,
        },
      });
    } catch (error) {
      // Never throw - metering failures must not block user operations
      this.logger.error(`Failed to track usage for org ${organizationId}:`, error);
    }
  }

  /// Get current usage for a metric in the current billing period.
  /// Returns 0 if no usage records exist.
  async getCurrentUsage(organizationId: string, metricType: UsageMetricType): Promise<number> {
    const period = await this.getCurrentBillingPeriod(organizationId);
    if (!period) return 0;

    // Check snapshot first (faster)
    const snapshot = await this.prisma.usageSnapshot.findFirst({
      where: {
        organizationId,
        metricType,
        period: "monthly",
        periodStart: period.start,
      },
      orderBy: { createdAt: "desc" },
    });

    if (snapshot) {
      // Add usage since snapshot was created
      const recentUsage = await this.prisma.usageRecord.aggregate({
        where: {
          organizationId,
          metricType,
          recordedAt: { gte: snapshot.createdAt },
          periodStart: period.start,
        },
        _sum: { value: true },
      });

      const snapshotValue = snapshot.value.toNumber();
      const recentValue = recentUsage._sum.value?.toNumber() ?? 0;
      return snapshotValue + recentValue;
    }

    // No snapshot, sum all usage records for this period
    const result = await this.prisma.usageRecord.aggregate({
      where: {
        organizationId,
        metricType,
        periodStart: period.start,
        periodEnd: period.end,
      },
      _sum: { value: true },
    });

    return result._sum.value?.toNumber() ?? 0;
  }

  /// Get remaining quota for a metric.
  /// Returns null if unlimited.
  /// Returns 0 if at/over limit.
  async getRemainingQuota(organizationId: string, metricType: UsageMetricType): Promise<number | null> {
    const currentUsage = await this.getCurrentUsage(organizationId, metricType);
    const limitKey = this.metricToLimitKey(metricType);
    return this.featureGate.remainingQuota(organizationId, limitKey, currentUsage);
  }

  /// Check if usage would exceed limit.
  /// Throws ConflictException with user-friendly message if would exceed.
  async enforceLimit(
    organizationId: string,
    metricType: UsageMetricType,
    increment: number = 1,
  ): Promise<void> {
    const currentUsage = await this.getCurrentUsage(organizationId, metricType);
    const limitKey = this.metricToLimitKey(metricType);

    const wouldExceed = await this.featureGate.wouldExceedLimit(
      organizationId,
      limitKey,
      currentUsage,
      increment,
    );

    if (wouldExceed) {
      const limit = await this.featureGate.getLimit(organizationId, limitKey);
      const metricLabel = this.getMetricLabel(metricType);

      throw new Error(
        `${metricLabel} limit exceeded. Your plan allows ${limit} ${this.getUnit(metricType)} per month. ` +
          `Current usage: ${currentUsage}. Upgrade your plan to increase limits.`,
      );
    }
  }

  /// Get usage summary for all metrics.
  /// Used by billing dashboard and customer portal.
  async getUsageSummary(organizationId: string): Promise<UsageSummary> {
    const period = await this.getCurrentBillingPeriod(organizationId);
    if (!period) {
      return {
        periodStart: new Date(),
        periodEnd: new Date(),
        metrics: [],
      };
    }

    const metrics: MetricUsage[] = [];

    // Get usage for all tracked metrics
    for (const metricType of Object.values(UsageMetricType)) {
      const currentUsage = await this.getCurrentUsage(organizationId, metricType as UsageMetricType);
      const limitKey = this.metricToLimitKey(metricType as UsageMetricType);
      const limit = await this.featureGate.getLimit(organizationId, limitKey);

      metrics.push({
        metricType: metricType as UsageMetricType,
        label: this.getMetricLabel(metricType as UsageMetricType),
        currentUsage,
        limit: limit ?? null,
        unit: this.getUnit(metricType as UsageMetricType),
        percentageUsed: limit ? (currentUsage / limit) * 100 : 0,
        isUnlimited: limit === null,
      });
    }

    return {
      periodStart: period.start,
      periodEnd: period.end,
      metrics,
    };
  }

  /// Create daily snapshot for all metrics.
  /// Called by background job at end of each day.
  async createDailySnapshot(organizationId: string, date: Date): Promise<void> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    for (const metricType of Object.values(UsageMetricType)) {
      const result = await this.prisma.usageRecord.aggregate({
        where: {
          organizationId,
          metricType: metricType as UsageMetricType,
          recordedAt: { gte: startOfDay, lte: endOfDay },
        },
        _sum: { value: true },
      });

      const value = result._sum.value?.toNumber() ?? 0;
      if (value === 0) continue; // Skip zero-usage days

      await this.prisma.usageSnapshot.create({
        data: {
          organizationId,
          metricType: metricType as UsageMetricType,
          value: new Prisma.Decimal(value),
          unit: this.getUnit(metricType as UsageMetricType),
          period: "daily",
          periodStart: startOfDay,
          periodEnd: endOfDay,
        },
      });
    }
  }

  /// Create monthly snapshot for all metrics.
  /// Called by background job at end of each month.
  async createMonthlySnapshot(organizationId: string, year: number, month: number): Promise<void> {
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);

    for (const metricType of Object.values(UsageMetricType)) {
      const result = await this.prisma.usageRecord.aggregate({
        where: {
          organizationId,
          metricType: metricType as UsageMetricType,
          recordedAt: { gte: startOfMonth, lte: endOfMonth },
        },
        _sum: { value: true },
      });

      const value = result._sum.value?.toNumber() ?? 0;

      await this.prisma.usageSnapshot.create({
        data: {
          organizationId,
          metricType: metricType as UsageMetricType,
          value: new Prisma.Decimal(value),
          unit: this.getUnit(metricType as UsageMetricType),
          period: "monthly",
          periodStart: startOfMonth,
          periodEnd: endOfMonth,
        },
      });
    }
  }

  /// Get current billing period for an organization.
  /// Returns null if no active subscription.
  private async getCurrentBillingPeriod(
    organizationId: string,
  ): Promise<{ subscriptionId: string; start: Date; end: Date } | null> {
    const subscription = await this.prisma.organizationSubscription.findUnique({
      where: { organizationId },
      select: {
        id: true,
        currentPeriodStart: true,
        currentPeriodEnd: true,
        status: true,
      },
    });

    if (!subscription || subscription.status === "EXPIRED" || subscription.status === "CANCELLED") {
      return null;
    }

    return {
      subscriptionId: subscription.id,
      start: subscription.currentPeriodStart,
      end: subscription.currentPeriodEnd,
    };
  }

  /// Map metric type to plan limit key.
  private metricToLimitKey(metricType: UsageMetricType): string {
    const mapping: Record<UsageMetricType, string> = {
      API_REQUESTS: "api_requests_per_day",
      AI_CREDITS: "ai_credits_per_month",
      STORAGE_GB: "storage_gb",
      ORDERS: "orders_per_month",
      WEBHOOKS: "webhooks_per_month",
      USERS: "users",
      VEHICLES: "vehicles",
      DRIVERS: "drivers",
      CUSTOMERS: "customers",
    };
    return mapping[metricType];
  }

  /// Get unit for metric type.
  private getUnit(metricType: UsageMetricType): string {
    const units: Record<UsageMetricType, string> = {
      API_REQUESTS: "requests",
      AI_CREDITS: "credits",
      STORAGE_GB: "gb",
      ORDERS: "orders",
      WEBHOOKS: "deliveries",
      USERS: "users",
      VEHICLES: "vehicles",
      DRIVERS: "drivers",
      CUSTOMERS: "customers",
    };
    return units[metricType];
  }

  /// Get human-readable label for metric.
  private getMetricLabel(metricType: UsageMetricType): string {
    const labels: Record<UsageMetricType, string> = {
      API_REQUESTS: "API Requests",
      AI_CREDITS: "AI Credits",
      STORAGE_GB: "Storage",
      ORDERS: "Orders",
      WEBHOOKS: "Webhooks",
      USERS: "Users",
      VEHICLES: "Vehicles",
      DRIVERS: "Drivers",
      CUSTOMERS: "Customers",
    };
    return labels[metricType];
  }
}

export interface UsageSummary {
  periodStart: Date;
  periodEnd: Date;
  metrics: MetricUsage[];
}

export interface MetricUsage {
  metricType: UsageMetricType;
  label: string;
  currentUsage: number;
  limit: number | null;
  unit: string;
  percentageUsed: number;
  isUnlimited: boolean;
}
