import { ConflictException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { OrganizationSubscription, Prisma, SubscriptionStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import type { CurrentUserPayload } from "../auth/interfaces/current-user.interface";
import { SubscriptionPlanService } from "./subscription-plan.service";
import { FeatureGateService } from "./feature-gate.service";

/// Subscription lifecycle management: create, upgrade, downgrade, cancel, renew, expire.
///
/// All state transitions are audited in SubscriptionHistory. Every transition
/// validates preconditions (can't cancel an already-cancelled subscription).
/// Cache invalidation happens after every state change.
///
/// Lifecycle flow:
/// TRIAL -> ACTIVE (after first payment)
/// ACTIVE -> SUSPENDED (payment failed, grace period)
/// ACTIVE -> CANCELLED (user requested, effective at period end)
/// SUSPENDED -> ACTIVE (payment succeeded, reactivated)
/// CANCELLED -> EXPIRED (period ended, no renewal)
/// ACTIVE -> EXPIRED (subscription ended, not renewed)
///
/// Idempotency: Operations are idempotent where safe (cancelling an already-
/// cancelled subscription is a no-op, not an error).
@Injectable()
export class SubscriptionLifecycleService {
  private readonly logger = new Logger(SubscriptionLifecycleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly planService: SubscriptionPlanService,
    private readonly featureGate: FeatureGateService,
  ) {}

  /// Create new subscription for an organization.
  /// Initial status: TRIAL if trial period specified, otherwise ACTIVE.
  /// Throws ConflictException if subscription already exists.
  async createSubscription(
    organizationId: string,
    planId: string,
    opts: {
      trialDays?: number;
      seats?: number;
      paymentCustomerId?: string;
      actor?: CurrentUserPayload;
    } = {},
  ): Promise<OrganizationSubscription> {
    // Check if subscription already exists
    const existing = await this.prisma.organizationSubscription.findUnique({
      where: { organizationId },
    });

    if (existing) {
      throw new ConflictException(
        `Organization already has a subscription (${existing.status}). Use upgrade/downgrade instead.`,
      );
    }

    // Validate plan exists
    const plan = await this.planService.getPlanById(planId);

    const now = new Date();
    const trialEndsAt = opts.trialDays ? new Date(now.getTime() + opts.trialDays * 24 * 60 * 60 * 1000) : null;
    const currentPeriodEnd = trialEndsAt ?? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days default

    const subscription = await this.prisma.organizationSubscription.create({
      data: {
        organizationId,
        planId,
        status: trialEndsAt ? "TRIAL" : "ACTIVE",
        seats: opts.seats ?? null,
        currentPeriodStart: now,
        currentPeriodEnd,
        trialEndsAt,
        paymentCustomerId: opts.paymentCustomerId,
        autoRenew: true,
      },
      include: { plan: true },
    });

    // Record history
    await this.recordHistory({
      subscriptionId: subscription.id,
      organizationId,
      eventType: trialEndsAt ? "TRIAL_STARTED" : "CREATED",
      toPlanId: planId,
      effectiveDate: now,
      actorUserId: opts.actor?.userId,
      reason: trialEndsAt ? "trial_started" : "subscription_created",
      metadata: { seats: opts.seats, trialDays: opts.trialDays },
    });

    // Audit log
    if (opts.actor) {
      await this.auditService.log({
        organizationId,
        actorUserId: opts.actor.userId,
        action: "subscription.created",
        entityType: "OrganizationSubscription",
        entityId: subscription.id,
        metadata: { planId, status: subscription.status, seats: opts.seats },
      });
    }

    // Clear cache
    this.featureGate.clearCache(organizationId);

    this.logger.log(`Created subscription for org ${organizationId}: ${plan.name} (${subscription.status})`);

    return subscription;
  }

  /// Upgrade subscription to higher-tier plan.
  /// Takes effect immediately. Prorates billing (future: payment integration).
  async upgradeSubscription(
    organizationId: string,
    newPlanId: string,
    actor: CurrentUserPayload,
  ): Promise<OrganizationSubscription> {
    const subscription = await this.getActiveSubscription(organizationId);
    const currentPlan = await this.planService.getPlanById(subscription.planId);
    const newPlan = await this.planService.getPlanById(newPlanId);

    // Validate it's an upgrade
    if (!this.planService.isUpgrade(currentPlan, newPlan)) {
      throw new ConflictException(
        `Plan ${newPlan.name} is not an upgrade from ${currentPlan.name}. Use downgradeSubscription instead.`,
      );
    }

    // Update subscription
    const updated = await this.prisma.organizationSubscription.update({
      where: { id: subscription.id },
      data: {
        planId: newPlanId,
        status: "ACTIVE", // Clear TRIAL if upgrading during trial
      },
      include: { plan: true },
    });

    // Record history
    await this.recordHistory({
      subscriptionId: subscription.id,
      organizationId,
      eventType: "UPGRADED",
      fromPlanId: subscription.planId,
      toPlanId: newPlanId,
      effectiveDate: new Date(),
      actorUserId: actor.userId,
      reason: "user_requested_upgrade",
    });

    // Audit log
    await this.auditService.log({
      organizationId,
      actorUserId: actor.userId,
      action: "subscription.upgraded",
      entityType: "OrganizationSubscription",
      entityId: subscription.id,
      metadata: { fromPlan: currentPlan.name, toPlan: newPlan.name },
    });

    // Clear cache
    this.featureGate.clearCache(organizationId);

    this.logger.log(`Upgraded subscription for org ${organizationId}: ${currentPlan.name} -> ${newPlan.name}`);

    return updated;
  }

  /// Downgrade subscription to lower-tier plan.
  /// Can be immediate or scheduled for end of current period.
  async downgradeSubscription(
    organizationId: string,
    newPlanId: string,
    actor: CurrentUserPayload,
    opts: { immediate?: boolean } = {},
  ): Promise<OrganizationSubscription> {
    const subscription = await this.getActiveSubscription(organizationId);
    const currentPlan = await this.planService.getPlanById(subscription.planId);
    const newPlan = await this.planService.getPlanById(newPlanId);

    // Validate it's a downgrade
    if (!this.planService.isDowngrade(currentPlan, newPlan)) {
      throw new ConflictException(
        `Plan ${newPlan.name} is not a downgrade from ${currentPlan.name}. Use upgradeSubscription instead.`,
      );
    }

    if (opts.immediate) {
      // Immediate downgrade
      const updated = await this.prisma.organizationSubscription.update({
        where: { id: subscription.id },
        data: { planId: newPlanId },
        include: { plan: true },
      });

      await this.recordHistory({
        subscriptionId: subscription.id,
        organizationId,
        eventType: "DOWNGRADED",
        fromPlanId: subscription.planId,
        toPlanId: newPlanId,
        effectiveDate: new Date(),
        actorUserId: actor.userId,
        reason: "user_requested_downgrade_immediate",
      });

      await this.auditService.log({
        organizationId,
        actorUserId: actor.userId,
        action: "subscription.downgraded",
        entityType: "OrganizationSubscription",
        entityId: subscription.id,
        metadata: { fromPlan: currentPlan.name, toPlan: newPlan.name, immediate: true },
      });

      this.featureGate.clearCache(organizationId);

      this.logger.log(
        `Downgraded subscription immediately for org ${organizationId}: ${currentPlan.name} -> ${newPlan.name}`,
      );

      return updated;
    } else {
      // Scheduled downgrade (at period end)
      // Store in metadata, process by renewal job
      const updated = await this.prisma.organizationSubscription.update({
        where: { id: subscription.id },
        data: {
          metadata: {
            scheduledDowngrade: {
              planId: newPlanId,
              effectiveDate: subscription.currentPeriodEnd.toISOString(),
              scheduledBy: actor.userId,
              scheduledAt: new Date().toISOString(),
            },
          } as Prisma.InputJsonValue,
        },
        include: { plan: true },
      });

      await this.recordHistory({
        subscriptionId: subscription.id,
        organizationId,
        eventType: "DOWNGRADED",
        fromPlanId: subscription.planId,
        toPlanId: newPlanId,
        effectiveDate: subscription.currentPeriodEnd,
        actorUserId: actor.userId,
        reason: "user_requested_downgrade_scheduled",
      });

      await this.auditService.log({
        organizationId,
        actorUserId: actor.userId,
        action: "subscription.downgrade_scheduled",
        entityType: "OrganizationSubscription",
        entityId: subscription.id,
        metadata: { fromPlan: currentPlan.name, toPlan: newPlan.name, effectiveDate: subscription.currentPeriodEnd },
      });

      this.logger.log(
        `Scheduled downgrade for org ${organizationId}: ${currentPlan.name} -> ${newPlan.name} at ${subscription.currentPeriodEnd}`,
      );

      return updated;
    }
  }

  /// Cancel subscription.
  /// Can be immediate or scheduled for end of current period (default).
  /// Idempotent: cancelling an already-cancelled subscription is a no-op.
  async cancelSubscription(
    organizationId: string,
    actor: CurrentUserPayload,
    opts: { immediate?: boolean; reason?: string } = {},
  ): Promise<OrganizationSubscription> {
    const subscription = await this.getSubscription(organizationId);

    // Idempotent: already cancelled
    if (subscription.status === "CANCELLED") {
      this.logger.log(`Subscription for org ${organizationId} already cancelled, returning existing`);
      return subscription;
    }

    if (opts.immediate) {
      // Immediate cancellation -> CANCELLED
      const updated = await this.prisma.organizationSubscription.update({
        where: { id: subscription.id },
        data: {
          status: "CANCELLED",
          cancelledAt: new Date(),
          cancellationReason: opts.reason,
          autoRenew: false,
        },
        include: { plan: true },
      });

      await this.recordHistory({
        subscriptionId: subscription.id,
        organizationId,
        eventType: "CANCELLED",
        fromPlanId: subscription.planId,
        effectiveDate: new Date(),
        actorUserId: actor.userId,
        reason: opts.reason ?? "user_requested_cancel_immediate",
      });

      await this.auditService.log({
        organizationId,
        actorUserId: actor.userId,
        action: "subscription.cancelled",
        entityType: "OrganizationSubscription",
        entityId: subscription.id,
        metadata: { immediate: true, reason: opts.reason },
      });

      this.featureGate.clearCache(organizationId);

      this.logger.log(`Cancelled subscription immediately for org ${organizationId}`);

      return updated;
    } else {
      // Scheduled cancellation (at period end)
      const updated = await this.prisma.organizationSubscription.update({
        where: { id: subscription.id },
        data: {
          cancelAt: subscription.currentPeriodEnd,
          cancellationReason: opts.reason,
          autoRenew: false,
        },
        include: { plan: true },
      });

      await this.recordHistory({
        subscriptionId: subscription.id,
        organizationId,
        eventType: "CANCELLED",
        fromPlanId: subscription.planId,
        effectiveDate: subscription.currentPeriodEnd,
        actorUserId: actor.userId,
        reason: opts.reason ?? "user_requested_cancel_scheduled",
      });

      await this.auditService.log({
        organizationId,
        actorUserId: actor.userId,
        action: "subscription.cancel_scheduled",
        entityType: "OrganizationSubscription",
        entityId: subscription.id,
        metadata: { effectiveDate: subscription.currentPeriodEnd, reason: opts.reason },
      });

      this.logger.log(`Scheduled cancellation for org ${organizationId} at ${subscription.currentPeriodEnd}`);

      return updated;
    }
  }

  /// Reactivate a cancelled subscription before period end.
  /// Only works if cancellation was scheduled (not immediate).
  async reactivateSubscription(
    organizationId: string,
    actor: CurrentUserPayload,
  ): Promise<OrganizationSubscription> {
    const subscription = await this.getSubscription(organizationId);

    if (subscription.status === "CANCELLED") {
      throw new ConflictException(
        "Subscription is already cancelled and cannot be reactivated. Create a new subscription instead.",
      );
    }

    if (!subscription.cancelAt) {
      throw new ConflictException("Subscription is not scheduled for cancellation.");
    }

    // Clear cancellation schedule
    const updated = await this.prisma.organizationSubscription.update({
      where: { id: subscription.id },
      data: {
        cancelAt: null,
        cancellationReason: null,
        autoRenew: true,
      },
      include: { plan: true },
    });

    await this.recordHistory({
      subscriptionId: subscription.id,
      organizationId,
      eventType: "REACTIVATED",
      toPlanId: subscription.planId,
      effectiveDate: new Date(),
      actorUserId: actor.userId,
      reason: "user_requested_reactivation",
    });

    await this.auditService.log({
      organizationId,
      actorUserId: actor.userId,
      action: "subscription.reactivated",
      entityType: "OrganizationSubscription",
      entityId: subscription.id,
      metadata: {},
    });

    this.featureGate.clearCache(organizationId);

    this.logger.log(`Reactivated subscription for org ${organizationId}`);

    return updated;
  }

  /// Renew subscription for next billing period.
  /// Called by background job or payment webhook.
  /// Handles scheduled downgrades if present.
  async renewSubscription(organizationId: string): Promise<OrganizationSubscription> {
    const subscription = await this.getSubscription(organizationId);

    // Check for scheduled downgrade
    const metadata = subscription.metadata as { scheduledDowngrade?: { planId: string } } | null;
    const scheduledDowngrade = metadata?.scheduledDowngrade;

    const newPeriodStart = subscription.currentPeriodEnd;
    const newPeriodEnd = new Date(newPeriodStart);
    newPeriodEnd.setDate(newPeriodEnd.getDate() + 30); // 30-day period

    if (scheduledDowngrade) {
      // Apply scheduled downgrade
      const updated = await this.prisma.organizationSubscription.update({
        where: { id: subscription.id },
        data: {
          planId: scheduledDowngrade.planId,
          currentPeriodStart: newPeriodStart,
          currentPeriodEnd: newPeriodEnd,
          metadata: Prisma.DbNull, // Clear scheduled downgrade
        },
        include: { plan: true },
      });

      await this.recordHistory({
        subscriptionId: subscription.id,
        organizationId,
        eventType: "RENEWED",
        fromPlanId: subscription.planId,
        toPlanId: scheduledDowngrade.planId,
        effectiveDate: newPeriodStart,
        reason: "auto_renewal_with_downgrade",
      });

      this.featureGate.clearCache(organizationId);

      this.logger.log(
        `Renewed subscription with downgrade for org ${organizationId}: ${subscription.planId} -> ${scheduledDowngrade.planId}`,
      );

      return updated;
    } else {
      // Standard renewal
      const updated = await this.prisma.organizationSubscription.update({
        where: { id: subscription.id },
        data: {
          currentPeriodStart: newPeriodStart,
          currentPeriodEnd: newPeriodEnd,
          status: "ACTIVE", // Clear TRIAL/SUSPENDED on successful renewal
          trialEndsAt: null,
        },
        include: { plan: true },
      });

      await this.recordHistory({
        subscriptionId: subscription.id,
        organizationId,
        eventType: "RENEWED",
        toPlanId: subscription.planId,
        effectiveDate: newPeriodStart,
        reason: "auto_renewal",
      });

      this.logger.log(`Renewed subscription for org ${organizationId}`);

      return updated;
    }
  }

  /// Suspend subscription due to payment failure.
  /// Called by payment webhook after retry exhaustion.
  async suspendSubscription(
    organizationId: string,
    reason: string,
  ): Promise<OrganizationSubscription> {
    const subscription = await this.getActiveSubscription(organizationId);

    const updated = await this.prisma.organizationSubscription.update({
      where: { id: subscription.id },
      data: {
        status: "SUSPENDED",
        metadata: {
          suspendedAt: new Date().toISOString(),
          suspensionReason: reason,
        } as Prisma.InputJsonValue,
      },
      include: { plan: true },
    });

    await this.recordHistory({
      subscriptionId: subscription.id,
      organizationId,
      eventType: "SUSPENDED",
      fromPlanId: subscription.planId,
      effectiveDate: new Date(),
      reason,
    });

    this.featureGate.clearCache(organizationId);

    this.logger.warn(`Suspended subscription for org ${organizationId}: ${reason}`);

    return updated;
  }

  /// Expire subscription (end without renewal).
  /// Called by background job when period ends and autoRenew=false.
  async expireSubscription(organizationId: string): Promise<OrganizationSubscription> {
    const subscription = await this.getSubscription(organizationId);

    const updated = await this.prisma.organizationSubscription.update({
      where: { id: subscription.id },
      data: { status: "EXPIRED" },
      include: { plan: true },
    });

    await this.recordHistory({
      subscriptionId: subscription.id,
      organizationId,
      eventType: "EXPIRED",
      fromPlanId: subscription.planId,
      effectiveDate: new Date(),
      reason: "subscription_period_ended",
    });

    this.featureGate.clearCache(organizationId);

    this.logger.log(`Expired subscription for org ${organizationId}`);

    return updated;
  }

  /// Add seats to subscription.
  /// Takes effect immediately.
  async addSeats(
    organizationId: string,
    count: number,
    actor: CurrentUserPayload,
  ): Promise<OrganizationSubscription> {
    const subscription = await this.getActiveSubscription(organizationId);

    if (subscription.seats === null) {
      throw new ConflictException("Subscription has unlimited seats, cannot add specific count.");
    }

    const newSeats = subscription.seats + count;

    const updated = await this.prisma.organizationSubscription.update({
      where: { id: subscription.id },
      data: { seats: newSeats },
      include: { plan: true },
    });

    await this.recordHistory({
      subscriptionId: subscription.id,
      organizationId,
      eventType: "SEATS_ADDED",
      toPlanId: subscription.planId,
      effectiveDate: new Date(),
      actorUserId: actor.userId,
      reason: "user_requested_add_seats",
      metadata: { addedSeats: count, newTotal: newSeats },
    });

    await this.auditService.log({
      organizationId,
      actorUserId: actor.userId,
      action: "subscription.seats_added",
      entityType: "OrganizationSubscription",
      entityId: subscription.id,
      metadata: { addedSeats: count, newTotal: newSeats },
    });

    this.featureGate.clearCache(organizationId);

    this.logger.log(`Added ${count} seats for org ${organizationId}, new total: ${newSeats}`);

    return updated;
  }

  /// Get active subscription.
  /// Throws NotFoundException if no active subscription exists.
  private async getActiveSubscription(organizationId: string): Promise<OrganizationSubscription> {
    const subscription = await this.prisma.organizationSubscription.findUnique({
      where: { organizationId },
      include: { plan: true },
    });

    if (!subscription) {
      throw new NotFoundException(`No subscription found for organization ${organizationId}`);
    }

    if (subscription.status === "EXPIRED" || subscription.status === "CANCELLED") {
      throw new ConflictException(
        `Subscription is ${subscription.status.toLowerCase()} and cannot be modified. Create a new subscription.`,
      );
    }

    return subscription;
  }

  /// Get subscription (any status).
  private async getSubscription(organizationId: string): Promise<OrganizationSubscription> {
    const subscription = await this.prisma.organizationSubscription.findUnique({
      where: { organizationId },
      include: { plan: true },
    });

    if (!subscription) {
      throw new NotFoundException(`No subscription found for organization ${organizationId}`);
    }

    return subscription;
  }

  /// Record subscription history event.
  private async recordHistory(data: {
    subscriptionId: string;
    organizationId: string;
    eventType: "CREATED" | "UPGRADED" | "DOWNGRADED" | "RENEWED" | "SUSPENDED" | "REACTIVATED" | "CANCELLED" | "EXPIRED" | "SEATS_ADDED" | "SEATS_REMOVED" | "PAYMENT_FAILED" | "TRIAL_STARTED" | "TRIAL_ENDED";
    fromPlanId?: string;
    toPlanId?: string;
    effectiveDate: Date;
    actorUserId?: string;
    reason?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.prisma.subscriptionHistory.create({
      data: {
        subscriptionId: data.subscriptionId,
        organizationId: data.organizationId,
        eventType: data.eventType,
        fromPlanId: data.fromPlanId,
        toPlanId: data.toPlanId,
        effectiveDate: data.effectiveDate,
        actorUserId: data.actorUserId,
        reason: data.reason,
        metadata: data.metadata ? (data.metadata as Prisma.InputJsonValue) : undefined,
      },
    });
  }
}
