import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { SubscriptionPlan } from "@prisma/client";

/// Subscription plan management service.
///
/// Manages plan definitions (Free, Starter, Professional, Enterprise). Plans
/// are system-wide data (not org-scoped), created by platform admin or seed
/// script. This service provides read-only access for most operations, with
/// admin-only CRUD for plan management.
///
/// Plan structure:
/// {
///   name: "Professional",
///   slug: "professional",
///   price: 9900, // $99.00/month in cents
///   annualPrice: 99000, // $990/year in cents
///   features: {
///     users: 25,
///     vehicles: 50,
///     drivers: 50,
///     customers: 1000,
///     orders_per_month: 5000,
///     api_requests_per_day: 10000,
///     ai_credits_per_month: 1000,
///     storage_gb: 100,
///     integrations: ["basic", "stripe", "quickbooks"],
///     webhooks_per_month: 50000,
///     reports: ["standard", "advanced"],
///     custom_branding: true,
///     sso: false,
///     audit_retention_days: 365
///   }
/// }
@Injectable()
export class SubscriptionPlanService {
  constructor(private readonly prisma: PrismaService) {}

  /// List all active plans (public-facing, shown on pricing page).
  /// Returns plans ordered by sortOrder (Free -> Starter -> Professional -> Enterprise).
  async listActivePlans(): Promise<SubscriptionPlan[]> {
    return this.prisma.subscriptionPlan.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    });
  }

  /// List all plans (admin-only, includes inactive/custom plans).
  async listAllPlans(): Promise<SubscriptionPlan[]> {
    return this.prisma.subscriptionPlan.findMany({
      orderBy: { sortOrder: "asc" },
    });
  }

  /// Get plan by ID.
  async getPlanById(planId: string): Promise<SubscriptionPlan> {
    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { id: planId },
    });

    if (!plan) {
      throw new NotFoundException(`Plan with ID ${planId} not found`);
    }

    return plan;
  }

  /// Get plan by slug (e.g. "free", "professional").
  async getPlanBySlug(slug: string): Promise<SubscriptionPlan> {
    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { slug },
    });

    if (!plan) {
      throw new NotFoundException(`Plan with slug "${slug}" not found`);
    }

    return plan;
  }

  /// Get featured plan (shown as "Most Popular" on pricing page).
  async getFeaturedPlan(): Promise<SubscriptionPlan | null> {
    return this.prisma.subscriptionPlan.findFirst({
      where: { isActive: true, isFeatured: true },
      orderBy: { sortOrder: "asc" },
    });
  }

  /// Compare two plans (for upgrade/downgrade UI).
  /// Returns feature-by-feature comparison.
  async comparePlans(planAId: string, planBId: string): Promise<PlanComparison> {
    const [planA, planB] = await Promise.all([
      this.getPlanById(planAId),
      this.getPlanById(planBId),
    ]);

    const featuresA = planA.features as Record<string, unknown>;
    const featuresB = planB.features as Record<string, unknown>;

    const allFeatureKeys = new Set([...Object.keys(featuresA), ...Object.keys(featuresB)]);

    const differences: FeatureDifference[] = [];

    for (const key of allFeatureKeys) {
      const valueA = featuresA[key];
      const valueB = featuresB[key];

      if (JSON.stringify(valueA) !== JSON.stringify(valueB)) {
        differences.push({
          feature: key,
          planAValue: valueA,
          planBValue: valueB,
        });
      }
    }

    return {
      planA: { id: planA.id, name: planA.name, slug: planA.slug },
      planB: { id: planB.id, name: planB.name, slug: planB.slug },
      differences,
    };
  }

  /// Check if upgrade (planB is better than planA).
  /// Simple heuristic: higher price = better plan.
  isUpgrade(planA: SubscriptionPlan, planB: SubscriptionPlan): boolean {
    return planB.price > planA.price;
  }

  /// Check if downgrade (planB is worse than planA).
  isDowngrade(planA: SubscriptionPlan, planB: SubscriptionPlan): boolean {
    return planB.price < planA.price;
  }

  /// Get plan recommendation based on organization size/usage.
  /// Simple rule-based recommendation (can be ML-based in future).
  async recommendPlan(criteria: {
    userCount: number;
    vehicleCount: number;
    orderVolume: number;
    needsSSO: boolean;
    needsCustomBranding: boolean;
  }): Promise<SubscriptionPlan> {
    const plans = await this.listActivePlans();

    // Enterprise: SSO or custom branding
    if (criteria.needsSSO || criteria.needsCustomBranding) {
      const enterprise = plans.find((p) => p.slug === "enterprise");
      if (enterprise) return enterprise;
    }

    // Professional: >10 users or >1000 orders/month
    if (criteria.userCount > 10 || criteria.orderVolume > 1000) {
      const professional = plans.find((p) => p.slug === "professional");
      if (professional) return professional;
    }

    // Starter: >5 users or >100 orders/month
    if (criteria.userCount > 5 || criteria.orderVolume > 100) {
      const starter = plans.find((p) => p.slug === "starter");
      if (starter) return starter;
    }

    // Default: Free plan
    const free = plans.find((p) => p.slug === "free");
    if (free) return free;

    // Fallback: first active plan
    return plans[0];
  }
}

export interface PlanComparison {
  planA: { id: string; name: string; slug: string };
  planB: { id: string; name: string; slug: string };
  differences: FeatureDifference[];
}

export interface FeatureDifference {
  feature: string;
  planAValue: unknown;
  planBValue: unknown;
}
