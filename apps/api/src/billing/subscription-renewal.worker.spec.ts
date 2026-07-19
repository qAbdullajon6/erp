import { SubscriptionRenewalWorker } from "./subscription-renewal.worker";

const NOW = new Date("2026-07-15T00:00:00Z");

function makeSubscription(overrides: Partial<any> = {}) {
  return {
    id: "sub-1",
    organizationId: "org-1",
    planId: "plan-pro",
    status: "ACTIVE",
    autoRenew: true,
    paymentCustomerId: "cus_123",
    currentPeriodEnd: new Date("2026-07-10T00:00:00Z"),
    trialEndsAt: null,
    cancelAt: null,
    plan: { name: "Professional", price: 14900 },
    ...overrides,
  };
}

function makePrisma({
  trialExpired = [] as any[],
  dueForRenewal = [] as any[],
  gracePeriodExpired = [] as any[],
  scheduledCancellations = [] as any[],
} = {}) {
  return {
    organizationSubscription: {
      findMany: jest.fn().mockImplementation(({ where }) => {
        if (where.status === "TRIAL") return Promise.resolve(trialExpired);
        if (where.status === "ACTIVE" && where.autoRenew) return Promise.resolve(dueForRenewal);
        if (where.status === "SUSPENDED") return Promise.resolve(gracePeriodExpired);
        if (where.cancelAt) return Promise.resolve(scheduledCancellations);
        return Promise.resolve([]);
      }),
    },
  } as any;
}

function makeLifecycle() {
  return {
    renewSubscription: jest.fn().mockResolvedValue({}),
    suspendSubscription: jest.fn().mockResolvedValue({}),
    expireSubscription: jest.fn().mockResolvedValue({}),
    cancelSubscription: jest.fn().mockResolvedValue({}),
  } as any;
}

function makeAuditService() {
  return { log: jest.fn().mockResolvedValue(undefined) } as any;
}

describe("SubscriptionRenewalWorker", () => {
  let worker: SubscriptionRenewalWorker;
  let prisma: any;
  let lifecycle: any;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
    prisma = makePrisma();
    lifecycle = makeLifecycle();
    worker = new SubscriptionRenewalWorker(prisma, lifecycle, makeAuditService());
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("trial expiration", () => {
    it("renews subscription when trial ends with payment method and autoRenew", async () => {
      const sub = makeSubscription({ status: "TRIAL", trialEndsAt: new Date("2026-07-14"), autoRenew: true, paymentCustomerId: "cus_123" });
      prisma = makePrisma({ trialExpired: [sub] });
      worker = new SubscriptionRenewalWorker(prisma, lifecycle, makeAuditService());

      await worker.handleSubscriptionRenewals();

      expect(lifecycle.renewSubscription).toHaveBeenCalledWith("org-1");
    });

    it("suspends subscription when trial ends without payment method", async () => {
      const sub = makeSubscription({ status: "TRIAL", trialEndsAt: new Date("2026-07-14"), autoRenew: false, paymentCustomerId: null });
      prisma = makePrisma({ trialExpired: [sub] });
      worker = new SubscriptionRenewalWorker(prisma, lifecycle, makeAuditService());

      await worker.handleSubscriptionRenewals();

      expect(lifecycle.suspendSubscription).toHaveBeenCalledWith("org-1", "trial_ended_no_payment");
    });
  });

  describe("automatic renewal", () => {
    it("renews subscriptions with expired period and autoRenew=true", async () => {
      const sub = makeSubscription({ status: "ACTIVE", autoRenew: true, currentPeriodEnd: new Date("2026-07-14") });
      prisma = makePrisma({ dueForRenewal: [sub] });
      worker = new SubscriptionRenewalWorker(prisma, lifecycle, makeAuditService());

      await worker.handleSubscriptionRenewals();

      expect(lifecycle.renewSubscription).toHaveBeenCalledWith("org-1");
    });

    it("continues processing other subscriptions when one fails", async () => {
      const sub1 = makeSubscription({ organizationId: "org-1" });
      const sub2 = makeSubscription({ organizationId: "org-2" });
      prisma = makePrisma({ dueForRenewal: [sub1, sub2] });
      lifecycle = makeLifecycle();
      lifecycle.renewSubscription
        .mockRejectedValueOnce(new Error("Payment failed"))
        .mockResolvedValueOnce({});
      worker = new SubscriptionRenewalWorker(prisma, lifecycle, makeAuditService());

      await worker.handleSubscriptionRenewals();

      expect(lifecycle.renewSubscription).toHaveBeenCalledTimes(2);
    });
  });

  describe("grace period expiration", () => {
    it("expires SUSPENDED subscriptions after 7-day grace period", async () => {
      const sub = makeSubscription({
        status: "SUSPENDED",
        currentPeriodEnd: new Date("2026-07-01"), // 14 days ago, past 7-day grace
      });
      prisma = makePrisma({ gracePeriodExpired: [sub] });
      worker = new SubscriptionRenewalWorker(prisma, lifecycle, makeAuditService());

      await worker.handleSubscriptionRenewals();

      expect(lifecycle.expireSubscription).toHaveBeenCalledWith("org-1");
    });
  });

  describe("scheduled cancellations", () => {
    it("cancels subscriptions where cancelAt has passed", async () => {
      const sub = makeSubscription({ cancelAt: new Date("2026-07-14"), status: "ACTIVE" });
      prisma = makePrisma({ scheduledCancellations: [sub] });
      worker = new SubscriptionRenewalWorker(prisma, lifecycle, makeAuditService());

      await worker.handleSubscriptionRenewals();

      expect(lifecycle.cancelSubscription).toHaveBeenCalledWith(
        "org-1",
        null,
        expect.objectContaining({ immediate: true, reason: "scheduled_cancellation" }),
      );
    });
  });

  describe("error isolation", () => {
    it("does not throw when individual subscription processing fails", async () => {
      const sub = makeSubscription({ status: "TRIAL", trialEndsAt: new Date("2026-07-14"), autoRenew: true, paymentCustomerId: "cus_123" });
      prisma = makePrisma({ trialExpired: [sub] });
      lifecycle.renewSubscription.mockRejectedValue(new Error("API error"));
      worker = new SubscriptionRenewalWorker(prisma, lifecycle, makeAuditService());

      await expect(worker.handleSubscriptionRenewals()).resolves.not.toThrow();
    });
  });
});
