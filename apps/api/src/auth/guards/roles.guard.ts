import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import type { MembershipRole } from "@prisma/client";
import { ROLES_KEY } from "../decorators/roles.decorator";
import type { CurrentUserPayload } from "../interfaces/current-user.interface";

/// "Role-based access" guard. Must run after JwtAuthGuard (needs req.user
/// already populated). A route with no @Roles(...) decorator is allowed
/// through unchanged — this guard only restricts routes that opt in.
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<MembershipRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: CurrentUserPayload }>();
    const user = request.user;
    if (!user) return false;

    return requiredRoles.includes(user.role);
  }
}
