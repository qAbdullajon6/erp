import { UnauthorizedException } from "@nestjs/common";
import { AuditService } from "../../audit/audit.service";
import { PrismaService } from "../../prisma/prisma.service";
import { SubscriptionLifecycleService } from "../subscription-lifecycle.service";
import type {
  PaymeCheckPerformParams,
  PaymeCreateTransactionResult,
  PaymePerformTransactionResult,
  PaymeRpcErrorResponse,
  PaymeRpcRequest,
  PaymeRpcResponseBody,
  PaymeRpcSuccessResponse,
} from "../types/payme-webhook.types";
import { asDependency, firstMockArg } from "../test-support/billing-spec.helpers";
import { PaymeWebhookController } from "./payme-webhook.controller";

const MERCHANT_ID = "test_merchant_id";
const SECRET_KEY = "test_secret_key";
const VALID_AUTH = `Basic ${Buffer.from(`${MERCHANT_ID}:${SECRET_KEY}`).toString("base64")}`;

function makePrisma(opts: { existingDelivery?: unknown; subscription?: unknown } = {}) {
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
        "subscription" in opts
          ? opts.subscription
          : { id: "sub-1", organizationId: "org-1", plan: { price: 14900 } },
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

function isPaymeSuccess(response: PaymeRpcResponseBody): response is PaymeRpcSuccessResponse {
  return "result" in response;
}

function isPaymeError(response: PaymeRpcResponseBody): response is PaymeRpcErrorResponse {
  return "error" in response;
}

function authRpcRequest(): PaymeRpcRequest {
  return {
    jsonrpc: "2.0",
    id: 1,
    method: "CheckPerformTransaction",
    params: { amount: 0 } satisfies PaymeCheckPerformParams,
  };
}

describe("PaymeWebhookController", () => {
  let controller: PaymeWebhookController;
  let prisma: ReturnType<typeof makePrisma>;
  let lifecycle: ReturnType<typeof makeLifecycle>;
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, PAYME_MERCHANT_ID: MERCHANT_ID, PAYME_SECRET_KEY: SECRET_KEY };
    prisma = makePrisma();
    lifecycle = makeLifecycle();
    controller = new PaymeWebhookController(
      asDependency<PrismaService>(prisma),
      asDependency<AuditService>(makeAuditService()),
      asDependency<SubscriptionLifecycleService>(lifecycle),
    );
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
      expect(isPaymeError(result)).toBe(false);
    });

    it("rejects missing authorization header", async () => {
      await expect(controller.handleWebhook(authRpcRequest(), "")).rejects.toThrow(UnauthorizedException);
    });

    it("rejects invalid credentials", async () => {
      const invalidAuth = `Basic ${Buffer.from("wrong:creds").toString("base64")}`;
      await expect(controller.handleWebhook(authRpcRequest(), invalidAuth)).rejects.toThrow(UnauthorizedException);
    });

    it("rejects non-Basic auth scheme", async () => {
      await expect(controller.handleWebhook(authRpcRequest(), "Bearer token123")).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("rejects when PAYME credentials not configured", async () => {
      delete process.env.PAYME_MERCHANT_ID;
      await expect(controller.handleWebhook(authRpcRequest(), VALID_AUTH)).rejects.toThrow(UnauthorizedException);
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
      expect(isPaymeSuccess(result)).toBe(true);
      if (isPaymeSuccess(result)) {
        expect(result.result).toEqual({ allow: true });
      }
    });

    it("returns error for missing account", async () => {
      const rpcRequest = {
        jsonrpc: "2.0" as const,
        id: 1,
        method: "CheckPerformTransaction",
        params: { amount: 1490000 },
      };

      const result = await controller.handleWebhook(rpcRequest, VALID_AUTH);
      expect(isPaymeError(result)).toBe(true);
      if (isPaymeError(result)) {
        expect(result.error.code).toBe(-31050);
      }
    });

    it("returns error for subscription not found", async () => {
      prisma = makePrisma({ subscription: null });
      controller = new PaymeWebhookController(
        asDependency<PrismaService>(prisma),
        asDependency<AuditService>(makeAuditService()),
        asDependency<SubscriptionLifecycleService>(lifecycle),
      );

      const rpcRequest = {
        jsonrpc: "2.0" as const,
        id: 1,
        method: "CheckPerformTransaction",
        params: { account: { order_id: "org-nonexistent" }, amount: 1490000 },
      };

      const result = await controller.handleWebhook(rpcRequest, VALID_AUTH);
      expect(isPaymeError(result)).toBe(true);
      if (isPaymeError(result)) {
        expect(result.error.code).toBe(-31050);
      }
    });

    it("returns error for amount mismatch", async () => {
      const rpcRequest = {
        jsonrpc: "2.0" as const,
        id: 1,
        method: "CheckPerformTransaction",
        params: { account: { order_id: "org-1" }, amount: 999999 },
      };

      const result = await controller.handleWebhook(rpcRequest, VALID_AUTH);
      expect(isPaymeError(result)).toBe(true);
      if (isPaymeError(result)) {
        expect(result.error.code).toBe(-31001);
      }
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
      expect(isPaymeSuccess(result)).toBe(true);
      if (isPaymeSuccess(result)) {
        const createResult = result.result as PaymeCreateTransactionResult;
        expect(createResult.state).toBe(1);
        expect(createResult.transaction).toBe("delivery-1");
      }
    });

    it("returns existing transaction if already created (idempotency)", async () => {
      prisma = makePrisma({
        existingDelivery: {
          id: "delivery-existing",
          status: "PENDING",
          createdAt: new Date("2026-07-15T10:00:00Z"),
        },
      });
      controller = new PaymeWebhookController(
        asDependency<PrismaService>(prisma),
        asDependency<AuditService>(makeAuditService()),
        asDependency<SubscriptionLifecycleService>(lifecycle),
      );

      const rpcRequest = {
        jsonrpc: "2.0" as const,
        id: 2,
        method: "CreateTransaction",
        params: { id: "trans_123", account: { order_id: "org-1" }, amount: 1490000 },
      };

      const result = await controller.handleWebhook(rpcRequest, VALID_AUTH);
      expect(isPaymeSuccess(result)).toBe(true);
      if (isPaymeSuccess(result)) {
        const createResult = result.result as PaymeCreateTransactionResult;
        expect(createResult.transaction).toBe("delivery-existing");
        expect(createResult.state).toBe(1);
      }
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
      controller = new PaymeWebhookController(
        asDependency<PrismaService>(prisma),
        asDependency<AuditService>(makeAuditService()),
        asDependency<SubscriptionLifecycleService>(lifecycle),
      );

      const rpcRequest = {
        jsonrpc: "2.0" as const,
        id: 3,
        method: "PerformTransaction",
        params: { id: "trans_123" },
      };

      const result = await controller.handleWebhook(rpcRequest, VALID_AUTH);
      expect(isPaymeSuccess(result)).toBe(true);
      if (isPaymeSuccess(result)) {
        expect((result.result as PaymePerformTransactionResult).state).toBe(2);
      }
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
      controller = new PaymeWebhookController(
        asDependency<PrismaService>(prisma),
        asDependency<AuditService>(makeAuditService()),
        asDependency<SubscriptionLifecycleService>(lifecycle),
      );

      const rpcRequest = {
        jsonrpc: "2.0" as const,
        id: 3,
        method: "PerformTransaction",
        params: { id: "trans_123" },
      };

      const result = await controller.handleWebhook(rpcRequest, VALID_AUTH);
      expect(isPaymeSuccess(result)).toBe(true);
      if (isPaymeSuccess(result)) {
        expect((result.result as PaymePerformTransactionResult).state).toBe(2);
      }
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
      expect(isPaymeError(result)).toBe(true);
      if (isPaymeError(result)) {
        expect(result.error.code).toBe(-31003);
      }
    });
  });

  describe("CancelTransaction", () => {
    it("cancels transaction and returns state=-2", async () => {
      prisma = makePrisma({
        existingDelivery: { id: "delivery-1", status: "DELIVERED" },
      });
      controller = new PaymeWebhookController(
        asDependency<PrismaService>(prisma),
        asDependency<AuditService>(makeAuditService()),
        asDependency<SubscriptionLifecycleService>(lifecycle),
      );

      const rpcRequest = {
        jsonrpc: "2.0" as const,
        id: 4,
        method: "CancelTransaction",
        params: { id: "trans_123", reason: 1 },
      };

      const result = await controller.handleWebhook(rpcRequest, VALID_AUTH);
      expect(isPaymeSuccess(result)).toBe(true);
      if (isPaymeSuccess(result)) {
        expect((result.result as { state: number }).state).toBe(-2);
      }
      expect(prisma.paymentWebhookDelivery.update).toHaveBeenCalled();
      const updateCall = firstMockArg<{ data: { status: string } }>(prisma.paymentWebhookDelivery.update);
      expect(updateCall.data.status).toBe("FAILED");
    });

    it("returns error for unknown transaction", async () => {
      const rpcRequest = {
        jsonrpc: "2.0" as const,
        id: 4,
        method: "CancelTransaction",
        params: { id: "trans_unknown", reason: 1 },
      };

      const result = await controller.handleWebhook(rpcRequest, VALID_AUTH);
      expect(isPaymeError(result)).toBe(true);
      if (isPaymeError(result)) {
        expect(result.error.code).toBe(-31003);
      }
    });
  });

  describe("unknown method", () => {
    it("returns method-not-found error", async () => {
      const rpcRequest = {
        jsonrpc: "2.0" as const,
        id: 5,
        method: "UnknownMethod",
        params: { amount: 0 } satisfies PaymeCheckPerformParams,
      };

      const result = await controller.handleWebhook(rpcRequest, VALID_AUTH);
      expect(isPaymeError(result)).toBe(true);
      if (isPaymeError(result)) {
        expect(result.error.code).toBe(-32601);
      }
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
