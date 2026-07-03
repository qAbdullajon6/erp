import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import type { CurrentUserPayload } from "../interfaces/current-user.interface";

/// Pulls the CurrentUserPayload that JwtAuthGuard/JwtStrategy attached to
/// the request. Only valid on routes guarded by JwtAuthGuard.
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CurrentUserPayload => {
    const request = ctx.switchToHttp().getRequest<Request & { user: CurrentUserPayload }>();
    return request.user;
  },
);
