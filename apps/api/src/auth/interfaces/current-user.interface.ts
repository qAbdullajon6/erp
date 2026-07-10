import type { MembershipRole } from "@prisma/client";

/// What's attached to `req.user` after JwtAuthGuard runs — always freshly
/// derived from the database (see JwtStrategy), never taken verbatim from
/// the token's claims beyond `sub`/`mid`.
export interface CurrentUserPayload {
  userId: string;
  membershipId: string;
  organizationId: string;
  role: MembershipRole;
  email: string;
  /// FlowERP staff. Orthogonal to `role`, which is always scoped to one
  /// customer organization. See User.isPlatformAdmin in schema.prisma.
  isPlatformAdmin: boolean;
}
