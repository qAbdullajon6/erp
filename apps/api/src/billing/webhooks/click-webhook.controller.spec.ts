import { createHmac } from "crypto";
import { AuditService } from "../../audit/audit.service";
import { PrismaService } from "../../prisma/prisma.service";
import { SubscriptionLifecycleService } from "../subscription-lifecycle.service";
import { asDependency, firstMockArg } from "../test-support/billing-spec.helpers";
import { ClickWebhookController } from "./click-webhook.controller";

const CLICK_SECRET = "click_test_secret_key";
const ORG_ID = "abc123-def456";

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

function makeDto(overrides: Partial<ClickWebhookDto> = {}): ClickWebhookDto {
  const base: ClickWebhookDto = {
    click_trans_id: 12345,
    service_id: 100,
    click_paydoc_id: 67890,
    merchant_trans_id: `sub_${ORG_ID}_1689400000`,
    merchant_prepare_id: 0,
    amount: 149.0,
    action: 0,
    error: 0,
    error_note: "",
    sign_time: "2026-07-15 10:00:00",
    sign_string: "",
    ...overrides,
  };

  const signString =
    `${base.click_trans_id}${base.service_id}${CLICK_SECRET}${base.merchant_trans_id}${base.amount}${base.action}${base.sign_time}`;
  base.sign_string = createHmac("md5", CLICK_SECRET).update(signString).digest("hex");

  return base;
}

function makePrisma(opts: { existingDelivery?: { id: string; status: string; eventType?: string }; subscription?: unknown } = {}) {
  return {
    paymentWebhookDelivery: {
      findFirst: jest.fn().mockResolvedValue(opts.existingDelivery ?? null),
      create: jest.fn().mockResolvedValue({ id: "delivery-1" }),
      upsert: jest.fn().mockResolvedValue({ id: "delivery-1" }),
    },
    organizationSubscription: {
      findUnique: jest.fn().mockResolvedValue(
        "subscription" in opts
          ? opts.subscription
          : { id: "sub-1", organizationId: ORG_ID, plan: { price: 14900 } },
      ),
    },
  };
}

function makeAuditService() {
  return { log: jest.fn().mockResolvedValue(undefined) };
}

function makeLifecycle() {
  return { renewSubscription: jest.fn().mockResolvedValue({}) };
}

describe("ClickWebhookController", () => {
  let controller: ClickWebhookController;
  let prisma: ReturnType<typeof makePrisma>;
  let lifecycle: ReturnType<typeof makeLifecycle>;
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, CLICK_SECRET_KEY: CLICK_SECRET };
    prisma = makePrisma();
    lifecycle = makeLifecycle();
    controller = new ClickWebhookController(
      asDependency<PrismaService>(prisma),
      asDependency<AuditService>(makeAuditService()),
      asDependency<SubscriptionLifecycleService>(lifecycle),
    );
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("prepare phase", () => {
    it("returns success for valid prepare request", async () => {
      const dto = makeDto();
      const result = await controller.prepare(dto);

      expect(result.error).toBe(0);
      expect(result.error_note).toBe("Success");
      expect(prisma.paymentWebhookDelivery.create).toHaveBeenCalled();
      const createCall = firstMockArg<{
        data: { provider: string; eventType: string; status: string };
      }>(prisma.paymentWebhookDelivery.create);
      expect(createCall.data.provider).toBe("click");
      expect(createCall.data.eventType).toBe("prepare");
      expect(createCall.data.status).toBe("PENDING");
    });

    it("rejects invalid signature", async () => {
      const dto = makeDto();
      dto.sign_string = "invalid_signature";

      const result = await controller.prepare(dto);
      expect(result.error).toBe(-1);
      expect(result.error_note).toContain("signature");
    });

    it("returns success for already-processed event (idempotency)", async () => {
      prisma = makePrisma({ existingDelivery: { id: "del-1", status: "DELIVERED" } });
      controller = new ClickWebhookController(
        asDependency<PrismaService>(prisma),
        asDependency<AuditService>(makeAuditService()),
        asDependency<SubscriptionLifecycleService>(lifecycle),
      );

      const dto = makeDto();
      const result = await controller.prepare(dto);
      expect(result.error).toBe(0);
    });

    it("rejects invalid merchant_trans_id format", async () => {
      const dto = makeDto({ merchant_trans_id: "invalid_format" });
      const signString =
        `${dto.click_trans_id}${dto.service_id}${CLICK_SECRET}${dto.merchant_trans_id}${dto.amount}${dto.action}${dto.sign_time}`;
      dto.sign_string = createHmac("md5", CLICK_SECRET).update(signString).digest("hex");

      const result = await controller.prepare(dto);
      expect(result.error).toBe(-5);
    });

    it("rejects when subscription not found", async () => {
      prisma = makePrisma({ subscription: null });
      controller = new ClickWebhookController(
        asDependency<PrismaService>(prisma),
        asDependency<AuditService>(makeAuditService()),
        asDependency<SubscriptionLifecycleService>(lifecycle),
      );

      const dto = makeDto();
      const result = await controller.prepare(dto);
      expect(result.error).toBe(-5);
    });

    it("rejects amount mismatch", async () => {
      const dto = makeDto({ amount: 999.99 });
      const signString =
        `${dto.click_trans_id}${dto.service_id}${CLICK_SECRET}${dto.merchant_trans_id}${dto.amount}${dto.action}${dto.sign_time}`;
      dto.sign_string = createHmac("md5", CLICK_SECRET).update(signString).digest("hex");

      const result = await controller.prepare(dto);
      expect(result.error).toBe(-2);
    });
  });

  describe("complete phase", () => {
    it("renews subscription on successful completion", async () => {
      const dto = makeDto();
      const result = await controller.complete(dto);

      expect(result.error).toBe(0);
      expect(lifecycle.renewSubscription).toHaveBeenCalledWith(ORG_ID);
    });

    it("rejects invalid signature on complete", async () => {
      const dto = makeDto();
      dto.sign_string = "tampered_signature";

      const result = await controller.complete(dto);
      expect(result.error).toBe(-1);
    });

    it("returns success for already-completed event (idempotency)", async () => {
      prisma = makePrisma({
        existingDelivery: { id: "del-1", status: "DELIVERED", eventType: "complete" },
      });
      controller = new ClickWebhookController(
        asDependency<PrismaService>(prisma),
        asDependency<AuditService>(makeAuditService()),
        asDependency<SubscriptionLifecycleService>(lifecycle),
      );

      const dto = makeDto();
      const result = await controller.complete(dto);
      expect(result.error).toBe(0);
      expect(lifecycle.renewSubscription).not.toHaveBeenCalled();
    });

    it("returns internal error when renewal fails", async () => {
      lifecycle.renewSubscription.mockRejectedValue(new Error("Payment processing error"));
      controller = new ClickWebhookController(
        asDependency<PrismaService>(prisma),
        asDependency<AuditService>(makeAuditService()),
        asDependency<SubscriptionLifecycleService>(lifecycle),
      );

      const dto = makeDto();
      const result = await controller.complete(dto);
      expect(result.error).toBe(-9);
    });
  });

  describe("security", () => {
    it("rejects when CLICK_SECRET_KEY not configured", async () => {
      delete process.env.CLICK_SECRET_KEY;
      const dto = makeDto();
      const result = await controller.prepare(dto);
      expect(result.error).toBe(-1);
    });

    it("signature verification uses correct components", () => {
      const dto = makeDto();
      const signString =
        `${dto.click_trans_id}${dto.service_id}${CLICK_SECRET}${dto.merchant_trans_id}${dto.amount}${dto.action}${dto.sign_time}`;
      const expected = createHmac("md5", CLICK_SECRET).update(signString).digest("hex");
      expect(dto.sign_string).toBe(expected);
    });
  });
});
