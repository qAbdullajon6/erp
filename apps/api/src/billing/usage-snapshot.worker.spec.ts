import { UsageSnapshotWorker } from "./usage-snapshot.worker";

const NOW = new Date("2026-07-15T01:00:00Z");

function makePrisma(opts: { orgCount?: number; deleteCount?: number } = {}) {
  const { orgCount = 2, deleteCount = 50 } = opts;
  const orgs = Array.from({ length: orgCount }, (_, i) => ({
    id: `org-${i + 1}`,
    subscription: { planId: `plan-${i + 1}`, plan: { name: "Pro" } },
  }));

  return {
    organization: {
      findMany: jest.fn().mockResolvedValue(orgs),
    },
    usageRecord: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { value: 100 } }),
      deleteMany: jest.fn().mockResolvedValue({ count: deleteCount }),
    },
    usageSnapshot: {
      upsert: jest.fn().mockResolvedValue({}),
    },
    organizationSubscription: {
      findUnique: jest.fn().mockResolvedValue({ planId: "plan-1" }),
    },
  } as any;
}

function makeUsageMeteringService() {
  return {} as any;
}

function makeFeatureGateService() {
  return { clearCache: jest.fn() } as any;
}

describe("UsageSnapshotWorker", () => {
  let worker: UsageSnapshotWorker;
  let prisma: any;
  let featureGate: any;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
    prisma = makePrisma();
    featureGate = makeFeatureGateService();
    worker = new UsageSnapshotWorker(prisma, makeUsageMeteringService(), featureGate);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("daily snapshots", () => {
    it("creates daily snapshots for all organizations with subscriptions", async () => {
      await worker.handleUsageSnapshots();

      expect(prisma.organization.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { subscription: { isNot: null } },
        }),
      );
      // 2 orgs × 9 metric types = 18 upserts minimum
      expect(prisma.usageSnapshot.upsert).toHaveBeenCalled();
    });

    it("aggregates usage records for yesterday", async () => {
      await worker.handleUsageSnapshots();

      expect(prisma.usageRecord.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            recordedAt: expect.objectContaining({
              gte: expect.any(Date),
              lt: expect.any(Date),
            }),
          }),
        }),
      );
    });
  });

  describe("cache invalidation", () => {
    it("clears feature gate cache for each organization", async () => {
      await worker.handleUsageSnapshots();

      expect(featureGate.clearCache).toHaveBeenCalledWith("org-1");
      expect(featureGate.clearCache).toHaveBeenCalledWith("org-2");
    });
  });

  describe("monthly snapshots", () => {
    it("creates monthly snapshots on first day of month", async () => {
      jest.useFakeTimers().setSystemTime(new Date("2026-08-01T01:00:00Z"));
      worker = new UsageSnapshotWorker(prisma, makeUsageMeteringService(), featureGate);

      await worker.handleUsageSnapshots();

      // Monthly snapshots should also be created
      const upsertCalls = prisma.usageSnapshot.upsert.mock.calls;
      const monthlyCall = upsertCalls.find(
        (call: any) => call[0]?.where?.organizationId_metricType_period_periodStart?.period === "monthly",
      );
      expect(monthlyCall).toBeDefined();
    });

    it("does NOT create monthly snapshots on non-first days", async () => {
      jest.useFakeTimers().setSystemTime(new Date("2026-07-15T01:00:00Z"));
      worker = new UsageSnapshotWorker(prisma, makeUsageMeteringService(), featureGate);

      await worker.handleUsageSnapshots();

      const upsertCalls = prisma.usageSnapshot.upsert.mock.calls;
      const monthlyCall = upsertCalls.find(
        (call: any) => call[0]?.where?.organizationId_metricType_period_periodStart?.period === "monthly",
      );
      expect(monthlyCall).toBeUndefined();
    });
  });

  describe("cleanup", () => {
    it("deletes usage records older than 90 days", async () => {
      await worker.handleUsageSnapshots();

      expect(prisma.usageRecord.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            recordedAt: expect.objectContaining({ lt: expect.any(Date) }),
          }),
        }),
      );

      // Verify the date is ~90 days ago
      const deleteCall = prisma.usageRecord.deleteMany.mock.calls[0][0];
      const cutoffDate = deleteCall.where.recordedAt.lt;
      const daysDiff = (NOW.getTime() - cutoffDate.getTime()) / (24 * 60 * 60 * 1000);
      expect(daysDiff).toBeCloseTo(90, 0);
    });
  });

  describe("error isolation", () => {
    it("continues processing when one org snapshot fails", async () => {
      prisma.usageRecord.aggregate
        .mockRejectedValueOnce(new Error("DB error"))
        .mockResolvedValue({ _sum: { value: 50 } });

      await expect(worker.handleUsageSnapshots()).resolves.not.toThrow();
      expect(featureGate.clearCache).toHaveBeenCalledWith("org-2");
    });
  });

  describe("idempotency", () => {
    it("uses upsert to handle duplicate snapshot creation", async () => {
      await worker.handleUsageSnapshots();

      expect(prisma.usageSnapshot.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId_metricType_period_periodStart: expect.any(Object),
          }),
        }),
      );
    });
  });
});
