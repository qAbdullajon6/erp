import { Injectable } from "@nestjs/common";
import type { AiTool } from "./tool.interface";
import type { CurrentUserPayload } from "../../auth/interfaces/current-user.interface";
import type { MembershipRole } from "@prisma/client";
import { FeatureGateService } from "../../billing/feature-gate.service";
import { UsageMeteringService } from "../../billing/usage-metering.service";
import { BillingSeatsService } from "../../billing/billing-seats.service";
import { SubscriptionLifecycleService } from "../../billing/subscription-lifecycle.service";
import { SubscriptionPlanService } from "../../billing/subscription-plan.service";

/// AI Copilot billing tools - subscription info, usage, limits, recommendations.
///
/// Tools:
/// 1. subscription_summary - Current plan, status, billing period
/// 2. current_limits - All plan limits and usage
/// 3. remaining_quota - Quota left for specific metric
/// 4. upgrade_recommendation - Suggest plan upgrade based on usage
/// 5. seat_summary - Seat usage and availability
///
/// Security: All tools scoped to user's organization (from JWT).
@Injectable()
export class BillingTools {
  constructor(
    private readonly featureGate: FeatureGateService,
    private readonly usageMetering: UsageMeteringService,
    private readonly seatsService: BillingSeatsService,
    private readonly lifecycle: SubscriptionLifecycleService,
    private readonly planService: SubscriptionPlanService,
  ) {}

  getTools(): AiTool[] {
    const ALL_STAFF: readonly MembershipRole[] = [
      "ADMIN",
      "OPERATIONS_MANAGER",
      "DISPATCHER",
      "ACCOUNTANT",
      "SALES_CRM_MANAGER",
    ];

    return [
      {
        name: "subscription_summary",
        description:
          "Get current subscription plan, status, billing period, and trial info. " +
          "Use when user asks about their plan, subscription status, or billing cycle.",
        parameters: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        allowedRoles: ALL_STAFF,
        mutating: false,
        handler: async (args, user: CurrentUserPayload) => {
          try {
            const subscription = await this.lifecycle["prisma"].organizationSubscription.findUnique({
              where: { organizationId: user.organizationId },
              include: { plan: true },
            });

            if (!subscription) {
              return { error: "No active subscription found" };
            }

            return {
              plan: {
                name: subscription.plan.name,
                slug: subscription.plan.slug,
                price: subscription.plan.price,
                currency: subscription.plan.currency,
              },
              status: subscription.status,
              seats: subscription.seats,
              currentPeriodStart: subscription.currentPeriodStart,
              currentPeriodEnd: subscription.currentPeriodEnd,
              trialEndsAt: subscription.trialEndsAt,
              autoRenew: subscription.autoRenew,
              cancelAt: subscription.cancelAt,
            };
          } catch (error: any) {
            return { error: "No active subscription found" };
          }
        },
      },
      {
        name: "current_limits",
        description:
          "Get all plan limits and current usage across all metrics. " +
          "Use when user asks 'what are my limits', 'how much am I using', or 'what's included in my plan'.",
        parameters: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        allowedRoles: ALL_STAFF,
        mutating: false,
        handler: async (args: Record<string, unknown>, user: CurrentUserPayload) => {
          const summary = await this.usageMetering.getUsageSummary(user.organizationId);

          return {
            periodStart: summary.periodStart,
            periodEnd: summary.periodEnd,
            metrics: summary.metrics.map((m) => ({
              metric: m.label,
              currentUsage: m.currentUsage,
              limit: m.isUnlimited ? "unlimited" : m.limit,
              unit: m.unit,
              percentageUsed: m.percentageUsed.toFixed(1) + "%",
            })),
          };
        },
      },
      {
        name: "remaining_quota",
        description:
          "Get remaining quota for a specific metric (API requests, AI credits, storage, etc). " +
          "Use when user asks 'how many X do I have left' or 'am I close to my limit for Y'.",
        parameters: {
          type: "object",
          properties: {
            metric: {
              type: "string",
              enum: [
                "API_REQUESTS",
                "AI_CREDITS",
                "STORAGE_GB",
                "ORDERS",
                "WEBHOOKS",
                "USERS",
                "VEHICLES",
                "DRIVERS",
                "CUSTOMERS",
              ],
              description: "The metric to check quota for",
            },
          },
          required: ["metric"],
          additionalProperties: false,
        },
        allowedRoles: ALL_STAFF,
        mutating: false,
        handler: async (args: Record<string, unknown>, user: CurrentUserPayload) => {
          const metric = args.metric as string;
          const currentUsage = await this.usageMetering.getCurrentUsage(
            user.organizationId,
            metric as any,
          );

          const remaining = await this.usageMetering.getRemainingQuota(
            user.organizationId,
            metric as any,
          );

          return {
            metric: metric,
            currentUsage,
            remaining: remaining === null ? "unlimited" : remaining,
            isUnlimited: remaining === null,
          };
        },
      },
      {
        name: "upgrade_recommendation",
        description:
          "Recommend plan upgrade based on current usage and organization size. " +
          "Use when user asks 'should I upgrade' or 'which plan is right for me'.",
        parameters: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        allowedRoles: ["ADMIN"],
        mutating: false,
        handler: async (args: Record<string, unknown>, user: CurrentUserPayload) => {
          try {
            // Get current subscription
            const subscription = await this.lifecycle["prisma"].organizationSubscription.findUnique({
              where: { organizationId: user.organizationId },
              include: { plan: true },
            });

            if (!subscription) {
              return { error: "No subscription found" };
            }

            const currentPlan = subscription.plan;

            // Get usage summary
            const summary = await this.usageMetering.getUsageSummary(user.organizationId);

            // Get seat summary
            const seatSummary = await this.seatsService.getSeatSummary(user.organizationId);

            // Check if approaching limits (>80% usage)
            const approachingLimits = summary.metrics.filter(
              (m) => !m.isUnlimited && m.percentageUsed > 80,
            );

            // Get recommendation
            const recommended = await this.planService.recommendPlan({
              userCount: seatSummary.used,
              vehicleCount:
                summary.metrics.find((m) => m.metricType === "VEHICLES")?.currentUsage ?? 0,
              orderVolume:
                summary.metrics.find((m) => m.metricType === "ORDERS")?.currentUsage ?? 0,
              needsSSO: false,
              needsCustomBranding: false,
            });

            const shouldUpgrade = recommended.slug !== currentPlan.slug;

            return {
              currentPlan: {
                name: currentPlan.name,
                price: currentPlan.price,
              },
              recommendedPlan: {
                name: recommended.name,
                slug: recommended.slug,
                price: recommended.price,
              },
              shouldUpgrade,
              reason: shouldUpgrade
                ? approachingLimits.length > 0
                  ? `You're approaching limits on: ${approachingLimits.map((m) => m.label).join(", ")}`
                  : "Your usage patterns suggest a higher-tier plan would be more appropriate"
                : "Your current plan fits your usage well",
              approachingLimits: approachingLimits.map((m) => ({
                metric: m.label,
                percentageUsed: m.percentageUsed.toFixed(1) + "%",
              })),
            };
          } catch (error: any) {
            return { error: "Unable to generate recommendation", details: error.message };
          }
        },
      },
      {
        name: "seat_summary",
        description:
          "Get team seat usage - how many seats are used vs available. " +
          "Use when user asks about team size, available seats, or adding users.",
        parameters: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        allowedRoles: ["ADMIN", "OPERATIONS_MANAGER"],
        mutating: false,
        handler: async (args: Record<string, unknown>, user: CurrentUserPayload) => {
          const summary = await this.seatsService.getSeatSummary(user.organizationId);

          return {
            used: summary.used,
            available: summary.isUnlimited ? "unlimited" : summary.available,
            percentageUsed: summary.isUnlimited ? 0 : summary.percentageUsed.toFixed(1) + "%",
            seatsRemaining: summary.isUnlimited
              ? "unlimited"
              : Math.max(0, (summary.available ?? 0) - summary.used),
          };
        },
      },
    ];
  }
}
