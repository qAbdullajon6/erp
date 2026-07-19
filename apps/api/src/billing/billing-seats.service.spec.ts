import { ConflictException } from "@nestjs/common";
import { BillingSeatsService } from "./billing-seats.service";

function makePrisma(membershipCount: number) {
  return {
    membership: {
      count: jest.fn().mockResolvedValue(membershipCount),
      findUnique: jest.fn().mockResolvedValue({ status: "INVITED" }),
    },
  } as any;
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
  } as any;
}

describe("BillingSeatsService", () => {
  describe("assertCanAddSeat()", () => {
    it("allows adding seat when below limit", async () => {
      const service = new BillingSeatsService(makePrisma(5), makeFeatureGate({ seats: 10 }));
      await expect(service.assertCanAddSeat("org-1")).resolves.not.toThrow();
    });

    it("throws ConflictException when at seat limit", async () => {
      const service = new BillingSeatsService(makePrisma(10), makeFeatureGate({ seats: 10 }));
      await expect(service.assertCanAddSeat("org-1")).rejects.toThrow(ConflictException);
    });

    it("throws ConflictException when over seat limit", async () => {
      const service = new BillingSeatsService(makePrisma(12), makeFeatureGate({ seats: 10 }));
      await expect(service.assertCanAddSeat("org-1")).rejects.toThrow(ConflictException);
    });

    it("allows unlimited seats (null)", async () => {
      const service = new BillingSeatsService(makePrisma(100), makeFeatureGate({ seats: null }));
      await expect(service.assertCanAddSeat("org-1")).resolves.not.toThrow();
    });

    it("enforces default free plan limit of 5 when no subscription", async () => {
      const service = new BillingSeatsService(makePrisma(5), makeFeatureGate(null));
      await expect(service.assertCanAddSeat("org-1")).rejects.toThrow(ConflictException);
    });

    it("allows seat on free plan when under default limit", async () => {
      const service = new BillingSeatsService(makePrisma(3), makeFeatureGate(null));
      await expect(service.assertCanAddSeat("org-1")).resolves.not.toThrow();
    });
  });

  describe("assertCanActivateMembership()", () => {
    it("skips enforcement for non-ACTIVE status transitions", async () => {
      const service = new BillingSeatsService(makePrisma(10), makeFeatureGate({ seats: 10 }));
      await expect(
        service.assertCanActivateMembership("org-1", "member-1", "INVITED"),
      ).resolves.not.toThrow();
    });

    it("skips enforcement when membership is already ACTIVE", async () => {
      const prisma = {
        membership: {
          count: jest.fn().mockResolvedValue(10),
          findUnique: jest.fn().mockResolvedValue({ status: "ACTIVE" }),
        },
      } as any;
      const service = new BillingSeatsService(prisma, makeFeatureGate({ seats: 10 }));
      await expect(
        service.assertCanActivateMembership("org-1", "member-1", "ACTIVE"),
      ).resolves.not.toThrow();
    });

    it("throws when activating would exceed seat limit", async () => {
      const service = new BillingSeatsService(makePrisma(10), makeFeatureGate({ seats: 10 }));
      await expect(
        service.assertCanActivateMembership("org-1", "member-1", "ACTIVE"),
      ).rejects.toThrow(ConflictException);
    });

    it("allows activation when under seat limit", async () => {
      const service = new BillingSeatsService(makePrisma(5), makeFeatureGate({ seats: 10 }));
      await expect(
        service.assertCanActivateMembership("org-1", "member-1", "ACTIVE"),
      ).resolves.not.toThrow();
    });
  });

  describe("countActiveSeats()", () => {
    it("returns count of ACTIVE memberships", async () => {
      const service = new BillingSeatsService(makePrisma(7), makeFeatureGate({ seats: 10 }));
      expect(await service.countActiveSeats("org-1")).toBe(7);
    });
  });

  describe("getSeatSummary()", () => {
    it("returns correct summary for limited plan", async () => {
      const service = new BillingSeatsService(makePrisma(5), makeFeatureGate({ seats: 10 }));
      const summary = await service.getSeatSummary("org-1");

      expect(summary.used).toBe(5);
      expect(summary.available).toBe(10);
      expect(summary.percentageUsed).toBe(50);
      expect(summary.isUnlimited).toBe(false);
    });

    it("returns correct summary for unlimited plan", async () => {
      const service = new BillingSeatsService(makePrisma(50), makeFeatureGate({ seats: null }));
      const summary = await service.getSeatSummary("org-1");

      expect(summary.used).toBe(50);
      expect(summary.available).toBeNull();
      expect(summary.percentageUsed).toBe(0);
      expect(summary.isUnlimited).toBe(true);
    });

    it("returns free plan defaults when no subscription", async () => {
      const service = new BillingSeatsService(makePrisma(3), makeFeatureGate(null));
      const summary = await service.getSeatSummary("org-1");

      expect(summary.used).toBe(3);
      expect(summary.available).toBe(5);
      expect(summary.percentageUsed).toBe(60);
      expect(summary.isUnlimited).toBe(false);
    });
  });
});
