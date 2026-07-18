import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { NotificationCategory, NotificationSeverity } from "@prisma/client";

/// Billing notification service - creates subscription and usage notifications.
///
/// Notification types:
/// - TRIAL_ENDING: 3 days before trial expires
/// - PAYMENT_SUCCEEDED: successful renewal/payment
/// - PAYMENT_FAILED: payment failed (suspension imminent)
/// - SUBSCRIPTION_RENEWED: successful renewal
/// - SUBSCRIPTION_EXPIRED: subscription expired
/// - SUBSCRIPTION_SUSPENDED: subscription suspended (payment failure/grace period)
/// - GRACE_PERIOD_STARTED: grace period after payment failure
/// - SEAT_LIMIT_REACHED: organization at seat limit
/// - USAGE_EXCEEDED: usage quota exceeded (API requests, AI credits, etc.)
/// - AI_CREDITS_LOW: AI credits below 20% remaining
///
/// Integration: called by SubscriptionLifecycleService and UsageSnapshotWorker.
/// All notifications are org-scoped, viewable by ADMIN/ACCOUNTANT roles.
@Injectable()
export class BillingNotificationService {
  private readonly logger = new Logger(BillingNotificationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async notifyTrialEnding(organizationId: string, trialEndsAt: Date): Promise<void> {
    await this.createNotification(organizationId, {
      type: "TRIAL_ENDING",
      category: "BILLING",
      severity: "MEDIUM",
      entityType: "OrganizationSubscription",
      entityId: organizationId,
      title: "Trial ending soon",
      message: `Your trial ends on ${trialEndsAt.toLocaleDateString()}. Add a payment method to continue.`,
      metadata: { trialEndsAt: trialEndsAt.toISOString() },
    });
  }

  async notifyPaymentSucceeded(
    organizationId: string,
    subscriptionId: string,
    amount: number,
  ): Promise<void> {
    await this.createNotification(organizationId, {
      type: "PAYMENT_SUCCEEDED",
      category: "BILLING",
      severity: "LOW",
      entityType: "OrganizationSubscription",
      entityId: subscriptionId,
      title: "Payment succeeded",
      message: `Payment of $${(amount / 100).toFixed(2)} processed successfully.`,
      metadata: { amount },
    });
  }

  async notifyPaymentFailed(
    organizationId: string,
    subscriptionId: string,
    reason: string,
  ): Promise<void> {
    await this.createNotification(organizationId, {
      type: "PAYMENT_FAILED",
      category: "BILLING",
      severity: "CRITICAL",
      entityType: "OrganizationSubscription",
      entityId: subscriptionId,
      title: "Payment failed",
      message: `Payment failed: ${reason}. Update your payment method to avoid suspension.`,
      metadata: { reason },
    });
  }

  async notifySubscriptionRenewed(
    organizationId: string,
    subscriptionId: string,
    planName: string,
  ): Promise<void> {
    await this.createNotification(organizationId, {
      type: "SUBSCRIPTION_RENEWED",
      category: "BILLING",
      severity: "LOW",
      entityType: "OrganizationSubscription",
      entityId: subscriptionId,
      title: "Subscription renewed",
      message: `Your ${planName} subscription has been renewed.`,
      metadata: { planName },
    });
  }

  async notifySubscriptionExpired(
    organizationId: string,
    subscriptionId: string,
  ): Promise<void> {
    await this.createNotification(organizationId, {
      type: "SUBSCRIPTION_EXPIRED",
      category: "BILLING",
      severity: "HIGH",
      entityType: "OrganizationSubscription",
      entityId: subscriptionId,
      title: "Subscription expired",
      message: "Your subscription has expired. Renew to restore access.",
      metadata: {},
    });
  }

  async notifySubscriptionSuspended(
    organizationId: string,
    subscriptionId: string,
    reason: string,
  ): Promise<void> {
    await this.createNotification(organizationId, {
      type: "SUBSCRIPTION_SUSPENDED",
      category: "BILLING",
      severity: "CRITICAL",
      entityType: "OrganizationSubscription",
      entityId: subscriptionId,
      title: "Subscription suspended",
      message: `Your subscription is suspended: ${reason}. Update payment method immediately.`,
      metadata: { reason },
    });
  }

  async notifyGracePeriodStarted(
    organizationId: string,
    subscriptionId: string,
    gracePeriodEnds: Date,
  ): Promise<void> {
    await this.createNotification(organizationId, {
      type: "GRACE_PERIOD_STARTED",
      category: "BILLING",
      severity: "HIGH",
      entityType: "OrganizationSubscription",
      entityId: subscriptionId,
      title: "Grace period started",
      message: `Payment failed. You have until ${gracePeriodEnds.toLocaleDateString()} to update payment method.`,
      metadata: { gracePeriodEnds: gracePeriodEnds.toISOString() },
    });
  }

  async notifySeatLimitReached(
    organizationId: string,
    currentSeats: number,
    maxSeats: number,
  ): Promise<void> {
    await this.createNotification(organizationId, {
      type: "SEAT_LIMIT_REACHED",
      category: "BILLING",
      severity: "MEDIUM",
      entityType: "OrganizationSubscription",
      entityId: organizationId,
      title: "Seat limit reached",
      message: `You have ${currentSeats}/${maxSeats} seats. Upgrade to add more users.`,
      metadata: { currentSeats, maxSeats },
    });
  }

  async notifyUsageExceeded(
    organizationId: string,
    metricType: string,
    used: number,
    limit: number,
  ): Promise<void> {
    await this.createNotification(organizationId, {
      type: "USAGE_EXCEEDED",
      category: "BILLING",
      severity: "HIGH",
      entityType: "UsageRecord",
      entityId: `${organizationId}-${metricType}`,
      title: "Usage quota exceeded",
      message: `${metricType} usage exceeded: ${used}/${limit}. Upgrade for higher limits.`,
      metadata: { metricType, used, limit },
    });
  }

  async notifyAiCreditsLow(
    organizationId: string,
    remaining: number,
    limit: number,
  ): Promise<void> {
    await this.createNotification(organizationId, {
      type: "AI_CREDITS_LOW",
      category: "BILLING",
      severity: "MEDIUM",
      entityType: "UsageRecord",
      entityId: `${organizationId}-AI_CREDITS`,
      title: "AI credits running low",
      message: `Only ${remaining} of ${limit} AI credits remaining this month. Upgrade for more.`,
      metadata: { remaining, limit },
    });
  }

  private async createNotification(
    organizationId: string,
    data: {
      type: string;
      category: string;
      severity: string;
      entityType: string;
      entityId: string;
      title: string;
      message: string;
      metadata: Record<string, any>;
    },
  ): Promise<void> {
    // Check if notification already exists (idempotency)
    const existing = await this.prisma.notification.findFirst({
      where: {
        organizationId,
        type: data.type,
        entityId: data.entityId,
        isArchived: false,
      },
    });

    if (existing) {
      this.logger.debug(`Notification ${data.type} for ${data.entityId} already exists`);
      return;
    }

    await this.prisma.notification.create({
      data: {
        organizationId,
        type: data.type,
        category: data.category as NotificationCategory,
        severity: data.severity as NotificationSeverity,
        entityType: data.entityType,
        entityId: data.entityId,
        title: data.title,
        message: data.message,
        metadata: data.metadata,
      },
    });

    this.logger.log(`Created notification ${data.type} for org ${organizationId}`);
  }
}
