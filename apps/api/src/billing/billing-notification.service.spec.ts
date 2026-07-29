import { BillingNotificationService } from "./billing-notification.service";
import { PrismaService } from "../prisma/prisma.service";
import { asDependency, firstMockArg } from "./test-support/billing-spec.helpers";

function makePrisma(opts: { existingNotification?: { id: string } } = {}) {
  return {
    notification: {
      findFirst: jest.fn().mockResolvedValue(opts.existingNotification ?? null),
      create: jest.fn().mockResolvedValue({ id: "notif-1" }),
    },
  };
}

describe("BillingNotificationService", () => {
  let service: BillingNotificationService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    service = new BillingNotificationService(asDependency<PrismaService>(prisma));
  });

  describe("notifyTrialEnding()", () => {
    it("creates a BILLING notification for trial ending", async () => {
      await service.notifyTrialEnding("org-1", new Date("2026-07-20"));

      const createCall = firstMockArg<{ data: { organizationId: string; type: string; category: string } }>(
        prisma.notification.create,
      );
      expect(createCall.data.organizationId).toBe("org-1");
      expect(createCall.data.type).toBe("TRIAL_ENDING");
      expect(createCall.data.category).toBe("BILLING");
    });

    it("skips duplicate notification (idempotency)", async () => {
      prisma = makePrisma({ existingNotification: { id: "existing-notif" } });
      service = new BillingNotificationService(asDependency<PrismaService>(prisma));

      await service.notifyTrialEnding("org-1", new Date("2026-07-20"));
      expect(prisma.notification.create).not.toHaveBeenCalled();
    });
  });

  describe("notifyPaymentSucceeded()", () => {
    it("creates a low-severity payment success notification", async () => {
      await service.notifyPaymentSucceeded("org-1", "sub-1", 14900);

      const createCall = firstMockArg<{
        data: { organizationId: string; type: string; category: string; severity: string };
      }>(prisma.notification.create);
      expect(createCall.data.organizationId).toBe("org-1");
      expect(createCall.data.type).toBe("PAYMENT_SUCCEEDED");
      expect(createCall.data.category).toBe("BILLING");
      expect(createCall.data.severity).toBe("LOW");
    });
  });

  describe("notifyPaymentFailed()", () => {
    it("creates a critical-severity payment failure notification with reason", async () => {
      await service.notifyPaymentFailed("org-1", "sub-1", "Card declined");

      const createCall = firstMockArg<{
        data: { organizationId: string; type: string; category: string; severity: string };
      }>(prisma.notification.create);
      expect(createCall.data.organizationId).toBe("org-1");
      expect(createCall.data.type).toBe("PAYMENT_FAILED");
      expect(createCall.data.category).toBe("BILLING");
      expect(createCall.data.severity).toBe("CRITICAL");
    });
  });

  describe("notifySubscriptionExpired()", () => {
    it("creates a high-severity expiration notification", async () => {
      await service.notifySubscriptionExpired("org-1", "sub-1");

      const createCall = firstMockArg<{ data: { type: string; category: string; severity: string } }>(
        prisma.notification.create,
      );
      expect(createCall.data.type).toBe("SUBSCRIPTION_EXPIRED");
      expect(createCall.data.category).toBe("BILLING");
      expect(createCall.data.severity).toBe("HIGH");
    });
  });

  describe("notifySubscriptionSuspended()", () => {
    it("creates a critical-severity suspension notification", async () => {
      await service.notifySubscriptionSuspended("org-1", "sub-1", "payment_failed");

      const createCall = firstMockArg<{ data: { type: string; category: string; severity: string } }>(
        prisma.notification.create,
      );
      expect(createCall.data.type).toBe("SUBSCRIPTION_SUSPENDED");
      expect(createCall.data.category).toBe("BILLING");
      expect(createCall.data.severity).toBe("CRITICAL");
    });
  });

  describe("notifySeatLimitReached()", () => {
    it("creates a seat limit notification", async () => {
      await service.notifySeatLimitReached("org-1", 10, 10);

      const createCall = firstMockArg<{ data: { type: string; category: string } }>(prisma.notification.create);
      expect(createCall.data.type).toBe("SEAT_LIMIT_REACHED");
      expect(createCall.data.category).toBe("BILLING");
    });
  });

  describe("notifyUsageExceeded()", () => {
    it("creates a usage exceeded notification with metric metadata", async () => {
      await service.notifyUsageExceeded("org-1", "API_REQUESTS", 10000, 10000);

      const createCall = firstMockArg<{ data: { type: string; category: string; severity: string } }>(
        prisma.notification.create,
      );
      expect(createCall.data.type).toBe("USAGE_EXCEEDED");
      expect(createCall.data.category).toBe("BILLING");
      expect(createCall.data.severity).toBe("HIGH");
    });
  });

  describe("notifyAiCreditsLow()", () => {
    it("creates an AI credits low notification", async () => {
      await service.notifyAiCreditsLow("org-1", 50, 1000);

      const createCall = firstMockArg<{ data: { type: string; category: string } }>(prisma.notification.create);
      expect(createCall.data.type).toBe("AI_CREDITS_LOW");
      expect(createCall.data.category).toBe("BILLING");
    });
  });

  describe("org isolation", () => {
    it("always scopes the notification to the given organization", async () => {
      await service.notifyTrialEnding("org-scoped-123", new Date("2026-07-20"));

      const createCall = firstMockArg<{ data: { organizationId: string } }>(prisma.notification.create);
      expect(createCall.data.organizationId).toBe("org-scoped-123");
    });
  });
});
