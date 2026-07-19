import { Logger } from "@nestjs/common";
import { createHmac } from "crypto";
import {
  PaymentProvider,
  type ChargeRequest,
  type ChargeResponse,
  type RefundRequest,
  type RefundResponse,
  type CreateCustomerRequest,
  type CreateCustomerResponse,
} from "./payment-provider.interface";

/// Click payment provider (Uzbekistan payment gateway).
///
/// Click.uz API integration for UZS payments. Supports card payments,
/// merchant API, and webhook notifications.
///
/// Configuration:
/// - merchantId: Click merchant ID
/// - serviceId: Click service ID
/// - secretKey: API secret key for request signing
/// - merchantUserId: Merchant user ID for API calls
///
/// Note: Click does not have native customer management. Customer tracking
/// is handled via transaction metadata.
export class ClickPaymentProvider extends PaymentProvider {
  private readonly logger = new Logger(ClickPaymentProvider.name);
  private readonly merchantId: string;
  private readonly serviceId: string;
  private readonly secretKey: string;
  private readonly merchantUserId: string;
  private readonly apiBaseUrl = "https://api.click.uz/v2/merchant";

  constructor(config: {
    providerType: "CLICK";
    merchantId: string;
    serviceId: string;
    secretKey: string;
    merchantUserId: string;
  }) {
    super(config);
    this.merchantId = config.merchantId;
    this.serviceId = config.serviceId;
    this.secretKey = config.secretKey;
    this.merchantUserId = config.merchantUserId;
  }

  async charge(request: ChargeRequest): Promise<ChargeResponse> {
    try {
      // Click uses invoice + payment flow
      // 1. Create invoice
      // 2. Customer pays via Click app/web
      // 3. Webhook notifies of payment
      //
      // For API charges (card-on-file), use card_token endpoint
      const timestamp = Date.now();
      const signString = `${timestamp}${this.secretKey}`;
      const sign = this.generateMD5(signString);

      const payload = {
        service_id: parseInt(this.serviceId),
        merchant_trans_id: request.idempotencyKey ?? `${Date.now()}-${request.customerId}`,
        amount: request.amount / 100, // Click expects major units (e.g. 100.00 UZS, not 10000 tiyin)
        phone_number: request.customerId, // Click uses phone as customer ID
        merchant_user_id: parseInt(this.merchantUserId),
        merchant_prepare_id: timestamp,
        sign,
      };

      const response = await fetch(`${this.apiBaseUrl}/invoice/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (data.error_code === 0) {
        return {
          success: true,
          chargeId: data.invoice_id.toString(),
          createdAt: new Date(),
        };
      } else {
        return {
          success: false,
          error: data.error_note ?? "Payment failed",
          errorCode: data.error_code?.toString(),
        };
      }
    } catch (error: any) {
      this.logger.error(`Click charge failed:`, error);
      throw error;
    }
  }

  async refund(request: RefundRequest): Promise<RefundResponse> {
    try {
      // Click refund API
      const timestamp = Date.now();
      const signString = `${timestamp}${this.secretKey}`;
      const sign = this.generateMD5(signString);

      const payload = {
        service_id: parseInt(this.serviceId),
        click_trans_id: parseInt(request.chargeId),
        refund_amount: request.amount ? request.amount / 100 : undefined,
        merchant_user_id: parseInt(this.merchantUserId),
        merchant_prepare_id: timestamp,
        sign,
      };

      const response = await fetch(`${this.apiBaseUrl}/invoice/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (data.error_code === 0) {
        return {
          success: true,
          refundId: data.click_trans_id?.toString(),
          refundedAmount: request.amount,
          createdAt: new Date(),
        };
      } else {
        return {
          success: false,
          error: data.error_note ?? "Refund failed",
          errorCode: data.error_code?.toString(),
        };
      }
    } catch (error: any) {
      this.logger.error(`Click refund failed:`, error);
      throw error;
    }
  }

  async createCustomer(_request: CreateCustomerRequest): Promise<CreateCustomerResponse> {
    // Click does not have customer management API
    // Return phone number as "customer ID" for transaction tagging
    return {
      success: true,
      customerId: _request.phone ?? _request.email,
    };
  }

  verifyWebhookSignature(payload: string, _signature: string, webhookSecret: string): boolean {
    try {
      const data = JSON.parse(payload);

      // Click webhook signature verification
      // sign_string = click_trans_id + service_id + secret_key + merchant_trans_id + amount + action + sign_time
      const signString =
        `${data.click_trans_id}` +
        `${data.service_id}` +
        `${webhookSecret}` +
        `${data.merchant_trans_id}` +
        `${data.amount}` +
        `${data.action}` +
        `${data.sign_time}`;

      const expectedSign = this.generateMD5(signString);

      return data.sign_string === expectedSign;
    } catch (error) {
      this.logger.warn(`Click webhook signature verification failed:`, error);
      return false;
    }
  }

  async getCustomerPortalUrl(_customerId: string, _returnUrl?: string): Promise<string | null> {
    // Click does not have customer portal
    return null;
  }

  /// Generate MD5 hash for Click API signature.
  private generateMD5(input: string): string {
    return createHmac("md5", this.secretKey).update(input).digest("hex");
  }
}
