import { ConflictException } from "@nestjs/common";
import { BillingSeatsService } from "./billing-seats.service";
import { FeatureGateService } from "./feature-gate.service";
import { UsageMeteringService } from "./usage-metering.service";
import { PrismaService } from "../prisma/prisma.service";
import { asDependency } from "./test-support/billing-spec.helpers";

function makePrisma(membershipCount: number) {
  return {
    membership: {
      count: jest.fn().mockResolvedValue(membershipCount),
      findUnique: jest.fn().mockResolvedValue({ status: "INVITED" }),
    },
  };
}

function makeFeatureGate(limits: { seats: number | null } | null) {
  return {
    getPlanLimits: jest.fn().mockResolvedValue(
      limits === null
        ? null
        : {
            planId: "plan-1",
            planName: "Professional",
            planSlug: "professional",
            features: { users: 25 },
            status: "ACTIVE",
            seats: limits.seats,
            trialEndsAt: null,
            currentPeriodEnd: new Date("2026-08-01"),
          },
    ),
  };
}

/// Mocks the fallback path assertCanAddSeat delegates to whenever there's no
/// explicit seat-purchase override (limits.seats is null, or no subscription
/// at all) — the plan's default `users` limit, via the same pipeline every
/// other resource type is enforced through.
function makeUsageMetering(shouldThrow: boolean) {
  return {
    enforceLimit: jest.fn().mockImplementation(() => {
      if (shouldThrow) {
        return Promise.reject(new ConflictException("Users limit reached."));
      }
      return Promise.resolve();
    }),
  };
}

describe("BillingSeatsService", () => {
  describe("assertCanAddSeat()", () => {
    it("allows adding seat when below the explicit seat-override limit", async () => {
      const service = new BillingSeatsService(
        asDependency<PrismaService>(makePrisma(5)),
        asDependency<FeatureGateService>(makeFeatureGate({ seats: 10 })),
        asDependency<UsageMeteringService>(makeUsageMetering(false)),
      );
      await expect(service.assertCanAddSeat("org-1")).resolves.not.toThrow();
    });

    it("throws ConflictException when at the explicit seat-override limit", async () => {
      const service = new BillingSeatsService(
        asDependency<PrismaService>(makePrisma(10)),
        asDependency<FeatureGateService>(makeFeatureGate({ seats: 10 })),
        asDependency<UsageMeteringService>(makeUsageMetering(false)),
      );
      await expect(service.assertCanAddSeat("org-1")).rejects.toThrow(ConflictException);
    });

    it("throws ConflictException when over the explicit seat-override limit", async () => {
      const service = new BillingSeatsService(
        asDependency<PrismaService>(makePrisma(12)),
        asDependency<FeatureGateService>(makeFeatureGate({ seats: 10 })),
        asDependency<UsageMeteringService>(makeUsageMetering(false)),
      );
      await expect(service.assertCanAddSeat("org-1")).rejects.toThrow(ConflictException);
    });

    it("falls back to the plan's users-limit pipeline when seats is null (not unconditionally unlimited)", async () => {
      const usageMetering = makeUsageMetering(false);
      const service = new BillingSeatsService(
        asDependency<PrismaService>(makePrisma(100)),
        asDependency<FeatureGateService>(makeFeatureGate({ seats: null })),
        asDependency<UsageMeteringService>(usageMetering),
      );
      await expect(service.assertCanAddSeat("org-1")).resolves.not.toThrow();
      expect(usageMetering.enforceLimit).toHaveBeenCalledWith("org-1", "USERS", 1);
    });

    it("blocks via the users-limit pipeline once the plan's default is reached, even with seats null", async () => {
      const service = new BillingSeatsService(
        asDependency<PrismaService>(makePrisma(100)),
        asDependency<FeatureGateService>(makeFeatureGate({ seats: null })),
        asDependency<UsageMeteringService>(makeUsageMetering(true)),
      );
      await expect(service.assertCanAddSeat("org-1")).rejects.toThrow(ConflictException);
    });

    it("falls back to the users-limit pipeline when there is no subscription at all", async () => {
      const usageMetering = makeUsageMetering(false);
      const service = new BillingSeatsService(
        asDependency<PrismaService>(makePrisma(3)),
        asDependency<FeatureGateService>(makeFeatureGate(null)),
        asDependency<UsageMeteringService>(usageMetering),
      );
      await expect(service.assertCanAddSeat("org-1")).resolves.not.toThrow();
      expect(usageMetering.enforceLimit).toHaveBeenCalledWith("org-1", "USERS", 1);
    });
  });

  describe("assertCanActivateMembership()", () => {
    it("skips enforcement for non-ACTIVE status transitions", async () => {
      const service = new BillingSeatsService(
        asDependency<PrismaService>(makePrisma(10)),
        asDependency<FeatureGateService>(makeFeatureGate({ seats: 10 })),
        asDependency<UsageMeteringService>(makeUsageMetering(false)),
      );
      await expect(
        service.assertCanActivateMembership("org-1", "member-1", "INVITED"),
      ).resolves.not.toThrow();
    });

    it("skips enforcement when membership is already ACTIVE", async () => {
      const prisma = makePrisma(10);
      prisma.membership.findUnique.mockResolvedValue({ status: "ACTIVE" });
      const service = new BillingSeatsService(
        asDependency<PrismaService>(prisma),
        asDependency<FeatureGateService>(makeFeatureGate({ seats: 10 })),
        asDependency<UsageMeteringService>(makeUsageMetering(false)),
      );
      await expect(
        service.assertCanActivateMembership("org-1", "member-1", "ACTIVE"),
      ).resolves.not.toThrow();
    });

    it("throws when activating would exceed seat limit", async () => {
      const service = new BillingSeatsService(
        asDependency<PrismaService>(makePrisma(10)),
        asDependency<FeatureGateService>(makeFeatureGate({ seats: 10 })),
        asDependency<UsageMeteringService>(makeUsageMetering(false)),
      );
      await expect(
        service.assertCanActivateMembership("org-1", "member-1", "ACTIVE"),
      ).rejects.toThrow(ConflictException);
    });

    it("allows activation when under seat limit", async () => {
      const service = new BillingSeatsService(
        asDependency<PrismaService>(makePrisma(5)),
        asDependency<FeatureGateService>(makeFeatureGate({ seats: 10 })),
        asDependency<UsageMeteringService>(makeUsageMetering(false)),
      );
      await expect(
        service.assertCanActivateMembership("org-1", "member-1", "ACTIVE"),
      ).resolves.not.toThrow();
    });
  });

  describe("countActiveSeats()", () => {
    it("counts ACTIVE memberships excluding platform-support accounts", async () => {
      const prisma = makePrisma(7);
      const service = new BillingSeatsService(
        asDependency<PrismaService>(prisma),
        asDependency<FeatureGateService>(makeFeatureGate({ seats: 10 })),
        asDependency<UsageMeteringService>(makeUsageMetering(false)),
      );
      expect(await service.countActiveSeats("org-1")).toBe(7);
      expect(prisma.membership.count).toHaveBeenCalledWith({
        where: {
          organizationId: "org-1",
          status: "ACTIVE",
          user: { isPlatformAdmin: false },
        },
      });
    });
  });

  describe("getSeatSummary()", () => {
    it("returns correct summary for limited plan", async () => {
      const service = new BillingSeatsService(
        asDependency<PrismaService>(makePrisma(5)),
        asDependency<FeatureGateService>(makeFeatureGate({ seats: 10 })),
        asDependency<UsageMeteringService>(makeUsageMetering(false)),
      );
      const summary = await service.getSeatSummary("org-1");

      expect(summary.used).toBe(5);
      expect(summary.available).toBe(10);
      expect(summary.percentageUsed).toBe(50);
      expect(summary.isUnlimited).toBe(false);
    });

    it("returns correct summary for unlimited plan", async () => {
      const service = new BillingSeatsService(
        asDependency<PrismaService>(makePrisma(50)),
        asDependency<FeatureGateService>(makeFeatureGate({ seats: null })),
        asDependency<UsageMeteringService>(makeUsageMetering(false)),
      );
      const summary = await service.getSeatSummary("org-1");

      expect(summary.used).toBe(50);
      expect(summary.available).toBeNull();
      expect(summary.percentageUsed).toBe(0);
      expect(summary.isUnlimited).toBe(true);
    });

    it("returns free plan defaults when no subscription", async () => {
      const service = new BillingSeatsService(
        asDependency<PrismaService>(makePrisma(3)),
        asDependency<FeatureGateService>(makeFeatureGate(null)),
        asDependency<UsageMeteringService>(makeUsageMetering(false)),
      );
      const summary = await service.getSeatSummary("org-1");

      expect(summary.used).toBe(3);
      expect(summary.available).toBe(5);
      expect(summary.percentageUsed).toBe(60);
      expect(summary.isUnlimited).toBe(false);
    });
  });
});
