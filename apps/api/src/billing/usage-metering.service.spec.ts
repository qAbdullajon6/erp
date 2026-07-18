import { UsageMeteringService } from "./usage-metering.service";

const BILLING_PERIOD = {
  subscriptionId: "sub-1",
  start: new Date("2026-07-01"),
  end: new Date("2026-08-01"),
};

function makePrisma(opts: { hasSubscription?: boolean; usageSum?: number; snapshotValue?: number | null } = {}) {
  const { hasSubscription = true, usageSum = 100, snapshotValue = null } = opts;
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
      aggregate: jest.fn().mockResolvedValue({
        _sum: { value: usageSum ? { toNumber: () => usageSum } : null },
      }),
    },
    usageSnapshot: {
      findFirst: jest.fn().mockResolvedValue(
        snapshotValue !== null
          ? { value: { toNumber: () => snapshotValue }, createdAt: new Date("2026-07-14") }
          : null,
      ),
      create: jest.fn().mockResolvedValue({}),
    },
  } as any;
}

function makeFeatureGate(limit: number | null = 1000) {
  return {
    remainingQuota: jest.fn().mockImplementation((_orgId, _key, usage) => {
      if (limit === null) return Promise.resolve(null);
      return Promise.resolve(Math.max(0, limit - usage));
    }),
    wouldExceedLimit: jest.fn().mockImplementation((_orgId, _key, usage, increment) => {
      if (limit === null) return Promise.resolve(false);
      return Promise.resolve(usage + increment >= limit);
    }),
    getLimit: jest.fn().mockResolvedValue(limit),
  } as any;
}

describe("UsageMeteringService", () => {
  describe("trackUsage()", () => {
    it("creates a usage record for current billing period", async () => {
      const prisma = makePrisma();
      const service = new UsageMeteringService(prisma, makeFeatureGate());

      await service.trackUsage("org-1", "API_REQUESTS" as any, 5);

      expect(prisma.usageRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: "org-1",
            metricType: "API_REQUESTS",
            subscriptionId: "sub-1",
          }),
        }),
      );
    });

    it("does not throw when no subscription exists (fire-and-forget)", async () => {
      const prisma = makePrisma({ hasSubscription: false });
      const service = new UsageMeteringService(prisma, makeFeatureGate());

      await expect(service.trackUsage("org-1", "API_REQUESTS" as any, 1)).resolves.not.toThrow();
      expect(prisma.usageRecord.create).not.toHaveBeenCalled();
    });

    it("does not throw on database error (fire-and-forget)", async () => {
      const prisma = makePrisma();
      prisma.usageRecord.create.mockRejectedValue(new Error("DB error"));
      const service = new UsageMeteringService(prisma, makeFeatureGate());

      await expect(service.trackUsage("org-1", "API_REQUESTS" as any, 1)).resolves.not.toThrow();
    });
  });

  describe("getCurrentUsage()", () => {
    it("returns aggregated usage from records when no snapshot exists", async () => {
      const prisma = makePrisma({ usageSum: 150, snapshotValue: null });
      const service = new UsageMeteringService(prisma, makeFeatureGate());

      const usage = await service.getCurrentUsage("org-1", "API_REQUESTS" as any);
      expect(usage).toBe(150);
    });

    it("combines snapshot with recent records", async () => {
      const prisma = makePrisma({ usageSum: 30, snapshotValue: 200 });
      const service = new UsageMeteringService(prisma, makeFeatureGate());

      const usage = await service.getCurrentUsage("org-1", "API_REQUESTS" as any);
      expect(usage).toBe(230); // 200 snapshot + 30 recent
    });

    it("returns 0 when no subscription exists", async () => {
      const prisma = makePrisma({ hasSubscription: false });
      const service = new UsageMeteringService(prisma, makeFeatureGate());

      const usage = await service.getCurrentUsage("org-1", "API_REQUESTS" as any);
      expect(usage).toBe(0);
    });
  });

  describe("getRemainingQuota()", () => {
    it("returns remaining quota based on current usage", async () => {
      const prisma = makePrisma({ usageSum: 100, snapshotValue: null });
      const service = new UsageMeteringService(prisma, makeFeatureGate(1000));

      const remaining = await service.getRemainingQuota("org-1", "API_REQUESTS" as any);
      expect(remaining).toBe(900);
    });

    it("returns null for unlimited features", async () => {
      const prisma = makePrisma({ usageSum: 100, snapshotValue: null });
      const service = new UsageMeteringService(prisma, makeFeatureGate(null));

      const remaining = await service.getRemainingQuota("org-1", "STORAGE_GB" as any);
      expect(remaining).toBeNull();
    });
  });

  describe("enforceLimit()", () => {
    it("throws when increment would exceed limit", async () => {
      const prisma = makePrisma({ usageSum: 999, snapshotValue: null });
      const service = new UsageMeteringService(prisma, makeFeatureGate(1000));

      await expect(service.enforceLimit("org-1", "API_REQUESTS" as any, 2)).rejects.toThrow(
        /limit exceeded/,
      );
    });

    it("does not throw when within limit", async () => {
      const prisma = makePrisma({ usageSum: 500, snapshotValue: null });
      const featureGate = makeFeatureGate(1000);
      featureGate.wouldExceedLimit.mockResolvedValue(false);
      const service = new UsageMeteringService(prisma, featureGate);

      await expect(service.enforceLimit("org-1", "API_REQUESTS" as any, 1)).resolves.not.toThrow();
    });
  });

  describe("getUsageSummary()", () => {
    it("returns empty metrics when no subscription exists", async () => {
      const prisma = makePrisma({ hasSubscription: false });
      const service = new UsageMeteringService(prisma, makeFeatureGate());

      const summary = await service.getUsageSummary("org-1");
      expect(summary.metrics).toHaveLength(0);
    });
  });
});
