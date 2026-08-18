import { ConflictException, Injectable } from "@nestjs/common";
import { UsageMetricType, type MembershipStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { FeatureGateService } from "./feature-gate.service";
import { UsageMeteringService } from "./usage-metering.service";

/// Seat-limit enforcement for invitations and membership reactivation.
///
/// InvitationService and OrganizationsService both depend on this. Method
/// signatures preserved exactly (callers already depend on them). Now enforces
/// real subscription seat limits instead of no-op stubs.
///
/// Seat counting:
/// - "Seats used" = count of ACTIVE memberships whose user is NOT a platform
///   admin (Open ERP support memberships must not consume tenant seats)
/// - "Seats available" = subscription.seats (purchased seat count)
/// - Null seats = unlimited (enterprise/custom plans)
///
/// Enforcement points:
/// 1. Before creating invitation (assertCanAddSeat)
/// 2. Before activating membership (assertCanActivateMembership)
/// 3. After membership changes (syncSeatsUsed) - for audit/analytics only
@Injectable()
export class BillingSeatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly featureGate: FeatureGateService,
    private readonly usageMetering: UsageMeteringService,
  ) {}

  /// Assert that organization can add one more seat.
  /// Throws ConflictException if seat limit reached.
  ///
  /// A subscription's `seats` column is an explicit purchase override (e.g.
  /// an Enterprise customer negotiating extra seats) and takes precedence
  /// when set; null seats does NOT mean unlimited, it means "no override" —
  /// falls back to the plan's default `users` limit via the same
  /// FeatureGateService/UsageMeteringService pipeline every other resource
  /// uses (which itself falls back to the Free plan when there's no
  /// subscription at all, rather than blocking everything).
  async assertCanAddSeat(organizationId: string): Promise<void> {
    const limits = await this.featureGate.getPlanLimits(organizationId);

    if (limits && limits.seats !== null) {
      const seatsUsed = await this.countActiveSeats(organizationId);
      if (seatsUsed >= limits.seats) {
        throw new ConflictException(
          `Seat limit reached. Your plan allows ${limits.seats} users and all seats are currently in use. ` +
            `Upgrade your plan or remove inactive members to add more team members.`,
        );
      }
      return;
    }

    await this.usageMetering.enforceLimit(organizationId, UsageMetricType.USERS, 1);
  }

  /// Assert that activating a membership won't exceed seat limit.
  /// Only enforces when changing from non-ACTIVE to ACTIVE status.
  /// Throws ConflictException if would exceed limit.
  async assertCanActivateMembership(
    organizationId: string,
    membershipId: string,
    newStatus: MembershipStatus | undefined,
  ): Promise<void> {
    // Only enforce when activating (changing to ACTIVE)
    if (newStatus !== "ACTIVE") {
      return;
    }

    // Check if membership is already ACTIVE (no new seat consumed)
    const membership = await this.prisma.membership.findUnique({
      where: { id: membershipId },
      select: { status: true },
    });

    if (!membership) {
      // Membership not found, let caller handle
      return;
    }

    if (membership.status === "ACTIVE") {
      // Already active, no new seat consumed
      return;
    }

    // Would consume a new seat, check limit
    await this.assertCanAddSeat(organizationId);
  }

  /// Sync seats used count.
  /// Called after membership status changes for audit trail.
  /// Does not enforce limits (enforcement happens before mutation).
  /// Currently a no-op; can be extended for analytics/reporting.
  syncSeatsUsed(organizationId: string): Promise<void> {
    void organizationId;
    // Future: Could write to a seats_usage_log table for analytics
    // For now, seat count is derived real-time from membership table
    return Promise.resolve();
  }

  /// Count currently active seats (ACTIVE memberships of real tenant users).
  /// Platform-support ADMIN memberships are excluded — they are not billable
  /// seats and must not block tenant invites (QA-C-03).
  async countActiveSeats(organizationId: string): Promise<number> {
    return this.prisma.membership.count({
      where: {
        organizationId,
        status: "ACTIVE",
        user: { isPlatformAdmin: false },
      },
    });
  }

  /// Get seat summary for an organization.
  /// Returns: used, available (null = unlimited), percentage used.
  async getSeatSummary(organizationId: string): Promise<SeatSummary> {
    const seatsUsed = await this.countActiveSeats(organizationId);
    const limits = await this.featureGate.getPlanLimits(organizationId);

    if (!limits) {
      // No subscription, assume free plan
      const freeLimit = 5;
      return {
        used: seatsUsed,
        available: freeLimit,
        percentageUsed: (seatsUsed / freeLimit) * 100,
        isUnlimited: false,
      };
    }

    if (limits.seats === null) {
      // Unlimited
      return {
        used: seatsUsed,
        available: null,
        percentageUsed: 0,
        isUnlimited: true,
      };
    }

    return {
      used: seatsUsed,
      available: limits.seats,
      percentageUsed: limits.seats > 0 ? (seatsUsed / limits.seats) * 100 : 0,
      isUnlimited: false,
    };
  }
}

export interface SeatSummary {
  used: number;
  available: number | null; // null = unlimited
  percentageUsed: number;
  isUnlimited: boolean;
}
