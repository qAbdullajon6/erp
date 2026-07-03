import { SetMetadata } from "@nestjs/common";
import type { MembershipRole } from "@prisma/client";

export const ROLES_KEY = "roles";

/// Marks a route/controller as requiring one of the given roles. Must be
/// paired with JwtAuthGuard (to populate req.user) and RolesGuard (to
/// enforce this metadata) — see e.g. OrganizationsController.
export const Roles = (...roles: MembershipRole[]) => SetMetadata(ROLES_KEY, roles);
