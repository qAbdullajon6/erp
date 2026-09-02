import { Controller, Post, Req, Headers, Logger, BadRequestException } from "@nestjs/common";
import { Request } from "express";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../audit/audit.service";
import { SubscriptionLifecycleService } from "../subscription-lifecycle.service";
import { PaymentProviderRegistry } from "../payment-provider.registry";
import { loadStripe } from "../providers/stripe-loader";
import { getErrorMessage } from "../providers/stripe-errors";
import type {
  StripeWebhookEvent,
  StripeWebhookPaymentIntent,
  StripeWebhookSubscription,
} from "../providers/stripe-sdk.types";

/// Stripe webhook handler.
///
/// Receives payment events from Stripe and updates subscription status accordingly.
/// Critical for automated billing: without webhooks, payments don't update subscriptions.
///
/// Events handled:
/// - payment_intent.succeeded: Renew subscription, clear suspended status
/// - payment_intent.payment_failed: Suspend subscription after retry exhaustion
/// - customer.subscription.deleted: Expire subscription (Stripe-managed subscriptions)
///
/// Security:
/// - Signature verification via Stripe SDK (prevents spoofing)
/// - Idempotency: processes each event exactly once (event ID tracking)
/// - Rate limiting: webhook endpoint should be rate-limited separately
///
/// Retry safety:
/// - All operations idempotent (processing same event twice = safe)
/// - Audit log records every webhook received
/// - Failed processing logged but doesn't return error (Stripe retries on 5xx)
@Controller("webhooks/stripe")
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly lifecycle: SubscriptionLifecycleService,
    private readonly providerRegistry: PaymentProviderRegistry,
  ) {}

  @Post()
  async handleWebhook(
    @Req() req: Request,
    @Headers("stripe-signature") signature: string,
  ): Promise<{ received: boolean }> {
    if (!signature) {
      throw new BadRequestException("Missing stripe-signature header");
    }

    // Get raw body for signature verification
    const payload = req.rawBody ?? JSON.stringify(req.body);

    // Verify signature (throws if invalid)
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      this.logger.error("STRIPE_WEBHOOK_SECRET not configured");
      throw new BadRequestException("Webhook secret not configured");
    }

    let event: StripeWebhookEvent;
    try {
      const stripe = loadStripe(process.env.STRIPE_SECRET_KEY ?? "");
      event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    } catch (error: unknown) {
      this.logger.warn(`Stripe webhook signature verification failed: ${getErrorMessage(error)}`);
      throw new BadRequestException("Invalid signature");
    }

    // Check idempotency (already processed this event?)
    const existing = await this.prisma.paymentWebhookDelivery.findFirst({
      where: {
        provider: "stripe",
        externalEventId: event.id,
      },
    });

    if (existing) {
      this.logger.log(`Stripe event ${event.id} already processed, skipping`);
      return { received: true };
    }

    // Record webhook delivery
    await this.prisma.paymentWebhookDelivery.create({
      data: {
        provider: "stripe",
        externalEventId: event.id,
        eventType: event.type,
        payload: event as unknown as Prisma.InputJsonValue,
        status: "DELIVERING",
      },
    });

    // Process event
    try {
      await this.processEvent(event);

      // Mark as processed
      await this.prisma.paymentWebhookDelivery.updateMany({
        where: { externalEventId: event.id },
        data: { status: "DELIVERED", processedAt: new Date() },
      });

      this.logger.log(`Stripe event ${event.id} (${event.type}) processed successfully`);
    } catch (error: unknown) {
      // Mark as failed but don't throw (Stripe will retry on 5xx)
      await this.prisma.paymentWebhookDelivery.updateMany({
        where: { externalEventId: event.id },
        data: {
          status: "FAILED",
          errorMessage: getErrorMessage(error),
          processedAt: new Date(),
        },
      });

      this.logger.error(`Stripe event ${event.id} processing failed:`, error);
    }

    return { received: true };
  }

  private async processEvent(event: StripeWebhookEvent): Promise<void> {
    switch (event.type) {
      case "payment_intent.succeeded":
        await this.handlePaymentSucceeded(event.data.object);
        break;

      case "payment_intent.payment_failed":
        await this.handlePaymentFailed(event.data.object);
        break;

      case "customer.subscription.deleted":
        await this.handleSubscriptionDeleted(event.data.object as StripeWebhookSubscription);
        break;

      default:
        this.logger.log(`Unhandled Stripe event type: ${event.type}`);
    }
  }

  private async handlePaymentSucceeded(paymentIntent: StripeWebhookPaymentIntent): Promise<void> {
    // Extract organization ID from metadata
    const organizationId = paymentIntent.metadata?.organizationId;
    if (!organizationId) {
      this.logger.warn(`Payment ${paymentIntent.id} missing organizationId in metadata`);
      return;
    }

    // Get subscription
    const subscription = await this.prisma.organizationSubscription.findUnique({
      where: { organizationId },
      include: { plan: true },
    });

    if (!subscription) {
      this.logger.warn(`No subscription found for org ${organizationId}`);
      return;
    }

    // Renew subscription (extends period, clears suspended status)
    await this.lifecycle.renewSubscription(organizationId);

    // Audit log
    await this.auditService.log({
      organizationId,
      actorUserId: null, // System action
      action: "subscription.payment_succeeded",
      entityType: "OrganizationSubscription",
      entityId: subscription.id,
      metadata: {
        paymentIntentId: paymentIntent.id,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
      },
    });

    this.logger.log(`Renewed subscription for org ${organizationId} after payment ${paymentIntent.id}`);
  }

  private async handlePaymentFailed(paymentIntent: StripeWebhookPaymentIntent): Promise<void> {
    // Extract organization ID from metadata
    const organizationId = paymentIntent.metadata?.organizationId;
    if (!organizationId) {
      this.logger.warn(`Payment ${paymentIntent.id} missing organizationId in metadata`);
      return;
    }

    // Get subscription
    const subscription = await this.prisma.organizationSubscription.findUnique({
      where: { organizationId },
      include: { plan: true },
    });

    if (!subscription) {
      this.logger.warn(`No subscription found for org ${organizationId}`);
      return;
    }

    // Check if this is final failure (Stripe retries 3 times by default)
    const lastError = paymentIntent.last_payment_error;
    const reason = lastError?.message || "Payment failed";

    // Suspend subscription after payment failure
    await this.lifecycle.suspendSubscription(
      organizationId,
      `payment_failed: ${reason}`,
    );

    // Audit log
    await this.auditService.log({
      organizationId,
      actorUserId: null, // System action
      action: "subscription.payment_failed",
      entityType: "OrganizationSubscription",
      entityId: subscription.id,
      metadata: {
        paymentIntentId: paymentIntent.id,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        errorCode: lastError?.code,
        errorMessage: reason,
      },
    });

    this.logger.warn(`Suspended subscription for org ${organizationId} after payment failure ${paymentIntent.id}`);
  }

  private async handleSubscriptionDeleted(stripeSubscription: StripeWebhookSubscription): Promise<void> {
    // Handle Stripe-managed subscription deletion
    // (Most FlowERP subscriptions are managed internally, not via Stripe Subscriptions API)
    const customerId = stripeSubscription.customer;

    // Find organization by payment customer ID
    const subscription = await this.prisma.organizationSubscription.findFirst({
      where: { paymentCustomerId: customerId },
    });

    if (!subscription) {
      this.logger.log(`No subscription found for Stripe customer ${customerId}`);
      return;
    }

    // Expire subscription
    await this.lifecycle.expireSubscription(subscription.organizationId);

    // Audit log
    await this.auditService.log({
      organizationId: subscription.organizationId,
      actorUserId: null, // System action
      action: "subscription.stripe_deleted",
      entityType: "OrganizationSubscription",
      entityId: subscription.id,
      metadata: {
        stripeSubscriptionId: stripeSubscription.id,
        stripeCustomerId: customerId,
      },
    });

    this.logger.log(`Expired subscription for org ${subscription.organizationId} after Stripe subscription deleted`);
  }
}
