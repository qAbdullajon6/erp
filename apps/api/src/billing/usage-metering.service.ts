import { ConflictException, Injectable, Logger } from "@nestjs/common";
import { Prisma, UsageMetricType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { FeatureGateService } from "./feature-gate.service";
import { TRACKED_USAGE_METRICS } from "./usage-metric-types";

export const BYTES_PER_GB = 1024 * 1024 * 1024;

/// Metrics that represent a live total (current inventory), not something
/// that resets each billing period — a company doesn't lose its vehicles or
/// team members when a new month starts. These are recomputed directly from
/// the source-of-truth table on every read, so they can never drift out of
/// sync with reality and correctly "decrement" the instant a record is
/// archived/deleted, with no extra bookkeeping required anywhere.
const LIVE_TOTAL_METRICS = new Set<UsageMetricType>([
  UsageMetricType.USERS,
  UsageMetricType.VEHICLES,
  UsageMetricType.DRIVERS,
  UsageMetricType.CUSTOMERS,
  UsageMetricType.STORAGE_GB,
]);

/// Real-time usage tracking and quota enforcement.
///
/// Current usage for every tracked metric is computed live from its actual
/// source-of-truth table (never a separately-maintained counter that can
/// drift): inventory-style metrics (Users/Vehicles/Drivers/Customers/Storage)
/// are a live count/sum with no time window; consumption-style metrics
/// (Orders/Webhooks/AI credits) are a live count scoped to the current
/// billing period; API requests are scoped to the current calendar day,
/// matching the `api_requests_per_day` plan-feature name.
///
/// Usage:
///   await usageMetering.enforceLimit(orgId, 'ORDERS', 1)   // throws if over plan limit
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

  /// Get current usage for a metric, computed live from its source table.
  /// Returns 0 if the organization has no active subscription (inventory
  /// metrics still resolve, since they don't depend on a billing period).
  async getCurrentUsage(organizationId: string, metricType: UsageMetricType): Promise<number> {
    switch (metricType) {
      case UsageMetricType.USERS:
        // Mirrors BillingSeatsService.countActiveSeats exactly — platform
        // support staff entering a tenant org are not billable seats.
        return this.prisma.membership.count({
          where: { organizationId, status: "ACTIVE", user: { isPlatformAdmin: false } },
        });

      case UsageMetricType.VEHICLES:
        return this.prisma.vehicle.count({ where: { organizationId, archivedAt: null } });

      case UsageMetricType.DRIVERS:
        return this.prisma.driver.count({ where: { organizationId, archivedAt: null } });

      case UsageMetricType.CUSTOMERS:
        return this.prisma.customer.count({ where: { organizationId, archivedAt: null } });

      case UsageMetricType.STORAGE_GB: {
        const result = await this.prisma.orderDocument.aggregate({
          where: { organizationId },
          _sum: { fileSizeBytes: true },
        });
        return (result._sum.fileSizeBytes ?? 0) / BYTES_PER_GB;
      }

      case UsageMetricType.ORDERS: {
        const period = await this.getCurrentBillingPeriod(organizationId);
        if (!period) return 0;
        return this.prisma.order.count({
          where: { organizationId, createdAt: { gte: period.start, lt: period.end } },
        });
      }

      case UsageMetricType.WEBHOOKS: {
        const period = await this.getCurrentBillingPeriod(organizationId);
        if (!period) return 0;
        return this.prisma.webhookDelivery.count({
          where: { organizationId, createdAt: { gte: period.start, lt: period.end } },
        });
      }

      case UsageMetricType.AI_CREDITS: {
        const period = await this.getCurrentBillingPeriod(organizationId);
        if (!period) return 0;
        // 1 assistant turn = 1 credit — a user's prompt doesn't itself cost
        // anything, matching the "each message = 1 credit" convention this
        // metric was originally documented with.
        return this.prisma.aiMessage.count({
          where: {
            organizationId,
            role: "ASSISTANT",
            createdAt: { gte: period.start, lt: period.end },
          },
        });
      }

      case UsageMetricType.API_REQUESTS: {
        // Deliberately a calendar-day window, not the monthly billing
        // period — the plan feature is literally named `api_requests_per_day`.
        const { start, end } = this.getTodayWindow();
        return this.prisma.apiUsageRecord.count({
          where: { organizationId, createdAt: { gte: start, lt: end } },
        });
      }

      default:
        return 0;
    }
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
  /// Throws ConflictException with a user-friendly message if it would —
  /// matching the exception type every other limit-check in this codebase
  /// uses (BillingSeatsService.assertCanAddSeat, uniqueness conflicts, etc.)
  /// so it's caught correctly by the global exception filter and surfaced to
  /// the frontend as a blocking toast rather than a generic 500.
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
      const period = this.getPeriodSuffix(metricType);

      throw new ConflictException(
        `${metricLabel} limit reached. Your plan allows ${limit} ${this.getUnit(metricType)}${period}. ` +
          `Current usage: ${currentUsage}. Upgrade your plan to increase limits.`,
      );
    }
  }

  /// Get usage summary for all metrics.
  /// Used by billing dashboard and customer portal. Still returns live-total
  /// metrics (Users/Vehicles/Drivers/Customers/Storage) for an organization
  /// with no subscription row at all — those don't depend on a billing
  /// period, and the Free-plan-fallback limits still apply to them.
  async getUsageSummary(organizationId: string): Promise<UsageSummary> {
    const period = await this.getCurrentBillingPeriod(organizationId);
    const today = this.getTodayWindow();
    const periodStart = period?.start ?? today.start;
    const periodEnd = period?.end ?? today.end;

    const metrics: MetricUsage[] = [];

    // Get usage for all tracked metrics
    for (const metricType of TRACKED_USAGE_METRICS) {
      const currentUsage = await this.getCurrentUsage(organizationId, metricType);
      const limitKey = this.metricToLimitKey(metricType);
      const limit = await this.featureGate.getLimit(organizationId, limitKey);

      metrics.push({
        metricType,
        label: this.getMetricLabel(metricType),
        currentUsage,
        limit: limit ?? null,
        unit: this.getUnit(metricType),
        percentageUsed: limit ? (currentUsage / limit) * 100 : 0,
        isUnlimited: limit === null,
      });
    }

    return {
      periodStart,
      periodEnd,
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

    for (const metricType of TRACKED_USAGE_METRICS) {
      const result = await this.prisma.usageRecord.aggregate({
        where: {
          organizationId,
          metricType,
          recordedAt: { gte: startOfDay, lte: endOfDay },
        },
        _sum: { value: true },
      });

      const value = result._sum.value?.toNumber() ?? 0;
      if (value === 0) continue; // Skip zero-usage days

      await this.prisma.usageSnapshot.create({
        data: {
          organizationId,
          metricType,
          value: new Prisma.Decimal(value),
          unit: this.getUnit(metricType),
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

    for (const metricType of TRACKED_USAGE_METRICS) {
      const result = await this.prisma.usageRecord.aggregate({
        where: {
          organizationId,
          metricType,
          recordedAt: { gte: startOfMonth, lte: endOfMonth },
        },
        _sum: { value: true },
      });

      const value = result._sum.value?.toNumber() ?? 0;

      await this.prisma.usageSnapshot.create({
        data: {
          organizationId,
          metricType,
          value: new Prisma.Decimal(value),
          unit: this.getUnit(metricType),
          period: "monthly",
          periodStart: startOfMonth,
          periodEnd: endOfMonth,
        },
      });
    }
  }

  /// Midnight-to-midnight window for "today", in server-local time — used
  /// for API_REQUESTS, which is a daily quota (`api_requests_per_day`), not
  /// a monthly one, so it must not be scoped to the billing period.
  private getTodayWindow(): { start: Date; end: Date } {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end };
  }

  /// " per day" / " per month" / "" suffix for enforceLimit's message,
  /// matching each metric's actual reset cadence (or none, for live totals).
  private getPeriodSuffix(metricType: UsageMetricType): string {
    if (LIVE_TOTAL_METRICS.has(metricType)) return "";
    if (metricType === UsageMetricType.API_REQUESTS) return " per day";
    return " per month";
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
