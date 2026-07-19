import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { FeatureGateService } from "../../billing/feature-gate.service";

/// Developer Portal subscription service - read-only subscription and quota info.
///
/// Provides API endpoints for:
/// - Current subscription status
/// - Feature gates (boolean features)
/// - Usage quotas (numeric limits)
/// - Remaining limits
/// - Rate limit info
///
/// Used by third-party integrations to check their own organization's subscription.
@Injectable()
export class SubscriptionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly featureGate: FeatureGateService,
  ) {}

  /// Get current subscription details
  async getCurrentSubscription(organizationId: string) {
    const subscription = await this.prisma.organizationSubscription.findUnique({
      where: { organizationId },
      include: { plan: true },
    });

    if (!subscription) {
      return {
        plan: null,
        status: null,
        features: {},
        limits: {},
      };
    }

    const features = subscription.plan.features as any;

    return {
      plan: {
        name: subscription.plan.name,
        slug: subscription.plan.slug,
      },
      status: subscription.status,
      features: {
        analyticsEnabled: features.analyticsEnabled ?? false,
        apiAccessEnabled: features.apiAccessEnabled ?? false,
        customBrandingEnabled: features.customBrandingEnabled ?? false,
        prioritySupportEnabled: features.prioritySupportEnabled ?? false,
        advancedReportingEnabled: features.advancedReportingEnabled ?? false,
      },
      limits: {
        maxUsers: features.maxUsers,
        maxVehicles: features.maxVehicles,
        maxDrivers: features.maxDrivers,
        maxCustomers: features.maxCustomers,
        maxOrders: features.maxOrders,
        maxStorageGB: features.maxStorageGB,
        maxApiRequests: features.maxApiRequests,
        maxAiCredits: features.maxAiCredits,
        maxWebhooks: features.maxWebhooks,
      },
    };
  }

  /// Check if a specific feature is enabled
  async checkFeature(organizationId: string, featureName: string): Promise<boolean> {
    return this.featureGate.canUseFeature(organizationId, featureName);
  }

  /// Get current usage and remaining quotas
  async getQuotas(organizationId: string) {
    const subscription = await this.prisma.organizationSubscription.findUnique({
      where: { organizationId },
      include: { plan: true },
    });

    if (!subscription) {
      return { quotas: [] };
    }

    const features = subscription.plan.features as any;
    const periodStart = subscription.currentPeriodStart;
    const periodEnd = subscription.currentPeriodEnd;

    // Get daily snapshots for current period
    const snapshots = await this.prisma.usageSnapshot.findMany({
      where: {
        organizationId,
        period: "daily",
        periodStart: { gte: periodStart },
      },
    });

    // Aggregate by metric type
    const usageByMetric = new Map<string, number>();
    for (const snapshot of snapshots) {
      const current = usageByMetric.get(snapshot.metricType) || 0;
      usageByMetric.set(snapshot.metricType, current + Number(snapshot.value));
    }

    const metricLimits: Record<string, string> = {
      API_REQUESTS: "maxApiRequests",
      AI_CREDITS: "maxAiCredits",
      STORAGE_GB: "maxStorageGB",
      ORDERS: "maxOrders",
      WEBHOOKS: "maxWebhooks",
      USERS: "maxUsers",
      VEHICLES: "maxVehicles",
      DRIVERS: "maxDrivers",
      CUSTOMERS: "maxCustomers",
    };

    const quotas = Object.entries(metricLimits).map(([metricType, limitKey]) => {
      const used = usageByMetric.get(metricType) || 0;
      const limit = features[limitKey] ?? null; // null = unlimited
      const remaining = limit !== null ? Math.max(0, limit - used) : null;

      return {
        metric: metricType,
        used,
        limit,
        remaining,
        unit: this.getUnitForMetric(metricType),
      };
    });

    return { quotas, periodStart, periodEnd };
  }

  /// Get rate limit info for API requests
  async getRateLimits(organizationId: string) {
    const subscription = await this.prisma.organizationSubscription.findUnique({
      where: { organizationId },
      include: { plan: true },
    });

    if (!subscription) {
      return {
        requestsPerMinute: 10,
        requestsPerHour: 100,
        requestsPerDay: 1000,
      };
    }

    const features = subscription.plan.features as any;
    const maxApiRequests = features.maxApiRequests ?? 10000;

    // Rate limits scale with plan
    // Free: 10/min, Starter: 60/min, Professional: 300/min, Enterprise: unlimited
    const requestsPerMinute =
      maxApiRequests === null
        ? null // unlimited
        : Math.min(Math.ceil(maxApiRequests / 1440), 1000); // monthly limit / 30 days / 24 hours / 60 minutes

    const requestsPerHour = requestsPerMinute ? requestsPerMinute * 60 : null;
    const requestsPerDay = requestsPerHour ? requestsPerHour * 24 : null;

    return {
      requestsPerMinute,
      requestsPerHour,
      requestsPerDay,
      monthlyQuota: maxApiRequests,
    };
  }

  private getUnitForMetric(metricType: string): string {
    const units: Record<string, string> = {
      API_REQUESTS: "requests",
      AI_CREDITS: "credits",
      STORAGE_GB: "GB",
      ORDERS: "orders",
      WEBHOOKS: "webhooks",
      USERS: "users",
      VEHICLES: "vehicles",
      DRIVERS: "drivers",
      CUSTOMERS: "customers",
    };
    return units[metricType] || "units";
  }
}
