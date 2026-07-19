import { ConflictException, NotFoundException } from "@nestjs/common";
import { SubscriptionLifecycleService } from "./subscription-lifecycle.service";

const NOW = new Date("2026-07-15T00:00:00Z");
const PERIOD_END = new Date("2026-08-15T00:00:00Z");

const MOCK_SUBSCRIPTION = {
  id: "sub-1",
  organizationId: "org-1",
  planId: "plan-pro",
  status: "ACTIVE",
  seats: 10,
  currentPeriodStart: NOW,
  currentPeriodEnd: PERIOD_END,
  trialEndsAt: null,
  cancelAt: null,
  cancelledAt: null,
  cancellationReason: null,
  autoRenew: true,
  paymentCustomerId: "cus_stripe_123",
  metadata: null,
  plan: { id: "plan-pro", name: "Professional", slug: "professional", price: 14900 },
};

const ACTOR = { userId: "user-1", organizationId: "org-1", email: "admin@test.com", role: "ADMIN", membershipId: "m1", isPlatformAdmin: false };

function makePrisma(subscriptionOverride?: Partial<any> | null) {
  const sub = subscriptionOverride === null ? null : { ...MOCK_SUBSCRIPTION, ...subscriptionOverride };
  return {
    organizationSubscription: {
      findUnique: jest.fn().mockResolvedValue(sub),
      create: jest.fn().mockImplementation(({ data, include }) =>
        Promise.resolve({ ...data, id: "sub-new", plan: { name: "Professional", slug: "professional" } }),
      ),
      update: jest.fn().mockImplementation(({ data, include }) =>
        Promise.resolve({ ...sub, ...data, plan: sub?.plan }),
      ),
    },
    subscriptionHistory: {
      create: jest.fn().mockResolvedValue({}),
    },
  } as any;
}

function makeAuditService() {
  return { log: jest.fn().mockResolvedValue(undefined) } as any;
}

function makePlanService() {
  return {
    getPlanById: jest.fn().mockImplementation((id) => {
      if (id === "plan-pro") return Promise.resolve({ id: "plan-pro", name: "Professional", slug: "professional", price: 14900, features: {} });
      if (id === "plan-enterprise") return Promise.resolve({ id: "plan-enterprise", name: "Enterprise", slug: "enterprise", price: 49900, features: {} });
      if (id === "plan-starter") return Promise.resolve({ id: "plan-starter", name: "Starter", slug: "starter", price: 4900, features: {} });
      if (id === "plan-free") return Promise.resolve({ id: "plan-free", name: "Free", slug: "free", price: 0, features: {} });
      throw new NotFoundException(`Plan ${id} not found`);
    }),
    isUpgrade: jest.fn().mockImplementation((a, b) => b.price > a.price),
    isDowngrade: jest.fn().mockImplementation((a, b) => b.price < a.price),
  } as any;
}

function makeFeatureGate() {
  return { clearCache: jest.fn() } as any;
}

describe("SubscriptionLifecycleService", () => {
  let service: SubscriptionLifecycleService;
  let prisma: any;
  let auditService: any;
  let planService: any;
  let featureGate: any;

  beforeEach(() => {
    prisma = makePrisma();
    auditService = makeAuditService();
    planService = makePlanService();
    featureGate = makeFeatureGate();
    service = new SubscriptionLifecycleService(prisma, auditService, planService, featureGate);
  });

  describe("createSubscription()", () => {
    it("creates ACTIVE subscription without trial", async () => {
      prisma.organizationSubscription.findUnique.mockResolvedValue(null);

      const result = await service.createSubscription("org-1", "plan-pro", { actor: ACTOR as any });

      expect(prisma.organizationSubscription.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: "org-1",
            planId: "plan-pro",
            status: "ACTIVE",
          }),
        }),
      );
    });

    it("creates TRIAL subscription with trial days", async () => {
      prisma.organizationSubscription.findUnique.mockResolvedValue(null);

      await service.createSubscription("org-1", "plan-pro", { trialDays: 14, actor: ACTOR as any });

      expect(prisma.organizationSubscription.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "TRIAL",
            trialEndsAt: expect.any(Date),
          }),
        }),
      );
    });

    it("throws ConflictException if subscription already exists", async () => {
      await expect(
        service.createSubscription("org-1", "plan-pro", { actor: ACTOR as any }),
      ).rejects.toThrow(ConflictException);
    });

    it("clears feature gate cache after creation", async () => {
      prisma.organizationSubscription.findUnique.mockResolvedValue(null);
      await service.createSubscription("org-1", "plan-pro", { actor: ACTOR as any });
      expect(featureGate.clearCache).toHaveBeenCalledWith("org-1");
    });

    it("records subscription history", async () => {
      prisma.organizationSubscription.findUnique.mockResolvedValue(null);
      await service.createSubscription("org-1", "plan-pro", { actor: ACTOR as any });
      expect(prisma.subscriptionHistory.create).toHaveBeenCalled();
    });
  });

  describe("upgradeSubscription()", () => {
    it("upgrades to higher-tier plan", async () => {
      await service.upgradeSubscription("org-1", "plan-enterprise", ACTOR as any);

      expect(prisma.organizationSubscription.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            planId: "plan-enterprise",
            status: "ACTIVE",
          }),
        }),
      );
    });

    it("throws ConflictException if target is not an upgrade", async () => {
      await expect(
        service.upgradeSubscription("org-1", "plan-starter", ACTOR as any),
      ).rejects.toThrow(ConflictException);
    });

    it("clears feature gate cache after upgrade", async () => {
      await service.upgradeSubscription("org-1", "plan-enterprise", ACTOR as any);
      expect(featureGate.clearCache).toHaveBeenCalledWith("org-1");
    });

    it("records audit log", async () => {
      await service.upgradeSubscription("org-1", "plan-enterprise", ACTOR as any);
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: "subscription.upgraded" }),
      );
    });
  });

  describe("downgradeSubscription()", () => {
    it("applies immediate downgrade when opts.immediate=true", async () => {
      await service.downgradeSubscription("org-1", "plan-starter", ACTOR as any, { immediate: true });

      expect(prisma.organizationSubscription.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ planId: "plan-starter" }),
        }),
      );
    });

    it("schedules downgrade at period end when immediate=false", async () => {
      await service.downgradeSubscription("org-1", "plan-starter", ACTOR as any);

      expect(prisma.organizationSubscription.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            metadata: expect.objectContaining({
              scheduledDowngrade: expect.objectContaining({ planId: "plan-starter" }),
            }),
          }),
        }),
      );
    });

    it("throws ConflictException if target is not a downgrade", async () => {
      await expect(
        service.downgradeSubscription("org-1", "plan-enterprise", ACTOR as any),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe("cancelSubscription()", () => {
    it("cancels immediately with status=CANCELLED", async () => {
      await service.cancelSubscription("org-1", ACTOR as any, { immediate: true, reason: "user_request" });

      expect(prisma.organizationSubscription.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "CANCELLED",
            cancelledAt: expect.any(Date),
            cancellationReason: "user_request",
            autoRenew: false,
          }),
        }),
      );
    });

    it("schedules cancellation at period end (default)", async () => {
      await service.cancelSubscription("org-1", ACTOR as any);

      expect(prisma.organizationSubscription.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            cancelAt: PERIOD_END,
            autoRenew: false,
          }),
        }),
      );
    });

    it("is idempotent for already-cancelled subscriptions", async () => {
      prisma = makePrisma({ status: "CANCELLED" });
      service = new SubscriptionLifecycleService(prisma, auditService, planService, featureGate);

      const result = await service.cancelSubscription("org-1", ACTOR as any, { immediate: true });
      expect(prisma.organizationSubscription.update).not.toHaveBeenCalled();
    });
  });

  describe("renewSubscription()", () => {
    it("extends period by 30 days on standard renewal", async () => {
      await service.renewSubscription("org-1");

      expect(prisma.organizationSubscription.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            currentPeriodStart: PERIOD_END,
            status: "ACTIVE",
          }),
        }),
      );
    });

    it("applies scheduled downgrade during renewal", async () => {
      prisma = makePrisma({ metadata: { scheduledDowngrade: { planId: "plan-starter" } } });
      service = new SubscriptionLifecycleService(prisma, auditService, planService, featureGate);

      await service.renewSubscription("org-1");

      expect(prisma.organizationSubscription.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            planId: "plan-starter",
            currentPeriodStart: PERIOD_END,
          }),
        }),
      );
    });

    it("clears TRIAL status on renewal", async () => {
      prisma = makePrisma({ status: "TRIAL" });
      service = new SubscriptionLifecycleService(prisma, auditService, planService, featureGate);

      await service.renewSubscription("org-1");

      expect(prisma.organizationSubscription.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "ACTIVE", trialEndsAt: null }),
        }),
      );
    });
  });

  describe("reactivateSubscription()", () => {
    it("clears cancellation schedule", async () => {
      prisma = makePrisma({ cancelAt: PERIOD_END });
      service = new SubscriptionLifecycleService(prisma, auditService, planService, featureGate);

      await service.reactivateSubscription("org-1", ACTOR as any);

      expect(prisma.organizationSubscription.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            cancelAt: null,
            cancellationReason: null,
            autoRenew: true,
          }),
        }),
      );
    });

    it("throws if subscription is already CANCELLED (not just scheduled)", async () => {
      prisma = makePrisma({ status: "CANCELLED" });
      service = new SubscriptionLifecycleService(prisma, auditService, planService, featureGate);

      await expect(service.reactivateSubscription("org-1", ACTOR as any)).rejects.toThrow(
        ConflictException,
      );
    });

    it("throws if subscription is not scheduled for cancellation", async () => {
      await expect(service.reactivateSubscription("org-1", ACTOR as any)).rejects.toThrow(
        ConflictException,
      );
    });
  });
});
