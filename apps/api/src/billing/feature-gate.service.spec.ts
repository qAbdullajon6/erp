import { FeatureGateService, PlanLimits } from "./feature-gate.service";

function makePrisma(subscriptionOverride?: Partial<any> | null) {
  return {
    organizationSubscription: {
      findUnique: jest.fn().mockResolvedValue(
        subscriptionOverride === null
          ? null
          : {
              planId: "plan-1",
              status: "ACTIVE",
              metadata: null,
              ...subscriptionOverride,
              plan: {
                name: "Professional",
                slug: "professional",
                features: {
                  users: 25,
                  vehicles: 50,
                  orders_per_month: 5000,
                  api_requests_per_day: 10000,
                  custom_branding: true,
                  sso: false,
                  storage_gb: null, // unlimited
                },
                ...(subscriptionOverride as any)?.plan,
              },
            },
      ),
    },
  } as any;
}

describe("FeatureGateService", () => {
  let service: FeatureGateService;

  beforeEach(() => {
    service = new FeatureGateService(
      makePrisma({ seats: 10, trialEndsAt: null, currentPeriodEnd: new Date("2026-08-01") }),
    );
  });

  afterEach(() => {
    service.clearCache("org-1");
  });

  describe("canUseFeature()", () => {
    it("returns true for a boolean feature that is enabled", async () => {
      expect(await service.canUseFeature("org-1", "custom_branding")).toBe(true);
    });

    it("returns false for a boolean feature that is disabled", async () => {
      expect(await service.canUseFeature("org-1", "sso")).toBe(false);
    });

    it("returns false for a feature that does not exist", async () => {
      expect(await service.canUseFeature("org-1", "nonexistent_feature")).toBe(false);
    });

    it("returns false for a non-boolean feature value", async () => {
      expect(await service.canUseFeature("org-1", "users")).toBe(false);
    });

    it("returns false when organization has no subscription", async () => {
      service = new FeatureGateService(makePrisma(null));
      expect(await service.canUseFeature("org-1", "custom_branding")).toBe(false);
    });

    it("returns false for EXPIRED subscription", async () => {
      service = new FeatureGateService(makePrisma({ status: "EXPIRED" }));
      expect(await service.canUseFeature("org-1", "custom_branding")).toBe(false);
    });

    it("returns false for CANCELLED subscription", async () => {
      service = new FeatureGateService(makePrisma({ status: "CANCELLED" }));
      expect(await service.canUseFeature("org-1", "custom_branding")).toBe(false);
    });
  });

  describe("checkLimit()", () => {
    it("returns allowed=true with remaining count when within limit", async () => {
      const result = await service.checkLimit("org-1", "users", 10);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(15); // 25 - 10
    });

    it("returns allowed=false with remaining=0 when at limit", async () => {
      const result = await service.checkLimit("org-1", "users", 25);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it("returns allowed=false when over limit", async () => {
      const result = await service.checkLimit("org-1", "users", 30);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it("returns allowed=true with remaining=null for unlimited features", async () => {
      const result = await service.checkLimit("org-1", "storage_gb", 999);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBeNull();
    });

    it("returns allowed=false when no subscription exists", async () => {
      service = new FeatureGateService(makePrisma(null));
      const result = await service.checkLimit("org-1", "users", 0);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it("returns allowed=false for non-numeric limit value", async () => {
      service = new FeatureGateService(
        makePrisma({ plan: { features: { users: "invalid" } } }),
      );
      const result = await service.checkLimit("org-1", "users", 0);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });
  });

  describe("remainingQuota()", () => {
    it("returns remaining count for numeric limits", async () => {
      const remaining = await service.remainingQuota("org-1", "vehicles", 20);
      expect(remaining).toBe(30); // 50 - 20
    });

    it("returns null for unlimited features", async () => {
      const remaining = await service.remainingQuota("org-1", "storage_gb", 100);
      expect(remaining).toBeNull();
    });

    it("returns 0 when at limit", async () => {
      const remaining = await service.remainingQuota("org-1", "users", 25);
      expect(remaining).toBe(0);
    });
  });

  describe("wouldExceedLimit()", () => {
    it("returns false when increment stays within limit", async () => {
      expect(await service.wouldExceedLimit("org-1", "users", 20, 4)).toBe(false);
    });

    it("returns true when increment would exceed limit", async () => {
      expect(await service.wouldExceedLimit("org-1", "users", 20, 6)).toBe(true);
    });

    it("returns true when already at limit with any positive increment", async () => {
      expect(await service.wouldExceedLimit("org-1", "users", 25, 1)).toBe(true);
    });

    it("returns false for unlimited features regardless of increment", async () => {
      expect(await service.wouldExceedLimit("org-1", "storage_gb", 1000, 500)).toBe(false);
    });
  });

  describe("cache behavior", () => {
    it("caches plan limits after first lookup", async () => {
      const prisma = makePrisma({ seats: 10, trialEndsAt: null, currentPeriodEnd: new Date() });
      service = new FeatureGateService(prisma);

      await service.canUseFeature("org-1", "custom_branding");
      await service.canUseFeature("org-1", "custom_branding");

      expect(prisma.organizationSubscription.findUnique).toHaveBeenCalledTimes(1);
    });

    it("clearCache forces fresh DB lookup", async () => {
      const prisma = makePrisma({ seats: 10, trialEndsAt: null, currentPeriodEnd: new Date() });
      service = new FeatureGateService(prisma);

      await service.canUseFeature("org-1", "custom_branding");
      service.clearCache("org-1");
      await service.canUseFeature("org-1", "custom_branding");

      expect(prisma.organizationSubscription.findUnique).toHaveBeenCalledTimes(2);
    });
  });

  describe("hasActiveSubscription()", () => {
    it("returns true when subscription is ACTIVE", async () => {
      expect(await service.hasActiveSubscription("org-1")).toBe(true);
    });

    it("returns true when subscription is TRIAL", async () => {
      service = new FeatureGateService(
        makePrisma({ status: "TRIAL", seats: 5, trialEndsAt: new Date(), currentPeriodEnd: new Date() }),
      );
      expect(await service.hasActiveSubscription("org-1")).toBe(true);
    });

    it("returns false when no subscription exists", async () => {
      service = new FeatureGateService(makePrisma(null));
      expect(await service.hasActiveSubscription("org-1")).toBe(false);
    });
  });

  describe("getSubscriptionStatus()", () => {
    it("returns ACTIVE for active subscription", async () => {
      expect(await service.getSubscriptionStatus("org-1")).toBe("ACTIVE");
    });

    it("returns NONE when no subscription exists", async () => {
      service = new FeatureGateService(makePrisma(null));
      expect(await service.getSubscriptionStatus("org-1")).toBe("NONE");
    });

    it("returns SUSPENDED for suspended subscription", async () => {
      service = new FeatureGateService(
        makePrisma({ status: "SUSPENDED", seats: 10, trialEndsAt: null, currentPeriodEnd: new Date() }),
      );
      expect(await service.getSubscriptionStatus("org-1")).toBe("SUSPENDED");
    });
  });
});
