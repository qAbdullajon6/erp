/// Payment provider abstraction interface.
///
/// Follows EmailProvider pattern exactly. All payment operations flow through
/// this interface, never direct provider SDK calls. Enables:
/// - Multi-provider support (Stripe, Click, Payme)
/// - Vendor switching without code changes
/// - Org-level or system-level provider config
/// - Testability (mock providers for tests)
///
/// Provider implementations handle:
/// - Charge creation (one-time or recurring)
/// - Refund processing
/// - Customer management (create, update)
/// - Webhook signature verification
/// - Customer portal URL generation (for self-service billing)

export interface ChargeRequest {
  /// Amount in cents (e.g. 2900 = $29.00)
  amount: number;
  currency: string;
  /// Customer identifier in provider system (e.g. Stripe customer ID)
  customerId: string;
  /// Description shown on customer's statement
  description: string;
  /// Idempotency key to prevent duplicate charges
  idempotencyKey?: string;
  /// Metadata for tracking (subscription ID, organization ID, etc.)
  metadata?: Record<string, string>;
}

export interface ChargeResponse {
  success: boolean;
  /// Provider's charge/transaction ID
  chargeId?: string;
  /// Error message if failed
  error?: string;
  /// Error code from provider (for retry logic)
  errorCode?: string;
  /// When charge was created
  createdAt?: Date;
}

export interface RefundRequest {
  /// Provider's charge/transaction ID to refund
  chargeId: string;
  /// Amount to refund in cents. Omit for full refund.
  amount?: number;
  /// Reason for refund (shown to customer)
  reason?: string;
  /// Idempotency key
  idempotencyKey?: string;
}

export interface RefundResponse {
  success: boolean;
  /// Provider's refund ID
  refundId?: string;
  error?: string;
  errorCode?: string;
  refundedAmount?: number;
  createdAt?: Date;
}

export interface CreateCustomerRequest {
  email: string;
  name?: string;
  phone?: string;
  /// Organization ID for metadata
  organizationId: string;
  /// Idempotency key
  idempotencyKey?: string;
}

export interface CreateCustomerResponse {
  success: boolean;
  /// Provider's customer ID
  customerId?: string;
  error?: string;
}

export interface PaymentProviderConfig {
  providerType: "STRIPE" | "CLICK" | "PAYME";
}

/// Abstract base class for payment providers.
/// Implementations: StripePaymentProvider, ClickPaymentProvider, PaymePaymentProvider
export abstract class PaymentProvider {
  protected config: PaymentProviderConfig;

  constructor(config: PaymentProviderConfig) {
    this.config = config;
  }

  /// Charge a customer.
  /// Throws on network/API errors. Returns success=false for decline/validation errors.
  abstract charge(request: ChargeRequest): Promise<ChargeResponse>;

  /// Refund a charge.
  /// Throws on network/API errors. Returns success=false for validation errors.
  abstract refund(request: RefundRequest): Promise<RefundResponse>;

  /// Create a customer in provider system.
  /// Used when organization first subscribes.
  abstract createCustomer(request: CreateCustomerRequest): Promise<CreateCustomerResponse>;

  /// Verify webhook signature.
  /// Returns true if signature is valid, false otherwise.
  /// Prevents webhook spoofing attacks.
  abstract verifyWebhookSignature(payload: string, signature: string, secret: string): boolean;

  /// Get customer portal URL for self-service billing.
  /// Returns URL where customer can update payment method, view invoices, etc.
  /// Returns null if provider doesn't support customer portal.
  abstract getCustomerPortalUrl(customerId: string, returnUrl?: string): Promise<string | null>;
}
