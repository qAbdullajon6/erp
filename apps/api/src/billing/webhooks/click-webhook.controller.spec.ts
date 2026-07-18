import { createHmac } from "crypto";
import { ClickWebhookController } from "./click-webhook.controller";

const CLICK_SECRET = "click_test_secret_key";
// Org ID must match the controller's extractOrganizationId regex /^sub_([a-f0-9-]+)_\d+$/
const ORG_ID = "abc123-def456";

function makeDto(overrides: Partial<any> = {}) {
  const base = {
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

  // Generate valid signature
  const signString =
    `${base.click_trans_id}${base.service_id}${CLICK_SECRET}${base.merchant_trans_id}${base.amount}${base.action}${base.sign_time}`;
  base.sign_string = createHmac("md5", CLICK_SECRET).update(signString).digest("hex");

  return base;
}

function makePrisma(opts: { existingDelivery?: any; subscription?: any } = {}) {
  return {
    paymentWebhookDelivery: {
      findFirst: jest.fn().mockResolvedValue(opts.existingDelivery ?? null),
      create: jest.fn().mockResolvedValue({ id: "delivery-1" }),
      upsert: jest.fn().mockResolvedValue({ id: "delivery-1" }),
    },
    organizationSubscription: {
      findUnique: jest.fn().mockResolvedValue(
        "subscription" in opts ? opts.subscription : { id: "sub-1", organizationId: ORG_ID, plan: { price: 14900 } },
      ),
    },
  } as any;
}

function makeAuditService() {
  return { log: jest.fn().mockResolvedValue(undefined) } as any;
}

function makeLifecycle() {
  return { renewSubscription: jest.fn().mockResolvedValue({}) } as any;
}

describe("ClickWebhookController", () => {
  let controller: ClickWebhookController;
  let prisma: any;
  let lifecycle: any;
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, CLICK_SECRET_KEY: CLICK_SECRET };
    prisma = makePrisma();
    lifecycle = makeLifecycle();
    controller = new ClickWebhookController(prisma, makeAuditService(), lifecycle);
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
      expect(prisma.paymentWebhookDelivery.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            provider: "click",
            eventType: "prepare",
            status: "PENDING",
          }),
        }),
      );
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
      controller = new ClickWebhookController(prisma, makeAuditService(), lifecycle);

      const dto = makeDto();
      const result = await controller.prepare(dto);
      expect(result.error).toBe(0);
    });

    it("rejects invalid merchant_trans_id format", async () => {
      const dto = makeDto({ merchant_trans_id: "invalid_format" });
      // Regenerate signature for the new merchant_trans_id
      const signString =
        `${dto.click_trans_id}${dto.service_id}${CLICK_SECRET}${dto.merchant_trans_id}${dto.amount}${dto.action}${dto.sign_time}`;
      dto.sign_string = createHmac("md5", CLICK_SECRET).update(signString).digest("hex");

      const result = await controller.prepare(dto);
      expect(result.error).toBe(-5);
    });

    it("rejects when subscription not found", async () => {
      prisma = makePrisma({ subscription: null });
      controller = new ClickWebhookController(prisma, makeAuditService(), lifecycle);

      const dto = makeDto();
      const result = await controller.prepare(dto);
      expect(result.error).toBe(-5);
    });

    it("rejects amount mismatch", async () => {
      const dto = makeDto({ amount: 999.99 });
      // Regenerate signature
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
      controller = new ClickWebhookController(prisma, makeAuditService(), lifecycle);

      const dto = makeDto();
      const result = await controller.complete(dto);
      expect(result.error).toBe(0);
      expect(lifecycle.renewSubscription).not.toHaveBeenCalled();
    });

    it("returns internal error when renewal fails", async () => {
      lifecycle.renewSubscription.mockRejectedValue(new Error("Payment processing error"));
      controller = new ClickWebhookController(prisma, makeAuditService(), lifecycle);

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
