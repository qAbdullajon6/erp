import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { FeatureGateService } from "../../billing/feature-gate.service";

function asFeatureRecord(features: unknown): Record<string, unknown> {
  return typeof features === "object" && features !== null ? (features as Record<string, unknown>) : {};
}

function featureBool(features: Record<string, unknown>, key: string): boolean {
  return features[key] === true;
}

function featureLimit(features: Record<string, unknown>, key: string): number | null | undefined {
  const value = features[key];
  if (value === null) return null;
  return typeof value === "number" ? value : undefined;
}

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

    const features = asFeatureRecord(subscription.plan.features);

    return {
      plan: {
        name: subscription.plan.name,
        slug: subscription.plan.slug,
      },
      status: subscription.status,
      features: {
        analyticsEnabled: featureBool(features, "analyticsEnabled"),
        apiAccessEnabled: featureBool(features, "apiAccessEnabled"),
        customBrandingEnabled: featureBool(features, "customBrandingEnabled"),
        prioritySupportEnabled: featureBool(features, "prioritySupportEnabled"),
        advancedReportingEnabled: featureBool(features, "advancedReportingEnabled"),
      },
      limits: {
        maxUsers: featureLimit(features, "maxUsers"),
        maxVehicles: featureLimit(features, "maxVehicles"),
        maxDrivers: featureLimit(features, "maxDrivers"),
        maxCustomers: featureLimit(features, "maxCustomers"),
        maxOrders: featureLimit(features, "maxOrders"),
        maxStorageGB: featureLimit(features, "maxStorageGB"),
        maxApiRequests: featureLimit(features, "maxApiRequests"),
        maxAiCredits: featureLimit(features, "maxAiCredits"),
        maxWebhooks: featureLimit(features, "maxWebhooks"),
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

    const features = asFeatureRecord(subscription.plan.features);
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
      const limit = featureLimit(features, limitKey) ?? null; // null = unlimited
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

    const features = asFeatureRecord(subscription.plan.features);
    const maxApiRequests = featureLimit(features, "maxApiRequests") ?? 10000;

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
