import { Injectable } from "@nestjs/common";
import type { MembershipStatus } from "@prisma/client";

/// Seat-limit enforcement for invitations and membership reactivation.
///
/// InvitationService and OrganizationsService both depend on this, but there
/// is no plan/subscription/seat-limit model in the schema yet (see
/// Organization in schema.prisma — id, name, slug, defaultCurrency, timezone,
/// nothing billing-related). Until that model exists there is nothing for a
/// seat limit to be checked against, so every assertion here is a deliberate
/// no-op rather than an invented enforcement rule: the current, real product
/// behavior is "unlimited seats," and these methods preserve exactly that
/// while satisfying the dependency both services already declare.
///
/// Replace the bodies (not the shape — InvitationService and
/// OrganizationsService already call these exact three methods) once a real
/// billing/plan model lands.
@Injectable()
export class BillingSeatsService {
  async assertCanAddSeat(_organizationId: string): Promise<void> {
    // No seat limit exists to violate yet.
  }

  async assertCanActivateMembership(
    _organizationId: string,
    _membershipId: string,
    _status: MembershipStatus | undefined,
  ): Promise<void> {
    // No seat limit exists to violate yet.
  }

  async syncSeatsUsed(_organizationId: string): Promise<void> {
    // Nothing to reconcile against yet.
  }
}
