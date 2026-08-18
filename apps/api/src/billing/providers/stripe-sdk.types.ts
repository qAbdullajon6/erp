/// Minimal Stripe SDK surface used by billing providers (no npm `stripe` dependency).

export interface StripePaymentError {
  type?: string;
  message?: string;
  code?: string;
}

export interface StripePaymentIntent {
  id: string;
  status: string;
  created: number;
  amount?: number;
  currency?: string;
  metadata?: Record<string, string | undefined>;
  last_payment_error?: StripePaymentError;
}

export interface StripeRefund {
  id: string;
  amount: number;
  created: number;
}

export interface StripeCustomer {
  id: string;
}

export interface StripeBillingPortalSession {
  url: string | null;
}

export interface StripeWebhookEvent {
  id: string;
  type: string;
  data: {
    object: StripeWebhookPaymentIntent | StripeWebhookSubscription;
  };
}

export interface StripeWebhookPaymentIntent {
  id: string;
  amount?: number;
  currency?: string;
  metadata?: Record<string, string | undefined>;
  last_payment_error?: StripePaymentError;
}

export interface StripeWebhookSubscription {
  id: string;
  customer: string;
}

export interface StripeClient {
  paymentIntents: {
    create(params: Record<string, unknown>): Promise<StripePaymentIntent>;
  };
  refunds: {
    create(params: Record<string, unknown>): Promise<StripeRefund>;
  };
  customers: {
    create(params: Record<string, unknown>): Promise<StripeCustomer>;
  };
  billingPortal: {
    sessions: {
      create(params: Record<string, unknown>): Promise<StripeBillingPortalSession>;
    };
  };
  webhooks: {
    constructEvent(
      payload: string | Buffer,
      signature: string,
      secret: string,
    ): StripeWebhookEvent;
  };
}

export type StripeConstructor = new (
  secretKey: string,
  options?: { apiVersion?: string; typescript?: boolean },
) => StripeClient;
