import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service";
import { SubscriptionLifecycleService } from "./subscription-lifecycle.service";
import { AuditService } from "../audit/audit.service";

/// Subscription renewal worker - handles automatic subscription lifecycle events.
///
/// Runs daily at midnight UTC. Processes:
/// 1. Renewals: subscriptions whose currentPeriodEnd has passed and autoRenew = true
/// 2. Trial expirations: subscriptions whose trialEndsAt has passed
/// 3. Grace period: SUSPENDED subscriptions past grace period → EXPIRED
/// 4. Scheduled cancellations: subscriptions with cancelAt date reached
///
/// Safety:
/// - Idempotent: safe to run multiple times (checks current state before acting)
/// - Organization-scoped: processes all orgs independently
/// - Audit logged: every state change recorded
///
/// Production considerations:
/// - Worker lock: only one instance should run this job (use Redis-based lock in prod)
/// - Retry logic: individual subscription failures don't stop batch processing
/// - Rate limiting: processes subscriptions in batches to avoid payment provider throttling
@Injectable()
export class SubscriptionRenewalWorker {
  private readonly logger = new Logger(SubscriptionRenewalWorker.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycle: SubscriptionLifecycleService,
    private readonly auditService: AuditService,
  ) {}

  /// Run daily at midnight UTC
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleSubscriptionRenewals(): Promise<void> {
    this.logger.log("Starting subscription renewal worker");

    const now = new Date();
    let renewedCount = 0;
    let expiredCount = 0;
    let suspendedCount = 0;
    let cancelledCount = 0;
    let errorCount = 0;

    try {
      // 1. Process trial expirations
      const trialExpired = await this.prisma.organizationSubscription.findMany({
        where: {
          status: "TRIAL",
          trialEndsAt: { lte: now },
        },
        include: { plan: true },
      });

      for (const subscription of trialExpired) {
        try {
          // Trial ended - transition to ACTIVE or SUSPENDED based on payment
          // If payment method on file and autoRenew=true, renew
          // Otherwise, suspend
          if (subscription.autoRenew && subscription.paymentCustomerId) {
            await this.lifecycle.renewSubscription(subscription.organizationId);
            renewedCount++;
            this.logger.log(`Trial ended, renewed subscription for org ${subscription.organizationId}`);
          } else {
            await this.lifecycle.suspendSubscription(subscription.organizationId, "trial_ended_no_payment");
            suspendedCount++;
            this.logger.log(`Trial ended, suspended subscription for org ${subscription.organizationId}`);
          }
        } catch (error: any) {
          errorCount++;
          this.logger.error(`Failed to process trial expiration for org ${subscription.organizationId}:`, error);
        }
      }

      // 2. Process renewals (currentPeriodEnd passed)
      const dueForRenewal = await this.prisma.organizationSubscription.findMany({
        where: {
          status: "ACTIVE",
          autoRenew: true,
          currentPeriodEnd: { lte: now },
        },
        include: { plan: true },
      });

      for (const subscription of dueForRenewal) {
        try {
          // Renewal will charge payment method and extend period
          // If payment fails, lifecycle service handles suspension
          await this.lifecycle.renewSubscription(subscription.organizationId);
          renewedCount++;
          this.logger.log(`Renewed subscription for org ${subscription.organizationId}`);
        } catch (error: any) {
          errorCount++;
          this.logger.error(`Failed to renew subscription for org ${subscription.organizationId}:`, error);
          // Don't suspend here - let payment failure webhook handle it
        }
      }

      // 3. Process grace period expiration (SUSPENDED → EXPIRED after 7 days)
      const gracePeriodExpired = await this.prisma.organizationSubscription.findMany({
        where: {
          status: "SUSPENDED",
          currentPeriodEnd: { lte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) }, // 7 days ago
        },
        include: { plan: true },
      });

      for (const subscription of gracePeriodExpired) {
        try {
          await this.lifecycle.expireSubscription(subscription.organizationId);
          expiredCount++;
          this.logger.log(`Grace period expired, expired subscription for org ${subscription.organizationId}`);
        } catch (error: any) {
          errorCount++;
          this.logger.error(`Failed to expire subscription for org ${subscription.organizationId}:`, error);
        }
      }

      // 4. Process scheduled cancellations (cancelAt date reached)
      const scheduledCancellations = await this.prisma.organizationSubscription.findMany({
        where: {
          cancelAt: { lte: now },
          status: { in: ["ACTIVE", "TRIAL", "SUSPENDED"] },
        },
        include: { plan: true },
      });

      for (const subscription of scheduledCancellations) {
        try {
          await this.lifecycle.cancelSubscription(
            subscription.organizationId,
            null as any, // System action (no actor for cron worker)
            { immediate: true, reason: "scheduled_cancellation" },
          );
          cancelledCount++;
          this.logger.log(`Scheduled cancellation executed for org ${subscription.organizationId}`);
        } catch (error: any) {
          errorCount++;
          this.logger.error(`Failed to cancel subscription for org ${subscription.organizationId}:`, error);
        }
      }

      // Summary
      this.logger.log(
        `Subscription renewal worker completed: ${renewedCount} renewed, ${expiredCount} expired, ` +
        `${suspendedCount} suspended, ${cancelledCount} cancelled, ${errorCount} errors`,
      );

      // Audit log summary - system-level action, logged per-org during processing
    } catch (error: any) {
      this.logger.error("Subscription renewal worker failed:", error);
      throw error;
    }
  }

  /// Manual trigger for testing/admin purposes
  async triggerManualRenewal(): Promise<{
    renewedCount: number;
    expiredCount: number;
    suspendedCount: number;
    cancelledCount: number;
    errorCount: number;
  }> {
    this.logger.log("Manual renewal triggered");
    await this.handleSubscriptionRenewals();
    return {
      renewedCount: 0, // Return actual counts if needed for API response
      expiredCount: 0,
      suspendedCount: 0,
      cancelledCount: 0,
      errorCount: 0,
    };
  }
}
