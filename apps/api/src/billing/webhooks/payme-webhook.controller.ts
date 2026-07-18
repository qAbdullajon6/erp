import { Controller, Post, Body, Headers, Logger, UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../audit/audit.service";
import { SubscriptionLifecycleService } from "../subscription-lifecycle.service";

/// Payme.uz webhook handler (Uzbekistan payment gateway).
///
/// Payme uses JSON-RPC 2.0 protocol with HTTP Basic Auth.
/// Methods: CheckPerformTransaction, CreateTransaction, PerformTransaction, CancelTransaction
///
/// Authentication: HTTP Basic Auth with merchant_id:secret_key (Base64-encoded)
@Controller("webhooks/payme")
export class PaymeWebhookController {
  private readonly logger = new Logger(PaymeWebhookController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly lifecycle: SubscriptionLifecycleService,
  ) {}

  @Post()
  async handleWebhook(
    @Body() rpcRequest: PaymeRpcRequest,
    @Headers("authorization") authHeader: string,
  ): Promise<PaymeRpcResponse> {
    // Verify Basic Auth
    if (!this.verifyAuth(authHeader)) {
      throw new UnauthorizedException("Invalid credentials");
    }

    try {
      const result = await this.processMethod(rpcRequest);
      return {
        jsonrpc: "2.0",
        id: rpcRequest.id,
        result,
      };
    } catch (error: any) {
      return {
        jsonrpc: "2.0",
        id: rpcRequest.id,
        error: {
          code: error.code ?? -32603,
          message: error.message ?? "Internal error",
        },
      };
    }
  }

  private verifyAuth(authHeader: string): boolean {
    if (!authHeader || !authHeader.startsWith("Basic ")) {
      return false;
    }

    const merchantId = process.env.PAYME_MERCHANT_ID;
    const secretKey = process.env.PAYME_SECRET_KEY;

    if (!merchantId || !secretKey) {
      this.logger.error("PAYME_MERCHANT_ID or PAYME_SECRET_KEY not configured");
      return false;
    }

    const expectedAuth = `Basic ${Buffer.from(`${merchantId}:${secretKey}`).toString("base64")}`;
    return authHeader === expectedAuth;
  }

  private async processMethod(request: PaymeRpcRequest): Promise<any> {
    switch (request.method) {
      case "CheckPerformTransaction":
        return this.checkPerformTransaction(request.params);

      case "CreateTransaction":
        return this.createTransaction(request.params);

      case "PerformTransaction":
        return this.performTransaction(request.params);

      case "CancelTransaction":
        return this.cancelTransaction(request.params);

      default:
        throw { code: -32601, message: "Method not found" };
    }
  }

  private async checkPerformTransaction(params: any): Promise<any> {
    // Extract organization ID from account.order_id
    const organizationId = params.account?.order_id;
    if (!organizationId) {
      throw { code: -31050, message: "Invalid account" };
    }

    // Check subscription exists
    const subscription = await this.prisma.organizationSubscription.findUnique({
      where: { organizationId },
      include: { plan: true },
    });

    if (!subscription) {
      throw { code: -31050, message: "Subscription not found" };
    }

    // Check amount matches
    const expectedAmount = (subscription.plan?.price ?? 0) * 100; // Payme uses tiyin (1 UZS = 100 tiyin)
    if (params.amount !== expectedAmount) {
      throw { code: -31001, message: "Invalid amount" };
    }

    return { allow: true };
  }

  private async createTransaction(params: any): Promise<any> {
    const transactionId = params.id;

    // Check idempotency
    const existing = await this.prisma.paymentWebhookDelivery.findFirst({
      where: {
        provider: "payme",
        externalEventId: transactionId,
      },
    });

    if (existing) {
      // Return existing transaction
      return {
        transaction: existing.id,
        state: existing.status === "DELIVERED" ? 2 : 1,
        create_time: existing.createdAt.getTime(),
      };
    }

    // Create transaction record
    const delivery = await this.prisma.paymentWebhookDelivery.create({
      data: {
        provider: "payme",
        externalEventId: transactionId,
        eventType: "CreateTransaction",
        payload: params as any,
        status: "PENDING",
      },
    });

    return {
      transaction: delivery.id,
      state: 1, // Created
      create_time: delivery.createdAt.getTime(),
    };
  }

  private async performTransaction(params: any): Promise<any> {
    const transactionId = params.id;

    // Find transaction
    const delivery = await this.prisma.paymentWebhookDelivery.findFirst({
      where: {
        provider: "payme",
        externalEventId: transactionId,
      },
    });

    if (!delivery) {
      throw { code: -31003, message: "Transaction not found" };
    }

    if (delivery.status === "DELIVERED") {
      // Already performed
      return {
        transaction: delivery.id,
        state: 2, // Performed
        perform_time: delivery.processedAt?.getTime() ?? Date.now(),
      };
    }

    // Extract organization ID
    const payload = delivery.payload as any;
    const organizationId = payload.account?.order_id;

    if (!organizationId) {
      throw { code: -31050, message: "Invalid account in transaction" };
    }

    try {
      // Renew subscription
      await this.lifecycle.renewSubscription(organizationId);

      // Mark as processed
      await this.prisma.paymentWebhookDelivery.update({
        where: { id: delivery.id },
        data: {
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
          provider: "payme",
          transactionId: transactionId,
          amount: payload.amount,
        },
      });

      this.logger.log(`Payme payment completed for org ${organizationId}, trans ${transactionId}`);

      return {
        transaction: delivery.id,
        state: 2, // Performed
        perform_time: Date.now(),
      };
    } catch (error: any) {
      this.logger.error(`Payme payment processing failed:`, error);
      throw { code: -31008, message: "Unable to perform transaction" };
    }
  }

  private async cancelTransaction(params: any): Promise<any> {
    const transactionId = params.id;

    // Find transaction
    const delivery = await this.prisma.paymentWebhookDelivery.findFirst({
      where: {
        provider: "payme",
        externalEventId: transactionId,
      },
    });

    if (!delivery) {
      throw { code: -31003, message: "Transaction not found" };
    }

    // Mark as failed (cancelled by provider)
    await this.prisma.paymentWebhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: "FAILED",
        processedAt: new Date(),
        errorMessage: `Cancelled by Payme: reason ${params.reason}`,
      },
    });

    return {
      transaction: delivery.id,
      state: -2, // Cancelled after perform
      cancel_time: Date.now(),
    };
  }
}

interface PaymeRpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params: any;
}

interface PaymeRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: any;
  error?: {
    code: number;
    message: string;
  };
}
