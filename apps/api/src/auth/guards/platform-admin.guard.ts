import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import type { Request } from "express";
import type { CurrentUserPayload } from "../interfaces/current-user.interface";

/// Gate for platform-wide data that belongs to no organization — currently the
/// Lead pipeline from the marketing site.
///
/// RolesGuard is not enough here. It checks MembershipRole, which is always
/// scoped to a single customer organization, and Lead rows carry no
/// organizationId at all (a demo request arrives before any organization
/// exists). Gating GET /leads on @Roles("ADMIN") would therefore let every
/// customer's admin read every other company's demo request.
///
/// Must run after JwtAuthGuard, which populates `req.user`.
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { user?: CurrentUserPayload }>();
    return request.user?.isPlatformAdmin === true;
  }
}
