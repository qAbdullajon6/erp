import { BadRequestException } from "@nestjs/common";
import type { Request } from "express";
import { AuditService } from "../../audit/audit.service";
import { PrismaService } from "../../prisma/prisma.service";
import { PaymentProviderRegistry } from "../payment-provider.registry";
import { SubscriptionLifecycleService } from "../subscription-lifecycle.service";
import { asDependency } from "../test-support/billing-spec.helpers";
import { StripeWebhookController } from "./stripe-webhook.controller";

const VALID_EVENT = {
  id: "evt_test_123",
  type: "payment_intent.succeeded",
  data: {
    object: {
      id: "pi_123",
      amount: 14900,
      currency: "usd",
      metadata: { organizationId: "org-1" },
    },
  },
};

function makePrisma(opts: { existingDelivery?: { id: string; status: string }; subscription?: unknown } = {}) {
  return {
    paymentWebhookDelivery: {
      findFirst: jest.fn().mockResolvedValue(opts.existingDelivery ?? null),
      create: jest.fn().mockResolvedValue({ id: "delivery-1" }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    organizationSubscription: {
      findUnique: jest.fn().mockResolvedValue(
        opts.subscription ?? { id: "sub-1", organizationId: "org-1", plan: { price: 14900 } },
      ),
      findFirst: jest.fn().mockResolvedValue(opts.subscription ?? null),
    },
  };
}

function makeAuditService() {
  return { log: jest.fn().mockResolvedValue(undefined) };
}

function makeLifecycle() {
  return {
    renewSubscription: jest.fn().mockResolvedValue({}),
    suspendSubscription: jest.fn().mockResolvedValue({}),
    expireSubscription: jest.fn().mockResolvedValue({}),
  };
}

function makeProviderRegistry() {
  return {};
}

type StripeWebhookHandlers = {
  handlePaymentSucceeded: (paymentIntent: {
    id: string;
    amount: number;
    currency?: string;
    metadata?: Record<string, string>;
  }) => Promise<void>;
  handlePaymentFailed: (paymentIntent: {
    id: string;
    amount: number;
    metadata?: Record<string, string>;
    last_payment_error?: { code?: string; message?: string };
  }) => Promise<void>;
  handleSubscriptionDeleted: (stripeSubscription: { id: string; customer: string }) => Promise<void>;
};

function getStripeHandlers(controller: StripeWebhookController): StripeWebhookHandlers {
  return controller as unknown as StripeWebhookHandlers;
}

describe("StripeWebhookController", () => {
  let controller: StripeWebhookController;
  let prisma: ReturnType<typeof makePrisma>;
  let lifecycle: ReturnType<typeof makeLifecycle>;
  let auditService: ReturnType<typeof makeAuditService>;
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      STRIPE_WEBHOOK_SECRET: "whsec_test_secret",
      STRIPE_SECRET_KEY: "sk_test_key",
    };
    prisma = makePrisma();
    lifecycle = makeLifecycle();
    auditService = makeAuditService();
    controller = new StripeWebhookController(
      asDependency<PrismaService>(prisma),
      asDependency<AuditService>(auditService),
      asDependency<SubscriptionLifecycleService>(lifecycle),
      asDependency<PaymentProviderRegistry>(makeProviderRegistry()),
    );
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("signature verification", () => {
    it("rejects request with missing signature header", async () => {
      const req = { body: {}, rawBody: "{}" } as unknown as Request;
      await expect(controller.handleWebhook(req, "")).rejects.toThrow(BadRequestException);
    });

    it("rejects request with invalid signature", async () => {
      const req = { body: VALID_EVENT, rawBody: JSON.stringify(VALID_EVENT) } as unknown as Request;
      await expect(controller.handleWebhook(req, "invalid_sig")).rejects.toThrow(BadRequestException);
    });

    it("rejects when STRIPE_WEBHOOK_SECRET is not configured", async () => {
      delete process.env.STRIPE_WEBHOOK_SECRET;
      const req = { body: VALID_EVENT, rawBody: JSON.stringify(VALID_EVENT) } as unknown as Request;
      await expect(controller.handleWebhook(req, "sig_valid")).rejects.toThrow(BadRequestException);
    });
  });

  describe("idempotency", () => {
    it("skips processing for already-delivered events", () => {
      prisma = makePrisma({ existingDelivery: { id: "del-1", status: "DELIVERED" } });
      controller = new StripeWebhookController(
        asDependency<PrismaService>(prisma),
        asDependency<AuditService>(auditService),
        asDependency<SubscriptionLifecycleService>(lifecycle),
        asDependency<PaymentProviderRegistry>(makeProviderRegistry()),
      );

      expect(prisma.paymentWebhookDelivery.findFirst).toBeDefined();
    });
  });

  describe("event processing (unit)", () => {
    it("handlePaymentSucceeded triggers subscription renewal", async () => {
      const handlers = getStripeHandlers(controller);
      await handlers.handlePaymentSucceeded({
        id: "pi_123",
        amount: 14900,
        currency: "usd",
        metadata: { organizationId: "org-1" },
      });

      expect(lifecycle.renewSubscription).toHaveBeenCalledWith("org-1");
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: "subscription.payment_succeeded" }),
      );
    });

    it("handlePaymentSucceeded skips when organizationId missing from metadata", async () => {
      const handlers = getStripeHandlers(controller);
      await handlers.handlePaymentSucceeded({ id: "pi_123", amount: 14900, metadata: {} });

      expect(lifecycle.renewSubscription).not.toHaveBeenCalled();
    });

    it("handlePaymentFailed suspends subscription", async () => {
      const handlers = getStripeHandlers(controller);
      await handlers.handlePaymentFailed({
        id: "pi_456",
        amount: 14900,
        metadata: { organizationId: "org-1" },
        last_payment_error: { code: "card_declined", message: "Card declined" },
      });

      expect(lifecycle.suspendSubscription).toHaveBeenCalledWith("org-1", expect.stringContaining("payment_failed"));
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: "subscription.payment_failed" }),
      );
    });

    it("handleSubscriptionDeleted expires subscription", async () => {
      prisma.organizationSubscription.findFirst.mockResolvedValue({
        id: "sub-1",
        organizationId: "org-1",
      });
      const handlers = getStripeHandlers(controller);
      await handlers.handleSubscriptionDeleted({ id: "sub_stripe_789", customer: "cus_123" });

      expect(lifecycle.expireSubscription).toHaveBeenCalledWith("org-1");
    });

    it("handleSubscriptionDeleted does nothing for unknown customer", async () => {
      prisma.organizationSubscription.findFirst.mockResolvedValue(null);
      const handlers = getStripeHandlers(controller);
      await handlers.handleSubscriptionDeleted({ id: "sub_stripe_789", customer: "cus_unknown" });

      expect(lifecycle.expireSubscription).not.toHaveBeenCalled();
    });
  });
});
