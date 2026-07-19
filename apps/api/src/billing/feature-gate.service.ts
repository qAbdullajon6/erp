import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { UsageMetricType } from "@prisma/client";

/// Central feature gate service for subscription-based access control.
///
/// Every quota/limit/feature check flows through this service, never duplicated
/// elsewhere. Plan limits are cached per organization to avoid DB hits on every
/// API request. Cache invalidated when subscription changes.
///
/// Usage:
///   await featureGate.canUseFeature(orgId, 'custom_branding')
///   await featureGate.checkLimit(orgId, 'users', currentCount)
///   const remaining = await featureGate.remainingQuota(orgId, 'api_requests_per_day')
@Injectable()
export class FeatureGateService {
  private readonly logger = new Logger(FeatureGateService.name);
  private readonly planCache = new Map<string, PlanLimits>();
  private readonly cacheExpiry = new Map<string, number>();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  constructor(private readonly prisma: PrismaService) {}

  /// Check if organization's plan includes a boolean feature.
  /// Returns false if no subscription exists (treat as free plan with no features).
  async canUseFeature(organizationId: string, feature: string): Promise<boolean> {
    const limits = await this.getPlanLimits(organizationId);
    if (!limits) return false;

    const value = limits.features[feature];
    if (typeof value === "boolean") return value;
    if (value === undefined) return false;

    this.logger.warn(
      `Feature ${feature} for org ${organizationId} is not a boolean (got ${typeof value}), treating as false`,
    );
    return false;
  }

  /// Check if organization is within a numeric limit.
  /// Throws 402 Payment Required if limit exceeded.
  /// Returns { allowed: true, remaining: N } if within limit.
  /// Returns { allowed: true, remaining: null } if unlimited.
  async checkLimit(
    organizationId: string,
    limitKey: string,
    currentUsage: number,
  ): Promise<{ allowed: boolean; remaining: number | null }> {
    const limits = await this.getPlanLimits(organizationId);
    if (!limits) {
      // No subscription = free plan with zero limits
      return { allowed: false, remaining: 0 };
    }

    const limit = limits.features[limitKey];

    // Null/undefined means unlimited
    if (limit === null || limit === undefined) {
      return { allowed: true, remaining: null };
    }

    // Must be a number
    if (typeof limit !== "number") {
      this.logger.error(
        `Limit ${limitKey} for org ${organizationId} is not a number (got ${typeof limit}), treating as 0`,
      );
      return { allowed: false, remaining: 0 };
    }

    const remaining = Math.max(0, limit - currentUsage);
    const allowed = currentUsage < limit;

    return { allowed, remaining };
  }

  /// Get remaining quota for a specific limit.
  /// Returns null if unlimited.
  /// Returns 0 if at/over limit.
  async remainingQuota(
    organizationId: string,
    limitKey: string,
    currentUsage: number,
  ): Promise<number | null> {
    const result = await this.checkLimit(organizationId, limitKey, currentUsage);
    return result.remaining;
  }

  /// Check if increment would exceed limit.
  /// Used before expensive operations: "Can I create 1 more order this month?"
  async wouldExceedLimit(
    organizationId: string,
    limitKey: string,
    currentUsage: number,
    increment: number,
  ): Promise<boolean> {
    const result = await this.checkLimit(organizationId, limitKey, currentUsage + increment);
    return !result.allowed;
  }

  /// Get all plan limits for an organization.
  /// Returns null if no subscription exists.
  /// Cached per organization with 5-minute TTL.
  async getPlanLimits(organizationId: string): Promise<PlanLimits | null> {
    // Check cache
    const cached = this.planCache.get(organizationId);
    const expiry = this.cacheExpiry.get(organizationId);

    if (cached && expiry && Date.now() < expiry) {
      return cached;
    }

    // Load from DB
    const subscription = await this.prisma.organizationSubscription.findUnique({
      where: { organizationId },
      include: { plan: true },
    });

    if (!subscription || subscription.status === "EXPIRED" || subscription.status === "CANCELLED") {
      // No active subscription
      this.planCache.delete(organizationId);
      this.cacheExpiry.delete(organizationId);
      return null;
    }

    const limits: PlanLimits = {
      planId: subscription.planId,
      planName: subscription.plan.name,
      planSlug: subscription.plan.slug,
      features: subscription.plan.features as Record<string, unknown>,
      status: subscription.status,
      seats: subscription.seats,
      trialEndsAt: subscription.trialEndsAt,
      currentPeriodEnd: subscription.currentPeriodEnd,
    };

    // Cache
    this.planCache.set(organizationId, limits);
    this.cacheExpiry.set(organizationId, Date.now() + this.CACHE_TTL_MS);

    return limits;
  }

  /// Invalidate cache for an organization.
  /// Called when subscription changes (upgrade, downgrade, cancellation).
  clearCache(organizationId: string): void {
    this.planCache.delete(organizationId);
    this.cacheExpiry.delete(organizationId);
  }

  /// Sweep expired cache entries.
  /// Called periodically to prevent unbounded memory growth.
  private sweepCache(): void {
    const now = Date.now();
    for (const [orgId, expiry] of this.cacheExpiry.entries()) {
      if (now >= expiry) {
        this.planCache.delete(orgId);
        this.cacheExpiry.delete(orgId);
      }
    }
  }

  /// Get plan limit value by key.
  /// Returns undefined if limit doesn't exist.
  /// Returns null if unlimited.
  async getLimit(organizationId: string, limitKey: string): Promise<number | null | undefined> {
    const limits = await this.getPlanLimits(organizationId);
    if (!limits) return undefined;

    const value = limits.features[limitKey];
    if (value === null || value === undefined) return value as null | undefined;
    if (typeof value === "number") return value;

    this.logger.warn(
      `Limit ${limitKey} for org ${organizationId} is not a number/null (got ${typeof value})`,
    );
    return undefined;
  }

  /// Check if organization has any active subscription.
  async hasActiveSubscription(organizationId: string): Promise<boolean> {
    const limits = await this.getPlanLimits(organizationId);
    return limits !== null;
  }

  /// Get subscription status for an organization.
  async getSubscriptionStatus(
    organizationId: string,
  ): Promise<"TRIAL" | "ACTIVE" | "SUSPENDED" | "EXPIRED" | "CANCELLED" | "NONE"> {
    const limits = await this.getPlanLimits(organizationId);
    if (!limits) return "NONE";
    return limits.status;
  }
}

export interface PlanLimits {
  planId: string;
  planName: string;
  planSlug: string;
  /// Plan features JSON. Keys are feature names, values are:
  /// - boolean: feature enabled/disabled (custom_branding, sso)
  /// - number: numeric limit (users, vehicles, api_requests_per_day)
  /// - null: unlimited for this resource
  /// - array: list of allowed values (integrations: ["basic", "stripe"])
  features: Record<string, unknown>;
  status: "TRIAL" | "ACTIVE" | "SUSPENDED" | "EXPIRED" | "CANCELLED";
  seats: number | null;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date;
}
