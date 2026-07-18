import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import type { CurrentCustomerPayload } from "../interfaces/current-customer.interface";

/// Pulls the CurrentCustomerPayload that CustomerJwtAuthGuard/CustomerJwtStrategy
/// attached to the request. Only valid on routes guarded by CustomerJwtAuthGuard.
export const CurrentCustomer = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CurrentCustomerPayload => {
    const request = ctx.switchToHttp().getRequest<Request & { user: CurrentCustomerPayload }>();
    return request.user;
  },
);
