import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

/// Customer Portal billing service - provides read-only subscription and usage info.
///
/// Customers see:
/// - Current subscription plan and status
/// - Usage summary for current period
/// - Remaining quotas
/// - Invoice history
/// - Payment history
///
/// Security: customers can only view their own organization's billing data.
/// Write operations (upgrades, cancellations) are handled by organization admins.
@Injectable()
export class CustomerBillingService {
  constructor(private readonly prisma: PrismaService) {}

  /// Get subscription overview for customer's organization
  async getSubscriptionOverview(organizationId: string) {
    const subscription = await this.prisma.organizationSubscription.findUnique({
      where: { organizationId },
      include: {
        plan: true,
      },
    });

    if (!subscription) {
      return {
        plan: null,
        status: null,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        trialEndsAt: null,
        cancelAt: null,
        autoRenew: null,
      };
    }

    return {
      plan: {
        name: subscription.plan.name,
        slug: subscription.plan.slug,
        price: subscription.plan.price,
        currency: subscription.plan.currency,
        features: subscription.plan.features,
      },
      status: subscription.status,
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
      trialEndsAt: subscription.trialEndsAt,
      cancelAt: subscription.cancelAt,
      autoRenew: subscription.autoRenew,
    };
  }

  /// Get usage summary for current billing period
  async getUsageSummary(organizationId: string) {
    const subscription = await this.prisma.organizationSubscription.findUnique({
      where: { organizationId },
      include: { plan: true },
    });

    if (!subscription) {
      return { usage: [], periodStart: null, periodEnd: null };
    }

    const periodStart = subscription.currentPeriodStart;
    const periodEnd = subscription.currentPeriodEnd;

    // Get snapshots for current period (daily snapshots)
    const snapshots = await this.prisma.usageSnapshot.findMany({
      where: {
        organizationId,
        period: "daily",
        periodStart: { gte: periodStart },
      },
      orderBy: { metricType: "asc" },
    });

    // Aggregate snapshots by metric type
    const usageByMetric = new Map<string, number>();
    for (const snapshot of snapshots) {
      const current = usageByMetric.get(snapshot.metricType) || 0;
      usageByMetric.set(snapshot.metricType, current + Number(snapshot.value));
    }

    // Get limits from plan features
    const features = subscription.plan.features as any;
    const usage = Array.from(usageByMetric.entries()).map(([metricType, value]) => {
      const limitKey = this.getLimitKeyForMetric(metricType);
      const limit = features[limitKey] ?? null; // null = unlimited

      return {
        metricType,
        value,
        limit,
        unit: this.getUnitForMetricType(metricType),
        percentUsed: limit ? Math.round((value / limit) * 100) : null,
      };
    });

    return {
      usage,
      periodStart,
      periodEnd,
    };
  }

  /// Get invoice history for customer's organization
  async getInvoiceHistory(organizationId: string) {
    const invoices = await this.prisma.invoice.findMany({
      where: {
        customerId: {
          in: await this.prisma.customer
            .findMany({
              where: { organizationId },
              select: { id: true },
            })
            .then((customers) => customers.map((c) => c.id)),
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return invoices.map((invoice) => ({
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      issueDate: invoice.issueDate,
      dueDate: invoice.dueDate,
      totalAmount: invoice.totalAmount,
      status: invoice.status,
      createdAt: invoice.createdAt,
    }));
  }

  /// Get payment history (from subscription history)
  async getPaymentHistory(organizationId: string) {
    const paymentEvents = await this.prisma.subscriptionHistory.findMany({
      where: {
        organizationId,
        eventType: { in: ["RENEWED", "PAYMENT_FAILED"] },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return paymentEvents.map((event) => ({
      id: event.id,
      eventType: event.eventType,
      effectiveDate: event.effectiveDate,
      reason: event.reason,
      metadata: event.metadata,
      createdAt: event.createdAt,
    }));
  }

  /// Check upgrade eligibility
  async getUpgradeEligibility(organizationId: string) {
    const subscription = await this.prisma.organizationSubscription.findUnique({
      where: { organizationId },
      include: { plan: true },
    });

    if (!subscription) {
      return {
        canUpgrade: true,
        currentPlan: null,
        availablePlans: [],
        message: "No active subscription",
      };
    }

    // Get all available plans (higher tier than current)
    const allPlans = await this.prisma.subscriptionPlan.findMany({
      where: {
        isActive: true,
        price: { gt: subscription.plan.price },
      },
      orderBy: { price: "asc" },
    });

    return {
      canUpgrade: allPlans.length > 0,
      currentPlan: {
        name: subscription.plan.name,
        slug: subscription.plan.slug,
        price: subscription.plan.price,
      },
      availablePlans: allPlans.map((plan) => ({
        name: plan.name,
        slug: plan.slug,
        price: plan.price,
        description: plan.description,
        features: plan.features,
      })),
      message:
        allPlans.length > 0
          ? "Contact your organization admin to upgrade"
          : "You are on the highest tier plan",
    };
  }

  private getLimitKeyForMetric(metricType: string): string {
    const mapping: Record<string, string> = {
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
    return mapping[metricType] || "unknown";
  }

  private getUnitForMetricType(metricType: string): string {
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
