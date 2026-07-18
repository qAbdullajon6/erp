import { BillingNotificationService } from "./billing-notification.service";

function makePrisma(opts: { existingNotification?: any } = {}) {
  return {
    notification: {
      findFirst: jest.fn().mockResolvedValue(opts.existingNotification ?? null),
      create: jest.fn().mockResolvedValue({ id: "notif-1" }),
    },
  } as any;
}

describe("BillingNotificationService", () => {
  let service: BillingNotificationService;
  let prisma: any;

  beforeEach(() => {
    prisma = makePrisma();
    service = new BillingNotificationService(prisma);
  });

  describe("notifyTrialEnding()", () => {
    it("creates a BILLING notification for trial ending", async () => {
      await service.notifyTrialEnding("org-1", new Date("2026-07-20"));

      expect(prisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: "org-1",
            type: "TRIAL_ENDING",
            category: "BILLING",
          }),
        }),
      );
    });

    it("skips duplicate notification (idempotency)", async () => {
      prisma = makePrisma({ existingNotification: { id: "existing-notif" } });
      service = new BillingNotificationService(prisma);

      await service.notifyTrialEnding("org-1", new Date("2026-07-20"));
      expect(prisma.notification.create).not.toHaveBeenCalled();
    });
  });

  describe("notifyPaymentSucceeded()", () => {
    it("creates a low-severity payment success notification", async () => {
      await service.notifyPaymentSucceeded("org-1", "sub-1", 14900);

      expect(prisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: "org-1",
            type: "PAYMENT_SUCCEEDED",
            category: "BILLING",
            severity: "LOW",
          }),
        }),
      );
    });
  });

  describe("notifyPaymentFailed()", () => {
    it("creates a critical-severity payment failure notification with reason", async () => {
      await service.notifyPaymentFailed("org-1", "sub-1", "Card declined");

      expect(prisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: "org-1",
            type: "PAYMENT_FAILED",
            category: "BILLING",
            severity: "CRITICAL",
          }),
        }),
      );
    });
  });

  describe("notifySubscriptionExpired()", () => {
    it("creates a high-severity expiration notification", async () => {
      await service.notifySubscriptionExpired("org-1", "sub-1");

      expect(prisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: "SUBSCRIPTION_EXPIRED",
            category: "BILLING",
            severity: "HIGH",
          }),
        }),
      );
    });
  });

  describe("notifySubscriptionSuspended()", () => {
    it("creates a critical-severity suspension notification", async () => {
      await service.notifySubscriptionSuspended("org-1", "sub-1", "payment_failed");

      expect(prisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: "SUBSCRIPTION_SUSPENDED",
            category: "BILLING",
            severity: "CRITICAL",
          }),
        }),
      );
    });
  });

  describe("notifySeatLimitReached()", () => {
    it("creates a seat limit notification", async () => {
      await service.notifySeatLimitReached("org-1", 10, 10);

      expect(prisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: "SEAT_LIMIT_REACHED",
            category: "BILLING",
          }),
        }),
      );
    });
  });

  describe("notifyUsageExceeded()", () => {
    it("creates a usage exceeded notification with metric metadata", async () => {
      await service.notifyUsageExceeded("org-1", "API_REQUESTS", 10000, 10000);

      expect(prisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: "USAGE_EXCEEDED",
            category: "BILLING",
            severity: "HIGH",
          }),
        }),
      );
    });
  });

  describe("notifyAiCreditsLow()", () => {
    it("creates an AI credits low notification", async () => {
      await service.notifyAiCreditsLow("org-1", 50, 1000);

      expect(prisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: "AI_CREDITS_LOW",
            category: "BILLING",
          }),
        }),
      );
    });
  });

  describe("org isolation", () => {
    it("always scopes the notification to the given organization", async () => {
      await service.notifyTrialEnding("org-scoped-123", new Date("2026-07-20"));

      const createCall = prisma.notification.create.mock.calls[0][0];
      expect(createCall.data.organizationId).toBe("org-scoped-123");
    });
  });
});
