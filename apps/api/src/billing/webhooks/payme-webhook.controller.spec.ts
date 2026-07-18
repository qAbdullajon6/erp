import { UnauthorizedException } from "@nestjs/common";
import { PaymeWebhookController } from "./payme-webhook.controller";

const MERCHANT_ID = "test_merchant_id";
const SECRET_KEY = "test_secret_key";
const VALID_AUTH = `Basic ${Buffer.from(`${MERCHANT_ID}:${SECRET_KEY}`).toString("base64")}`;

function makePrisma(opts: { existingDelivery?: any; subscription?: any } = {}) {
  return {
    paymentWebhookDelivery: {
      findFirst: jest.fn().mockResolvedValue(opts.existingDelivery ?? null),
      create: jest.fn().mockResolvedValue({
        id: "delivery-1",
        createdAt: new Date("2026-07-15T10:00:00Z"),
        status: "PENDING",
        payload: { account: { order_id: "org-1" }, amount: 1490000 },
      }),
      update: jest.fn().mockResolvedValue({ id: "delivery-1", processedAt: new Date() }),
    },
    organizationSubscription: {
      findUnique: jest.fn().mockResolvedValue(
        "subscription" in opts ? opts.subscription : { id: "sub-1", organizationId: "org-1", plan: { price: 14900 } },
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

describe("PaymeWebhookController", () => {
  let controller: PaymeWebhookController;
  let prisma: any;
  let lifecycle: any;
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, PAYME_MERCHANT_ID: MERCHANT_ID, PAYME_SECRET_KEY: SECRET_KEY };
    prisma = makePrisma();
    lifecycle = makeLifecycle();
    controller = new PaymeWebhookController(prisma, makeAuditService(), lifecycle);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("authentication", () => {
    it("accepts valid Basic Auth credentials", async () => {
      const rpcRequest = {
        jsonrpc: "2.0" as const,
        id: 1,
        method: "CheckPerformTransaction",
        params: { account: { order_id: "org-1" }, amount: 1490000 },
      };

      const result = await controller.handleWebhook(rpcRequest, VALID_AUTH);
      expect(result.error).toBeUndefined();
    });

    it("rejects missing authorization header", async () => {
      const rpcRequest = {
        jsonrpc: "2.0" as const,
        id: 1,
        method: "CheckPerformTransaction",
        params: {},
      };

      await expect(controller.handleWebhook(rpcRequest, "")).rejects.toThrow(UnauthorizedException);
    });

    it("rejects invalid credentials", async () => {
      const invalidAuth = `Basic ${Buffer.from("wrong:creds").toString("base64")}`;
      const rpcRequest = {
        jsonrpc: "2.0" as const,
        id: 1,
        method: "CheckPerformTransaction",
        params: {},
      };

      await expect(controller.handleWebhook(rpcRequest, invalidAuth)).rejects.toThrow(UnauthorizedException);
    });

    it("rejects non-Basic auth scheme", async () => {
      const rpcRequest = {
        jsonrpc: "2.0" as const,
        id: 1,
        method: "CheckPerformTransaction",
        params: {},
      };

      await expect(controller.handleWebhook(rpcRequest, "Bearer token123")).rejects.toThrow(UnauthorizedException);
    });

    it("rejects when PAYME credentials not configured", async () => {
      delete process.env.PAYME_MERCHANT_ID;
      const rpcRequest = {
        jsonrpc: "2.0" as const,
        id: 1,
        method: "CheckPerformTransaction",
        params: {},
      };

      await expect(controller.handleWebhook(rpcRequest, VALID_AUTH)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe("CheckPerformTransaction", () => {
    it("returns allow=true for valid account and amount", async () => {
      const rpcRequest = {
        jsonrpc: "2.0" as const,
        id: 1,
        method: "CheckPerformTransaction",
        params: { account: { order_id: "org-1" }, amount: 1490000 },
      };

      const result = await controller.handleWebhook(rpcRequest, VALID_AUTH);
      expect(result.result).toEqual({ allow: true });
    });

    it("returns error for missing account", async () => {
      const rpcRequest = {
        jsonrpc: "2.0" as const,
        id: 1,
        method: "CheckPerformTransaction",
        params: { amount: 1490000 },
      };

      const result = await controller.handleWebhook(rpcRequest, VALID_AUTH);
      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe(-31050);
    });

    it("returns error for subscription not found", async () => {
      prisma = makePrisma({ subscription: null });
      controller = new PaymeWebhookController(prisma, makeAuditService(), lifecycle);

      const rpcRequest = {
        jsonrpc: "2.0" as const,
        id: 1,
        method: "CheckPerformTransaction",
        params: { account: { order_id: "org-nonexistent" }, amount: 1490000 },
      };

      const result = await controller.handleWebhook(rpcRequest, VALID_AUTH);
      expect(result.error?.code).toBe(-31050);
    });

    it("returns error for amount mismatch", async () => {
      const rpcRequest = {
        jsonrpc: "2.0" as const,
        id: 1,
        method: "CheckPerformTransaction",
        params: { account: { order_id: "org-1" }, amount: 999999 },
      };

      const result = await controller.handleWebhook(rpcRequest, VALID_AUTH);
      expect(result.error?.code).toBe(-31001);
    });
  });

  describe("CreateTransaction", () => {
    it("creates transaction and returns state=1", async () => {
      const rpcRequest = {
        jsonrpc: "2.0" as const,
        id: 2,
        method: "CreateTransaction",
        params: { id: "trans_123", account: { order_id: "org-1" }, amount: 1490000 },
      };

      const result = await controller.handleWebhook(rpcRequest, VALID_AUTH);
      expect(result.result.state).toBe(1);
      expect(result.result.transaction).toBe("delivery-1");
    });

    it("returns existing transaction if already created (idempotency)", async () => {
      prisma = makePrisma({
        existingDelivery: {
          id: "delivery-existing",
          status: "PENDING",
          createdAt: new Date("2026-07-15T10:00:00Z"),
        },
      });
      controller = new PaymeWebhookController(prisma, makeAuditService(), lifecycle);

      const rpcRequest = {
        jsonrpc: "2.0" as const,
        id: 2,
        method: "CreateTransaction",
        params: { id: "trans_123", account: { order_id: "org-1" }, amount: 1490000 },
      };

      const result = await controller.handleWebhook(rpcRequest, VALID_AUTH);
      expect(result.result.transaction).toBe("delivery-existing");
      expect(result.result.state).toBe(1);
    });
  });

  describe("PerformTransaction", () => {
    it("performs payment and returns state=2", async () => {
      prisma = makePrisma({
        existingDelivery: {
          id: "delivery-1",
          status: "PENDING",
          payload: { account: { order_id: "org-1" }, amount: 1490000 },
        },
      });
      controller = new PaymeWebhookController(prisma, makeAuditService(), lifecycle);

      const rpcRequest = {
        jsonrpc: "2.0" as const,
        id: 3,
        method: "PerformTransaction",
        params: { id: "trans_123" },
      };

      const result = await controller.handleWebhook(rpcRequest, VALID_AUTH);
      expect(result.result.state).toBe(2);
      expect(lifecycle.renewSubscription).toHaveBeenCalledWith("org-1");
    });

    it("returns state=2 for already-performed transaction (idempotency)", async () => {
      prisma = makePrisma({
        existingDelivery: {
          id: "delivery-1",
          status: "DELIVERED",
          processedAt: new Date("2026-07-15T11:00:00Z"),
        },
      });
      controller = new PaymeWebhookController(prisma, makeAuditService(), lifecycle);

      const rpcRequest = {
        jsonrpc: "2.0" as const,
        id: 3,
        method: "PerformTransaction",
        params: { id: "trans_123" },
      };

      const result = await controller.handleWebhook(rpcRequest, VALID_AUTH);
      expect(result.result.state).toBe(2);
      expect(lifecycle.renewSubscription).not.toHaveBeenCalled();
    });

    it("returns error for non-existent transaction", async () => {
      const rpcRequest = {
        jsonrpc: "2.0" as const,
        id: 3,
        method: "PerformTransaction",
        params: { id: "trans_nonexistent" },
      };

      const result = await controller.handleWebhook(rpcRequest, VALID_AUTH);
      expect(result.error?.code).toBe(-31003);
    });
  });

  describe("CancelTransaction", () => {
    it("cancels transaction and returns state=-2", async () => {
      prisma = makePrisma({
        existingDelivery: { id: "delivery-1", status: "DELIVERED" },
      });
      controller = new PaymeWebhookController(prisma, makeAuditService(), lifecycle);

      const rpcRequest = {
        jsonrpc: "2.0" as const,
        id: 4,
        method: "CancelTransaction",
        params: { id: "trans_123", reason: 1 },
      };

      const result = await controller.handleWebhook(rpcRequest, VALID_AUTH);
      expect(result.result.state).toBe(-2);
      expect(prisma.paymentWebhookDelivery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "FAILED" }),
        }),
      );
    });

    it("returns error for unknown transaction", async () => {
      const rpcRequest = {
        jsonrpc: "2.0" as const,
        id: 4,
        method: "CancelTransaction",
        params: { id: "trans_unknown", reason: 1 },
      };

      const result = await controller.handleWebhook(rpcRequest, VALID_AUTH);
      expect(result.error?.code).toBe(-31003);
    });
  });

  describe("unknown method", () => {
    it("returns method-not-found error", async () => {
      const rpcRequest = {
        jsonrpc: "2.0" as const,
        id: 5,
        method: "UnknownMethod",
        params: {},
      };

      const result = await controller.handleWebhook(rpcRequest, VALID_AUTH);
      expect(result.error?.code).toBe(-32601);
    });
  });

  describe("JSON-RPC response format", () => {
    it("always includes jsonrpc version and request id", async () => {
      const rpcRequest = {
        jsonrpc: "2.0" as const,
        id: 42,
        method: "CheckPerformTransaction",
        params: { account: { order_id: "org-1" }, amount: 1490000 },
      };

      const result = await controller.handleWebhook(rpcRequest, VALID_AUTH);
      expect(result.jsonrpc).toBe("2.0");
      expect(result.id).toBe(42);
    });
  });
});
