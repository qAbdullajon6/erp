import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

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

  /// A org with no subscription row at all (never subscribed, or the row was
  /// deleted) is NOT the same as a org whose subscription lapsed to zero
  /// access — it should behave exactly like the Free tier, the same way a
  /// brand-new signup would. Without this, every quota check for such an org
  /// would resolve to "0 allowed", which would block every create action the
  /// instant enforcement is wired in, org-wide, with no warning.
  private freePlanFeaturesCache: Record<string, unknown> | null = null;
  private freePlanCacheExpiry = 0;

  constructor(private readonly prisma: PrismaService) {}

  /// Check if organization's plan includes a boolean feature.
  /// Falls back to the Free plan's features if there's no subscription row.
  async canUseFeature(organizationId: string, feature: string): Promise<boolean> {
    const features = await this.getEffectiveFeatures(organizationId);

    const value = features[feature];
    if (typeof value === "boolean") return value;
    if (value === undefined) return false;

    this.logger.warn(
      `Feature ${feature} for org ${organizationId} is not a boolean (got ${typeof value}), treating as false`,
    );
    return false;
  }

  /// Check if organization is within a numeric limit.
  /// Returns { allowed: true, remaining: N } if within limit.
  /// Returns { allowed: true, remaining: null } if unlimited.
  async checkLimit(
    organizationId: string,
    limitKey: string,
    currentUsage: number,
  ): Promise<{ allowed: boolean; remaining: number | null }> {
    const features = await this.getEffectiveFeatures(organizationId);
    const limit = features[limitKey];

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
    const features = await this.getEffectiveFeatures(organizationId);

    const value = features[limitKey];
    if (value === null || value === undefined) return value;
    if (typeof value === "number") return value;

    this.logger.warn(
      `Limit ${limitKey} for org ${organizationId} is not a number/null (got ${typeof value})`,
    );
    return undefined;
  }

  /// Features to gate against for this organization: its actual subscribed
  /// plan, or the Free plan's features when it has no subscription row at
  /// all. Callers that need to distinguish "genuinely unsubscribed" from
  /// "on the Free plan" should use `getPlanLimits`/`hasActiveSubscription`
  /// instead — this helper is only for the numeric/boolean gate checks.
  private async getEffectiveFeatures(organizationId: string): Promise<Record<string, unknown>> {
    const limits = await this.getPlanLimits(organizationId);
    if (limits) return limits.features;
    return this.getFreePlanFeatures();
  }

  private async getFreePlanFeatures(): Promise<Record<string, unknown>> {
    if (this.freePlanFeaturesCache && Date.now() < this.freePlanCacheExpiry) {
      return this.freePlanFeaturesCache;
    }

    const freePlan = await this.prisma.subscriptionPlan.findUnique({ where: { slug: "free" } });
    const features = (freePlan?.features as Record<string, unknown>) ?? {};

    this.freePlanFeaturesCache = features;
    this.freePlanCacheExpiry = Date.now() + this.CACHE_TTL_MS;
    return features;
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
