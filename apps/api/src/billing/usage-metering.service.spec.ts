import { UsageMetricType } from "@prisma/client";
import { UsageMeteringService } from "./usage-metering.service";
import { FeatureGateService } from "./feature-gate.service";
import { PrismaService } from "../prisma/prisma.service";
import { asDependency } from "./test-support/billing-spec.helpers";

const BILLING_PERIOD = {
  subscriptionId: "sub-1",
  start: new Date("2026-07-01"),
  end: new Date("2026-08-01"),
};

function makePrisma(
  opts: {
    hasSubscription?: boolean;
    membershipCount?: number;
    vehicleCount?: number;
    driverCount?: number;
    customerCount?: number;
    storageBytes?: number | null;
    orderCount?: number;
    webhookCount?: number;
    aiMessageCount?: number;
    apiRequestCount?: number;
  } = {},
) {
  const {
    hasSubscription = true,
    membershipCount = 0,
    vehicleCount = 0,
    driverCount = 0,
    customerCount = 0,
    storageBytes = null,
    orderCount = 0,
    webhookCount = 0,
    aiMessageCount = 0,
    apiRequestCount = 0,
  } = opts;

  return {
    organizationSubscription: {
      findUnique: jest.fn().mockResolvedValue(
        hasSubscription
          ? { id: "sub-1", currentPeriodStart: BILLING_PERIOD.start, currentPeriodEnd: BILLING_PERIOD.end, status: "ACTIVE" }
          : null,
      ),
    },
    usageRecord: {
      create: jest.fn().mockResolvedValue({}),
      aggregate: jest.fn().mockResolvedValue({ _sum: { value: null } }),
    },
    usageSnapshot: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
    },
    membership: { count: jest.fn().mockResolvedValue(membershipCount) },
    vehicle: { count: jest.fn().mockResolvedValue(vehicleCount) },
    driver: { count: jest.fn().mockResolvedValue(driverCount) },
    customer: { count: jest.fn().mockResolvedValue(customerCount) },
    orderDocument: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { fileSizeBytes: storageBytes } }),
    },
    order: { count: jest.fn().mockResolvedValue(orderCount) },
    webhookDelivery: { count: jest.fn().mockResolvedValue(webhookCount) },
    aiMessage: { count: jest.fn().mockResolvedValue(aiMessageCount) },
    apiUsageRecord: { count: jest.fn().mockResolvedValue(apiRequestCount) },
  };
}

function makeFeatureGate(limit: number | null = 1000) {
  return {
    remainingQuota: jest.fn().mockImplementation((_orgId: string, _key: string, usage: number) => {
      if (limit === null) return Promise.resolve(null);
      return Promise.resolve(Math.max(0, limit - usage));
    }),
    wouldExceedLimit: jest.fn().mockImplementation(
      (_orgId: string, _key: string, usage: number, increment: number) => {
        if (limit === null) return Promise.resolve(false);
        return Promise.resolve(usage + increment > limit);
      },
    ),
    getLimit: jest.fn().mockResolvedValue(limit),
  };
}

describe("UsageMeteringService", () => {
  describe("getCurrentUsage() — live-total metrics (no billing period needed)", () => {
    it("counts active, non-platform-admin memberships for USERS", async () => {
      const prisma = makePrisma({ membershipCount: 4 });
      const service = new UsageMeteringService(
        asDependency<PrismaService>(prisma),
        asDependency<FeatureGateService>(makeFeatureGate()),
      );

      expect(await service.getCurrentUsage("org-1", UsageMetricType.USERS)).toBe(4);
      expect(prisma.membership.count).toHaveBeenCalledWith({
        where: { organizationId: "org-1", status: "ACTIVE", user: { isPlatformAdmin: false } },
      });
    });

    it("counts non-archived vehicles for VEHICLES", async () => {
      const prisma = makePrisma({ vehicleCount: 3 });
      const service = new UsageMeteringService(
        asDependency<PrismaService>(prisma),
        asDependency<FeatureGateService>(makeFeatureGate()),
      );

      expect(await service.getCurrentUsage("org-1", UsageMetricType.VEHICLES)).toBe(3);
      expect(prisma.vehicle.count).toHaveBeenCalledWith({ where: { organizationId: "org-1", archivedAt: null } });
    });

    it("counts non-archived drivers for DRIVERS", async () => {
      const prisma = makePrisma({ driverCount: 2 });
      const service = new UsageMeteringService(
        asDependency<PrismaService>(prisma),
        asDependency<FeatureGateService>(makeFeatureGate()),
      );

      expect(await service.getCurrentUsage("org-1", UsageMetricType.DRIVERS)).toBe(2);
    });

    it("counts non-archived customers for CUSTOMERS", async () => {
      const prisma = makePrisma({ customerCount: 7 });
      const service = new UsageMeteringService(
        asDependency<PrismaService>(prisma),
        asDependency<FeatureGateService>(makeFeatureGate()),
      );

      expect(await service.getCurrentUsage("org-1", UsageMetricType.CUSTOMERS)).toBe(7);
    });

    it("sums OrderDocument file sizes and converts bytes to GB for STORAGE_GB", async () => {
      const prisma = makePrisma({ storageBytes: 2 * 1024 * 1024 * 1024 });
      const service = new UsageMeteringService(
        asDependency<PrismaService>(prisma),
        asDependency<FeatureGateService>(makeFeatureGate()),
      );

      expect(await service.getCurrentUsage("org-1", UsageMetricType.STORAGE_GB)).toBe(2);
    });

    it("returns 0 storage when no documents exist", async () => {
      const prisma = makePrisma({ storageBytes: null });
      const service = new UsageMeteringService(
        asDependency<PrismaService>(prisma),
        asDependency<FeatureGateService>(makeFeatureGate()),
      );

      expect(await service.getCurrentUsage("org-1", UsageMetricType.STORAGE_GB)).toBe(0);
    });

    it("live-total metrics still resolve with no active subscription", async () => {
      const prisma = makePrisma({ hasSubscription: false, vehicleCount: 5 });
      const service = new UsageMeteringService(
        asDependency<PrismaService>(prisma),
        asDependency<FeatureGateService>(makeFeatureGate()),
      );

      expect(await service.getCurrentUsage("org-1", UsageMetricType.VEHICLES)).toBe(5);
    });
  });

  describe("getCurrentUsage() — period-scoped metrics", () => {
    it("counts orders created within the current billing period for ORDERS", async () => {
      const prisma = makePrisma({ orderCount: 12 });
      const service = new UsageMeteringService(
        asDependency<PrismaService>(prisma),
        asDependency<FeatureGateService>(makeFeatureGate()),
      );

      expect(await service.getCurrentUsage("org-1", UsageMetricType.ORDERS)).toBe(12);
      expect(prisma.order.count).toHaveBeenCalledWith({
        where: { organizationId: "org-1", createdAt: { gte: BILLING_PERIOD.start, lt: BILLING_PERIOD.end } },
      });
    });

    it("counts webhook deliveries within the current billing period for WEBHOOKS", async () => {
      const prisma = makePrisma({ webhookCount: 8 });
      const service = new UsageMeteringService(
        asDependency<PrismaService>(prisma),
        asDependency<FeatureGateService>(makeFeatureGate()),
      );

      expect(await service.getCurrentUsage("org-1", UsageMetricType.WEBHOOKS)).toBe(8);
    });

    it("counts assistant turns within the current billing period for AI_CREDITS", async () => {
      const prisma = makePrisma({ aiMessageCount: 6 });
      const service = new UsageMeteringService(
        asDependency<PrismaService>(prisma),
        asDependency<FeatureGateService>(makeFeatureGate()),
      );

      expect(await service.getCurrentUsage("org-1", UsageMetricType.AI_CREDITS)).toBe(6);
      expect(prisma.aiMessage.count).toHaveBeenCalledWith({
        where: {
          organizationId: "org-1",
          role: "ASSISTANT",
          createdAt: { gte: BILLING_PERIOD.start, lt: BILLING_PERIOD.end },
        },
      });
    });

    it("returns 0 for period-scoped metrics with no active subscription", async () => {
      const prisma = makePrisma({ hasSubscription: false, orderCount: 99 });
      const service = new UsageMeteringService(
        asDependency<PrismaService>(prisma),
        asDependency<FeatureGateService>(makeFeatureGate()),
      );

      expect(await service.getCurrentUsage("org-1", UsageMetricType.ORDERS)).toBe(0);
    });
  });

  describe("getCurrentUsage() — API_REQUESTS (calendar-day window)", () => {
    it("counts API usage records for today, independent of the billing period", async () => {
      const prisma = makePrisma({ apiRequestCount: 42 });
      const service = new UsageMeteringService(
        asDependency<PrismaService>(prisma),
        asDependency<FeatureGateService>(makeFeatureGate()),
      );

      expect(await service.getCurrentUsage("org-1", UsageMetricType.API_REQUESTS)).toBe(42);
      expect(prisma.apiUsageRecord.count).toHaveBeenCalledTimes(1);
    });

    it("still resolves with no active subscription", async () => {
      const prisma = makePrisma({ hasSubscription: false, apiRequestCount: 5 });
      const service = new UsageMeteringService(
        asDependency<PrismaService>(prisma),
        asDependency<FeatureGateService>(makeFeatureGate()),
      );

      expect(await service.getCurrentUsage("org-1", UsageMetricType.API_REQUESTS)).toBe(5);
    });
  });

  describe("getRemainingQuota()", () => {
    it("returns remaining quota based on current usage", async () => {
      const prisma = makePrisma({ vehicleCount: 100 });
      const service = new UsageMeteringService(
        asDependency<PrismaService>(prisma),
        asDependency<FeatureGateService>(makeFeatureGate(1000)),
      );

      expect(await service.getRemainingQuota("org-1", UsageMetricType.VEHICLES)).toBe(900);
    });

    it("returns null for unlimited features", async () => {
      const prisma = makePrisma({ vehicleCount: 100 });
      const service = new UsageMeteringService(
        asDependency<PrismaService>(prisma),
        asDependency<FeatureGateService>(makeFeatureGate(null)),
      );

      expect(await service.getRemainingQuota("org-1", UsageMetricType.STORAGE_GB)).toBeNull();
    });
  });

  describe("enforceLimit()", () => {
    it("throws ConflictException when increment would exceed limit", async () => {
      const prisma = makePrisma({ vehicleCount: 999 });
      const service = new UsageMeteringService(
        asDependency<PrismaService>(prisma),
        asDependency<FeatureGateService>(makeFeatureGate(1000)),
      );

      await expect(service.enforceLimit("org-1", UsageMetricType.VEHICLES, 2)).rejects.toMatchObject({
        status: 409,
      });
    });

    it("throws with a message describing the limit and current usage", async () => {
      const prisma = makePrisma({ vehicleCount: 5 });
      const service = new UsageMeteringService(
        asDependency<PrismaService>(prisma),
        asDependency<FeatureGateService>(makeFeatureGate(5)),
      );

      await expect(service.enforceLimit("org-1", UsageMetricType.VEHICLES, 1)).rejects.toThrow(/limit reached/i);
    });

    it("does not throw when within limit", async () => {
      const prisma = makePrisma({ vehicleCount: 5 });
      const featureGate = makeFeatureGate(1000);
      const service = new UsageMeteringService(
        asDependency<PrismaService>(prisma),
        asDependency<FeatureGateService>(featureGate),
      );

      await expect(service.enforceLimit("org-1", UsageMetricType.VEHICLES, 1)).resolves.not.toThrow();
    });
  });

  describe("getUsageSummary()", () => {
    it("still returns live-total metrics when there is no active subscription", async () => {
      const prisma = makePrisma({ hasSubscription: false, vehicleCount: 3 });
      const service = new UsageMeteringService(
        asDependency<PrismaService>(prisma),
        asDependency<FeatureGateService>(makeFeatureGate(10)),
      );

      const summary = await service.getUsageSummary("org-1");
      const vehicles = summary.metrics.find((m) => m.metricType === UsageMetricType.VEHICLES);
      expect(vehicles?.currentUsage).toBe(3);
    });

    it("returns all tracked metrics for a subscribed organization", async () => {
      const prisma = makePrisma({ vehicleCount: 3, orderCount: 10 });
      const service = new UsageMeteringService(
        asDependency<PrismaService>(prisma),
        asDependency<FeatureGateService>(makeFeatureGate(1000)),
      );

      const summary = await service.getUsageSummary("org-1");
      expect(summary.metrics.length).toBeGreaterThan(0);
      expect(summary.periodStart).toEqual(BILLING_PERIOD.start);
    });
  });
});
