import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import type { Request } from "express";
import { UsageMetricType } from "@prisma/client";
import { UsageMeteringService } from "../../billing/usage-metering.service";

/// Enforces the plan's `api_requests_per_day` quota on the /v1 third-party
/// surface. Distinct from ApiKeyRateLimitGuard, which caps request BURST
/// (requests/minute, per key, in-process); this caps daily VOLUME against the
/// organization's subscription plan.
///
/// Must run after ApiKeyGuard, which is what puts req.apiKey in place — same
/// ordering requirement as ApiKeyRateLimitGuard.
///
/// This has to be a guard, not the existing ApiUsageMiddleware: that
/// middleware records usage on the response's `finish` event (deliberately —
/// so a usage-analytics write can never fail the request it is observing),
/// which is already too late to block anything. Blocking requires a check
/// before the handler runs.
@Injectable()
export class ApiQuotaGuard implements CanActivate {
  constructor(private readonly usageMetering: UsageMeteringService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const principal = request.apiKey;

    // No key on the request means this guard is stacked on a route
    // ApiKeyGuard did not authenticate — nothing to meter here.
    if (!principal) return true;

    await this.usageMetering.enforceLimit(principal.organizationId, UsageMetricType.API_REQUESTS, 1);
    return true;
  }
}
