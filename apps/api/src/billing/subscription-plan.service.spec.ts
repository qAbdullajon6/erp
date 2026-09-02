import { NotFoundException } from "@nestjs/common";
import type { SubscriptionPlan } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { SubscriptionPlanService } from "./subscription-plan.service";
import { asDependency } from "./test-support/billing-spec.helpers";

const PLAN_TIMESTAMP = new Date("2026-01-01T00:00:00Z");

const PLANS: SubscriptionPlan[] = [
  {
    id: "plan-free",
    name: "Free",
    slug: "free",
    description: null,
    price: 0,
    annualPrice: 0,
    currency: "USD",
    isActive: true,
    isFeatured: false,
    sortOrder: 0,
    features: { users: 5, vehicles: 5, orders_per_month: 50, custom_branding: false, sso: false },
    createdAt: PLAN_TIMESTAMP,
    updatedAt: PLAN_TIMESTAMP,
  },
  {
    id: "plan-starter",
    name: "Starter",
    slug: "starter",
    description: null,
    price: 4900,
    annualPrice: 49000,
    currency: "USD",
    isActive: true,
    isFeatured: false,
    sortOrder: 1,
    features: { users: 10, vehicles: 20, orders_per_month: 500, custom_branding: false, sso: false },
    createdAt: PLAN_TIMESTAMP,
    updatedAt: PLAN_TIMESTAMP,
  },
  {
    id: "plan-pro",
    name: "Professional",
    slug: "professional",
    description: null,
    price: 14900,
    annualPrice: 149000,
    currency: "USD",
    isActive: true,
    isFeatured: true,
    sortOrder: 2,
    features: { users: 25, vehicles: 50, orders_per_month: 5000, custom_branding: true, sso: false },
    createdAt: PLAN_TIMESTAMP,
    updatedAt: PLAN_TIMESTAMP,
  },
  {
    id: "plan-enterprise",
    name: "Enterprise",
    slug: "enterprise",
    description: null,
    price: 49900,
    annualPrice: 499000,
    currency: "USD",
    isActive: true,
    isFeatured: false,
    sortOrder: 3,
    features: { users: null, vehicles: null, orders_per_month: null, custom_branding: true, sso: true },
    createdAt: PLAN_TIMESTAMP,
    updatedAt: PLAN_TIMESTAMP,
  },
];

function makePrisma() {
  return {
    subscriptionPlan: {
      findMany: jest.fn().mockImplementation(
        ({
          where,
          orderBy,
        }: {
          where?: { isActive?: boolean };
          orderBy?: { sortOrder?: "asc" | "desc" };
        }) => {
          let result = [...PLANS];
          if (where?.isActive) result = result.filter((p) => p.isActive);
          if (orderBy?.sortOrder === "asc") result.sort((a, b) => a.sortOrder - b.sortOrder);
          return Promise.resolve(result);
        },
      ),
      findUnique: jest.fn().mockImplementation(({ where }: { where: { id?: string; slug?: string } }) => {
        const plan = PLANS.find((p) => p.id === where.id || p.slug === where.slug);
        return Promise.resolve(plan ?? null);
      }),
      findFirst: jest.fn().mockImplementation(({ where }: { where?: { isFeatured?: boolean } }) => {
        let result = PLANS.filter((p) => p.isActive);
        if (where?.isFeatured) result = result.filter((p) => p.isFeatured);
        return Promise.resolve(result[0] ?? null);
      }),
    },
  };
}

describe("SubscriptionPlanService", () => {
  let service: SubscriptionPlanService;

  beforeEach(() => {
    service = new SubscriptionPlanService(asDependency<PrismaService>(makePrisma()));
  });

  describe("listActivePlans()", () => {
    it("returns all active plans in sort order", async () => {
      const plans = await service.listActivePlans();
      expect(plans).toHaveLength(4);
      expect(plans[0].slug).toBe("free");
      expect(plans[3].slug).toBe("enterprise");
    });
  });

  describe("getPlanById()", () => {
    it("returns plan by ID", async () => {
      const plan = await service.getPlanById("plan-pro");
      expect(plan.name).toBe("Professional");
    });

    it("throws NotFoundException for unknown ID", async () => {
      await expect(service.getPlanById("plan-nonexistent")).rejects.toThrow(NotFoundException);
    });
  });

  describe("getPlanBySlug()", () => {
    it("returns plan by slug", async () => {
      const plan = await service.getPlanBySlug("starter");
      expect(plan.name).toBe("Starter");
    });

    it("throws NotFoundException for unknown slug", async () => {
      await expect(service.getPlanBySlug("nonexistent")).rejects.toThrow(NotFoundException);
    });
  });

  describe("getFeaturedPlan()", () => {
    it("returns the featured plan", async () => {
      const plan = await service.getFeaturedPlan();
      expect(plan).not.toBeNull();
      expect(plan!.slug).toBe("professional");
    });
  });

  describe("isUpgrade()", () => {
    it("returns true when new plan has higher price", () => {
      expect(service.isUpgrade(PLANS[0], PLANS[2])).toBe(true);
    });

    it("returns false when new plan has lower price", () => {
      expect(service.isUpgrade(PLANS[2], PLANS[0])).toBe(false);
    });

    it("returns false when same plan", () => {
      expect(service.isUpgrade(PLANS[1], PLANS[1])).toBe(false);
    });
  });

  describe("isDowngrade()", () => {
    it("returns true when new plan has lower price", () => {
      expect(service.isDowngrade(PLANS[2], PLANS[0])).toBe(true);
    });

    it("returns false when new plan has higher price", () => {
      expect(service.isDowngrade(PLANS[0], PLANS[2])).toBe(false);
    });
  });

  describe("comparePlans()", () => {
    it("returns differences between two plans", async () => {
      const comparison = await service.comparePlans("plan-free", "plan-pro");

      expect(comparison.planA.slug).toBe("free");
      expect(comparison.planB.slug).toBe("professional");
      expect(comparison.differences.length).toBeGreaterThan(0);

      const usersDiff = comparison.differences.find((d) => d.feature === "users");
      expect(usersDiff).toBeDefined();
      expect(usersDiff!.planAValue).toBe(5);
      expect(usersDiff!.planBValue).toBe(25);
    });
  });

  describe("recommendPlan()", () => {
    it("recommends Enterprise for SSO requirement", async () => {
      const plan = await service.recommendPlan({
        userCount: 5,
        vehicleCount: 5,
        orderVolume: 50,
        needsSSO: true,
        needsCustomBranding: false,
      });
      expect(plan.slug).toBe("enterprise");
    });

    it("recommends Professional for >10 users", async () => {
      const plan = await service.recommendPlan({
        userCount: 15,
        vehicleCount: 10,
        orderVolume: 100,
        needsSSO: false,
        needsCustomBranding: false,
      });
      expect(plan.slug).toBe("professional");
    });

    it("recommends Starter for >5 users", async () => {
      const plan = await service.recommendPlan({
        userCount: 7,
        vehicleCount: 5,
        orderVolume: 50,
        needsSSO: false,
        needsCustomBranding: false,
      });
      expect(plan.slug).toBe("starter");
    });

    it("recommends Free for small usage", async () => {
      const plan = await service.recommendPlan({
        userCount: 3,
        vehicleCount: 3,
        orderVolume: 20,
        needsSSO: false,
        needsCustomBranding: false,
      });
      expect(plan.slug).toBe("free");
    });
  });
});
