import { ConflictException, NotFoundException } from "@nestjs/common";
import type { CurrentUserPayload } from "../auth/interfaces/current-user.interface";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { FeatureGateService } from "./feature-gate.service";
import { SubscriptionLifecycleService } from "./subscription-lifecycle.service";
import { SubscriptionPlanService } from "./subscription-plan.service";
import { asDependency, firstMockArg } from "./test-support/billing-spec.helpers";

const NOW = new Date("2026-07-15T00:00:00Z");
const PERIOD_END = new Date("2026-08-15T00:00:00Z");

interface MockSubscription {
  id: string;
  organizationId: string;
  planId: string;
  status: string;
  seats: number;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  trialEndsAt: Date | null;
  cancelAt: Date | null;
  cancelledAt: Date | null;
  cancellationReason: string | null;
  autoRenew: boolean;
  paymentCustomerId: string;
  metadata: unknown;
  plan: { id: string; name: string; slug: string; price: number };
}

const MOCK_SUBSCRIPTION: MockSubscription = {
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

const ACTOR: CurrentUserPayload = {
  userId: "user-1",
  organizationId: "org-1",
  email: "admin@test.com",
  role: "ADMIN",
  membershipId: "m1",
  isPlatformAdmin: false,
};

function makePrisma(subscriptionOverride?: Partial<MockSubscription> | null) {
  const sub = subscriptionOverride === null ? null : { ...MOCK_SUBSCRIPTION, ...subscriptionOverride };
  return {
    organizationSubscription: {
      findUnique: jest.fn().mockResolvedValue(sub),
      create: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({ ...data, id: "sub-new", plan: { name: "Professional", slug: "professional" } }),
      ),
      update: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({ ...sub, ...data, plan: sub?.plan }),
      ),
    },
    subscriptionHistory: {
      create: jest.fn().mockResolvedValue({}),
    },
  };
}

function makeAuditService() {
  return { log: jest.fn().mockResolvedValue(undefined) };
}

function makePlanService() {
  return {
    getPlanById: jest.fn().mockImplementation((id: string) => {
      if (id === "plan-pro") {
        return Promise.resolve({
          id: "plan-pro",
          name: "Professional",
          slug: "professional",
          price: 14900,
          features: {},
        });
      }
      if (id === "plan-enterprise") {
        return Promise.resolve({
          id: "plan-enterprise",
          name: "Enterprise",
          slug: "enterprise",
          price: 49900,
          features: {},
        });
      }
      if (id === "plan-starter") {
        return Promise.resolve({
          id: "plan-starter",
          name: "Starter",
          slug: "starter",
          price: 4900,
          features: {},
        });
      }
      if (id === "plan-free") {
        return Promise.resolve({ id: "plan-free", name: "Free", slug: "free", price: 0, features: {} });
      }
      throw new NotFoundException(`Plan ${id} not found`);
    }),
    isUpgrade: jest.fn().mockImplementation((a: { price: number }, b: { price: number }) => b.price > a.price),
    isDowngrade: jest.fn().mockImplementation((a: { price: number }, b: { price: number }) => b.price < a.price),
  };
}

function makeFeatureGate() {
  return { clearCache: jest.fn() };
}

describe("SubscriptionLifecycleService", () => {
  let service: SubscriptionLifecycleService;
  let prisma: ReturnType<typeof makePrisma>;
  let auditService: ReturnType<typeof makeAuditService>;
  let planService: ReturnType<typeof makePlanService>;
  let featureGate: ReturnType<typeof makeFeatureGate>;

  beforeEach(() => {
    prisma = makePrisma();
    auditService = makeAuditService();
    planService = makePlanService();
    featureGate = makeFeatureGate();
    service = new SubscriptionLifecycleService(
      asDependency<PrismaService>(prisma),
      asDependency<AuditService>(auditService),
      asDependency<SubscriptionPlanService>(planService),
      asDependency<FeatureGateService>(featureGate),
    );
  });

  describe("createSubscription()", () => {
    it("creates ACTIVE subscription without trial", async () => {
      prisma.organizationSubscription.findUnique.mockResolvedValue(null);

      await service.createSubscription("org-1", "plan-pro", { actor: ACTOR });

      const createArgs = firstMockArg<{ data: { organizationId: string; planId: string; status: string } }>(
        prisma.organizationSubscription.create,
      );
      expect(createArgs.data.organizationId).toBe("org-1");
      expect(createArgs.data.planId).toBe("plan-pro");
      expect(createArgs.data.status).toBe("ACTIVE");
    });

    it("creates TRIAL subscription with trial days", async () => {
      prisma.organizationSubscription.findUnique.mockResolvedValue(null);

      await service.createSubscription("org-1", "plan-pro", { trialDays: 14, actor: ACTOR });

      const createArgs = firstMockArg<{ data: { status: string; trialEndsAt: Date } }>(
        prisma.organizationSubscription.create,
      );
      expect(createArgs.data.status).toBe("TRIAL");
      expect(createArgs.data.trialEndsAt).toBeInstanceOf(Date);
    });

    it("throws ConflictException if subscription already exists", async () => {
      await expect(service.createSubscription("org-1", "plan-pro", { actor: ACTOR })).rejects.toThrow(
        ConflictException,
      );
    });

    it("clears feature gate cache after creation", async () => {
      prisma.organizationSubscription.findUnique.mockResolvedValue(null);
      await service.createSubscription("org-1", "plan-pro", { actor: ACTOR });
      expect(featureGate.clearCache).toHaveBeenCalledWith("org-1");
    });

    it("records subscription history", async () => {
      prisma.organizationSubscription.findUnique.mockResolvedValue(null);
      await service.createSubscription("org-1", "plan-pro", { actor: ACTOR });
      expect(prisma.subscriptionHistory.create).toHaveBeenCalled();
    });
  });

  describe("upgradeSubscription()", () => {
    it("upgrades to higher-tier plan", async () => {
      await service.upgradeSubscription("org-1", "plan-enterprise", ACTOR);

      const updateArgs = firstMockArg<{ data: { planId: string; status: string } }>(
        prisma.organizationSubscription.update,
      );
      expect(updateArgs.data.planId).toBe("plan-enterprise");
      expect(updateArgs.data.status).toBe("ACTIVE");
    });

    it("throws ConflictException if target is not an upgrade", async () => {
      await expect(service.upgradeSubscription("org-1", "plan-starter", ACTOR)).rejects.toThrow(
        ConflictException,
      );
    });

    it("clears feature gate cache after upgrade", async () => {
      await service.upgradeSubscription("org-1", "plan-enterprise", ACTOR);
      expect(featureGate.clearCache).toHaveBeenCalledWith("org-1");
    });

    it("records audit log", async () => {
      await service.upgradeSubscription("org-1", "plan-enterprise", ACTOR);
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: "subscription.upgraded" }),
      );
    });
  });

  describe("downgradeSubscription()", () => {
    it("applies immediate downgrade when opts.immediate=true", async () => {
      await service.downgradeSubscription("org-1", "plan-starter", ACTOR, { immediate: true });

      const updateArgs = firstMockArg<{ data: { planId: string } }>(prisma.organizationSubscription.update);
      expect(updateArgs.data.planId).toBe("plan-starter");
    });

    it("schedules downgrade at period end when immediate=false", async () => {
      await service.downgradeSubscription("org-1", "plan-starter", ACTOR);

      const updateArgs = firstMockArg<{ data: { metadata: { scheduledDowngrade: { planId: string } } } }>(
        prisma.organizationSubscription.update,
      );
      expect(updateArgs.data.metadata.scheduledDowngrade.planId).toBe("plan-starter");
    });

    it("throws ConflictException if target is not a downgrade", async () => {
      await expect(service.downgradeSubscription("org-1", "plan-enterprise", ACTOR)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe("cancelSubscription()", () => {
    it("cancels immediately with status=CANCELLED", async () => {
      await service.cancelSubscription("org-1", ACTOR, { immediate: true, reason: "user_request" });

      const updateArgs = firstMockArg<{
        data: {
          status: string;
          cancelledAt: Date;
          cancellationReason: string;
          autoRenew: boolean;
        };
      }>(prisma.organizationSubscription.update);
      expect(updateArgs.data.status).toBe("CANCELLED");
      expect(updateArgs.data.cancelledAt).toBeInstanceOf(Date);
      expect(updateArgs.data.cancellationReason).toBe("user_request");
      expect(updateArgs.data.autoRenew).toBe(false);
    });

    it("schedules cancellation at period end (default)", async () => {
      await service.cancelSubscription("org-1", ACTOR);

      const updateArgs = firstMockArg<{ data: { cancelAt: Date; autoRenew: boolean } }>(
        prisma.organizationSubscription.update,
      );
      expect(updateArgs.data.cancelAt).toEqual(PERIOD_END);
      expect(updateArgs.data.autoRenew).toBe(false);
    });

    it("is idempotent for already-cancelled subscriptions", async () => {
      prisma = makePrisma({ status: "CANCELLED" });
      service = new SubscriptionLifecycleService(
        asDependency<PrismaService>(prisma),
        asDependency<AuditService>(auditService),
        asDependency<SubscriptionPlanService>(planService),
        asDependency<FeatureGateService>(featureGate),
      );

      await service.cancelSubscription("org-1", ACTOR, { immediate: true });
      expect(prisma.organizationSubscription.update).not.toHaveBeenCalled();
    });
  });

  describe("renewSubscription()", () => {
    it("extends period by 30 days on standard renewal", async () => {
      await service.renewSubscription("org-1");

      const updateArgs = firstMockArg<{ data: { currentPeriodStart: Date; status: string } }>(
        prisma.organizationSubscription.update,
      );
      expect(updateArgs.data.currentPeriodStart).toEqual(PERIOD_END);
      expect(updateArgs.data.status).toBe("ACTIVE");
    });

    it("applies scheduled downgrade during renewal", async () => {
      prisma = makePrisma({ metadata: { scheduledDowngrade: { planId: "plan-starter" } } });
      service = new SubscriptionLifecycleService(
        asDependency<PrismaService>(prisma),
        asDependency<AuditService>(auditService),
        asDependency<SubscriptionPlanService>(planService),
        asDependency<FeatureGateService>(featureGate),
      );

      await service.renewSubscription("org-1");

      const updateArgs = firstMockArg<{ data: { planId: string; currentPeriodStart: Date } }>(
        prisma.organizationSubscription.update,
      );
      expect(updateArgs.data.planId).toBe("plan-starter");
      expect(updateArgs.data.currentPeriodStart).toEqual(PERIOD_END);
    });

    it("clears TRIAL status on renewal", async () => {
      prisma = makePrisma({ status: "TRIAL" });
      service = new SubscriptionLifecycleService(
        asDependency<PrismaService>(prisma),
        asDependency<AuditService>(auditService),
        asDependency<SubscriptionPlanService>(planService),
        asDependency<FeatureGateService>(featureGate),
      );

      await service.renewSubscription("org-1");

      const updateArgs = firstMockArg<{ data: { status: string; trialEndsAt: null } }>(
        prisma.organizationSubscription.update,
      );
      expect(updateArgs.data.status).toBe("ACTIVE");
      expect(updateArgs.data.trialEndsAt).toBeNull();
    });
  });

  describe("reactivateSubscription()", () => {
    it("clears cancellation schedule", async () => {
      prisma = makePrisma({ cancelAt: PERIOD_END });
      service = new SubscriptionLifecycleService(
        asDependency<PrismaService>(prisma),
        asDependency<AuditService>(auditService),
        asDependency<SubscriptionPlanService>(planService),
        asDependency<FeatureGateService>(featureGate),
      );

      await service.reactivateSubscription("org-1", ACTOR);

      const updateArgs = firstMockArg<{
        data: { cancelAt: null; cancellationReason: null; autoRenew: boolean };
      }>(prisma.organizationSubscription.update);
      expect(updateArgs.data.cancelAt).toBeNull();
      expect(updateArgs.data.cancellationReason).toBeNull();
      expect(updateArgs.data.autoRenew).toBe(true);
    });

    it("throws if subscription is already CANCELLED (not just scheduled)", async () => {
      prisma = makePrisma({ status: "CANCELLED" });
      service = new SubscriptionLifecycleService(
        asDependency<PrismaService>(prisma),
        asDependency<AuditService>(auditService),
        asDependency<SubscriptionPlanService>(planService),
        asDependency<FeatureGateService>(featureGate),
      );

      await expect(service.reactivateSubscription("org-1", ACTOR)).rejects.toThrow(ConflictException);
    });

    it("throws if subscription is not scheduled for cancellation", async () => {
      await expect(service.reactivateSubscription("org-1", ACTOR)).rejects.toThrow(ConflictException);
    });
  });
});
