import { Controller, Post, Body, Logger } from "@nestjs/common";
import { createHmac } from "crypto";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../audit/audit.service";
import { SubscriptionLifecycleService } from "../subscription-lifecycle.service";

/// Click.uz webhook handler (Uzbekistan payment gateway).
///
/// Click uses prepare/complete two-phase protocol:
/// 1. PREPARE: Check if payment can be accepted (verify order exists, amount matches)
/// 2. COMPLETE: Apply payment (renew subscription)
///
/// Both phases require signature verification via MD5 HMAC.
///
/// Response format (JSON):
/// {
///   "click_trans_id": number,
///   "merchant_trans_id": string,
///   "error": number,      // 0 = success
///   "error_note": string
/// }
@Controller("webhooks/click")
export class ClickWebhookController {
  private readonly logger = new Logger(ClickWebhookController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly lifecycle: SubscriptionLifecycleService,
  ) {}

  @Post("prepare")
  async prepare(@Body() dto: ClickWebhookDto): Promise<ClickWebhookResponse> {
    // Verify signature
    if (!this.verifySignature(dto, "prepare")) {
      this.logger.warn("Click prepare webhook signature verification failed");
      return this.errorResponse(dto, -1, "Invalid signature");
    }

    // Check idempotency
    const existing = await this.prisma.paymentWebhookDelivery.findFirst({
      where: {
        provider: "click",
        externalEventId: dto.click_trans_id.toString(),
      },
    });

    if (existing && existing.status === "DELIVERED") {
      // Already processed successfully
      return this.successResponse(dto);
    }

    // Extract organization ID from merchant_trans_id
    // Format: "sub_{organizationId}_{timestamp}"
    const organizationId = this.extractOrganizationId(dto.merchant_trans_id);
    if (!organizationId) {
      return this.errorResponse(dto, -5, "Invalid merchant transaction ID");
    }

    // Check subscription exists
    const subscription = await this.prisma.organizationSubscription.findUnique({
      where: { organizationId },
      include: { plan: true },
    });

    if (!subscription) {
      return this.errorResponse(dto, -5, "Subscription not found");
    }

    // Check amount matches (Click sends amount in major units)
    const expectedAmount = subscription.plan?.price ?? 0;
    const receivedAmount = Math.round(dto.amount * 100); // Convert to cents

    if (Math.abs(receivedAmount - expectedAmount) > 10) {
      // Allow 10 cent tolerance for rounding
      return this.errorResponse(dto, -2, "Amount mismatch");
    }

    // Record webhook delivery
    await this.prisma.paymentWebhookDelivery.create({
      data: {
        provider: "click",
        externalEventId: dto.click_trans_id.toString(),
        eventType: "prepare",
        payload: dto as any,
        status: "PENDING",
      },
    });

    return this.successResponse(dto);
  }

  @Post("complete")
  async complete(@Body() dto: ClickWebhookDto): Promise<ClickWebhookResponse> {
    // Verify signature
    if (!this.verifySignature(dto, "complete")) {
      this.logger.warn("Click complete webhook signature verification failed");
      return this.errorResponse(dto, -1, "Invalid signature");
    }

    // Check idempotency
    const existing = await this.prisma.paymentWebhookDelivery.findFirst({
      where: {
        provider: "click",
        externalEventId: dto.click_trans_id.toString(),
        eventType: "complete",
      },
    });

    if (existing && existing.status === "DELIVERED") {
      // Already processed
      return this.successResponse(dto);
    }

    // Extract organization ID
    const organizationId = this.extractOrganizationId(dto.merchant_trans_id);
    if (!organizationId) {
      return this.errorResponse(dto, -5, "Invalid merchant transaction ID");
    }

    try {
      // Renew subscription
      await this.lifecycle.renewSubscription(organizationId);

      // Record webhook delivery
      await this.prisma.paymentWebhookDelivery.upsert({
        where: {
          provider_externalEventId_eventType: {
            provider: "click",
            externalEventId: dto.click_trans_id.toString(),
            eventType: "complete",
          },
        },
        create: {
          provider: "click",
          externalEventId: dto.click_trans_id.toString(),
          eventType: "complete",
          payload: dto as any,
          status: "DELIVERED",
          processedAt: new Date(),
        },
        update: {
          status: "DELIVERED",
          processedAt: new Date(),
        },
      });

      // Audit log
      await this.auditService.log({
        organizationId,
        actorUserId: null,
        action: "subscription.payment_succeeded",
        entityType: "OrganizationSubscription",
        entityId: organizationId,
        metadata: {
          provider: "click",
          clickTransId: dto.click_trans_id,
          amount: dto.amount,
        },
      });

      this.logger.log(`Click payment completed for org ${organizationId}, trans ${dto.click_trans_id}`);

      return this.successResponse(dto);
    } catch (error: any) {
      this.logger.error(`Click payment processing failed:`, error);
      return this.errorResponse(dto, -9, "Internal error");
    }
  }

  private verifySignature(dto: ClickWebhookDto, action: "prepare" | "complete"): boolean {
    const secret = process.env.CLICK_SECRET_KEY;
    if (!secret) {
      this.logger.error("CLICK_SECRET_KEY not configured");
      return false;
    }

    // Click signature string format:
    // click_trans_id + service_id + secret_key + merchant_trans_id + amount + action + sign_time
    const signString =
      `${dto.click_trans_id}` +
      `${dto.service_id}` +
      `${secret}` +
      `${dto.merchant_trans_id}` +
      `${dto.amount}` +
      `${dto.action}` +
      `${dto.sign_time}`;

    const expectedSign = createHmac("md5", secret).update(signString).digest("hex");

    return dto.sign_string === expectedSign;
  }

  private extractOrganizationId(merchantTransId: string): string | null {
    // Format: "sub_{organizationId}_{timestamp}"
    const match = merchantTransId.match(/^sub_([a-f0-9-]+)_\d+$/);
    return match ? match[1] : null;
  }

  private successResponse(dto: ClickWebhookDto): ClickWebhookResponse {
    return {
      click_trans_id: dto.click_trans_id,
      merchant_trans_id: dto.merchant_trans_id,
      merchant_prepare_id: dto.merchant_prepare_id,
      error: 0,
      error_note: "Success",
    };
  }

  private errorResponse(dto: ClickWebhookDto, errorCode: number, errorNote: string): ClickWebhookResponse {
    return {
      click_trans_id: dto.click_trans_id,
      merchant_trans_id: dto.merchant_trans_id,
      merchant_prepare_id: dto.merchant_prepare_id,
      error: errorCode,
      error_note: errorNote,
    };
  }
}

interface ClickWebhookDto {
  click_trans_id: number;
  service_id: number;
  click_paydoc_id: number;
  merchant_trans_id: string;
  merchant_prepare_id: number;
  amount: number;
  action: number;
  error: number;
  error_note: string;
  sign_time: string;
  sign_string: string;
}

interface ClickWebhookResponse {
  click_trans_id: number;
  merchant_trans_id: string;
  merchant_prepare_id: number;
  error: number;
  error_note: string;
}
