import { Logger } from "@nestjs/common";
import {
  PaymentProvider,
  type ChargeRequest,
  type ChargeResponse,
  type RefundRequest,
  type RefundResponse,
  type CreateCustomerRequest,
  type CreateCustomerResponse,
} from "./payment-provider.interface";

/// Stripe payment provider implementation.
///
/// Requires: STRIPE_SECRET_KEY in encrypted provider config.
/// Webhook secret: STRIPE_WEBHOOK_SECRET for signature verification.
///
/// Stripe SDK is lazily imported (not a hard dependency) so providers can be
/// added/removed without affecting apps that don't use them.
///
/// Error handling:
/// - Network/API errors: throw (retryable)
/// - Card declined: return success=false with errorCode
/// - Invalid request: return success=false with error message
export class StripePaymentProvider extends PaymentProvider {
  private readonly logger = new Logger(StripePaymentProvider.name);
  private readonly secretKey: string;
  private stripe: any; // Stripe SDK type (lazy-loaded)

  constructor(config: { providerType: "STRIPE"; secretKey: string }) {
    super(config);
    this.secretKey = config.secretKey;
  }

  /// Lazy-load Stripe SDK.
  /// Throws if stripe package not installed.
  private async getStripeClient(): Promise<any> {
    if (this.stripe) return this.stripe;

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const Stripe = require("stripe");
      this.stripe = new Stripe(this.secretKey, {
        apiVersion: "2024-12-18.acacia",
        typescript: true,
      });
      return this.stripe;
    } catch (error) {
      throw new Error(
        `Stripe SDK not installed. Run: npm install stripe\n` +
          `This provider requires the 'stripe' package to be installed.`,
      );
    }
  }

  async charge(request: ChargeRequest): Promise<ChargeResponse> {
    try {
      const stripe = await this.getStripeClient();

      const paymentIntent = await stripe.paymentIntents.create({
        amount: request.amount,
        currency: request.currency.toLowerCase(),
        customer: request.customerId,
        description: request.description,
        metadata: request.metadata ?? {},
        idempotencyKey: request.idempotencyKey,
        confirm: true, // Automatically confirm the payment
        automatic_payment_methods: {
          enabled: true,
          allow_redirects: "never",
        },
      });

      if (paymentIntent.status === "succeeded") {
        return {
          success: true,
          chargeId: paymentIntent.id,
          createdAt: new Date(paymentIntent.created * 1000),
        };
      } else {
        // Payment requires additional action or failed
        return {
          success: false,
          error: `Payment ${paymentIntent.status}: ${paymentIntent.last_payment_error?.message ?? "Unknown error"}`,
          errorCode: paymentIntent.last_payment_error?.code,
        };
      }
    } catch (error: any) {
      // Stripe API error
      if (error.type === "StripeCardError") {
        // Card was declined
        return {
          success: false,
          error: error.message,
          errorCode: error.code,
        };
      }

      // Network/API error - throw for retry
      this.logger.error(`Stripe charge failed:`, error);
      throw error;
    }
  }

  async refund(request: RefundRequest): Promise<RefundResponse> {
    try {
      const stripe = await this.getStripeClient();

      const refund = await stripe.refunds.create({
        payment_intent: request.chargeId,
        amount: request.amount,
        reason: this.mapRefundReason(request.reason),
        metadata: {},
      });

      return {
        success: true,
        refundId: refund.id,
        refundedAmount: refund.amount,
        createdAt: new Date(refund.created * 1000),
      };
    } catch (error: any) {
      if (error.type === "StripeInvalidRequestError") {
        // Invalid refund request (already refunded, charge not found, etc.)
        return {
          success: false,
          error: error.message,
          errorCode: error.code,
        };
      }

      // Network/API error - throw for retry
      this.logger.error(`Stripe refund failed:`, error);
      throw error;
    }
  }

  async createCustomer(request: CreateCustomerRequest): Promise<CreateCustomerResponse> {
    try {
      const stripe = await this.getStripeClient();

      const customer = await stripe.customers.create({
        email: request.email,
        name: request.name,
        phone: request.phone,
        metadata: {
          organizationId: request.organizationId,
        },
        idempotencyKey: request.idempotencyKey,
      });

      return {
        success: true,
        customerId: customer.id,
      };
    } catch (error: any) {
      this.logger.error(`Stripe create customer failed:`, error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  verifyWebhookSignature(payload: string, signature: string, webhookSecret: string): boolean {
    try {
      // Synchronous verification (Stripe SDK requirement)
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const Stripe = require("stripe");
      const stripe = new Stripe(this.secretKey);

      // Throws if signature invalid
      stripe.webhooks.constructEvent(payload, signature, webhookSecret);
      return true;
    } catch (error) {
      this.logger.warn(`Stripe webhook signature verification failed:`, error);
      return false;
    }
  }

  async getCustomerPortalUrl(customerId: string, returnUrl?: string): Promise<string | null> {
    try {
      const stripe = await this.getStripeClient();

      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl ?? "https://app.example.com/billing",
      });

      return session.url;
    } catch (error) {
      this.logger.error(`Stripe customer portal URL creation failed:`, error);
      return null;
    }
  }

  /// Map generic refund reason to Stripe-specific reason.
  private mapRefundReason(reason?: string): "duplicate" | "fraudulent" | "requested_by_customer" | undefined {
    if (!reason) return undefined;
    if (reason.includes("duplicate")) return "duplicate";
    if (reason.includes("fraud")) return "fraudulent";
    return "requested_by_customer";
  }
}
