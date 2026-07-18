import { Injectable, Logger, NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { PrismaService } from "../../prisma/prisma.service";

/// Records one ApiUsageRecord per API-key-authenticated request.
///
/// Middleware rather than an interceptor, deliberately. NestJS runs
/// interceptors *after* guards, so an interceptor never sees a request that a
/// guard rejected — which silently excluded every 403 (missing scope) and 429
/// (rate limited) call from the Usage tab. Those are precisely the failures a
/// developer opens that tab to diagnose, so recording only what got past the
/// guards made the feature actively misleading.
///
/// Middleware runs first and hooks `res.on("finish")`, which fires once the
/// response is fully sent no matter who produced it — handler, guard, or
/// exception filter — and so reports the true final status.
///
/// `req.apiKey` is read inside the finish handler, not at entry: the guard
/// populates it during the request, long after this middleware has called
/// next(). A request with no apiKey at finish time was never authenticated
/// (a bogus or missing key) and belongs to no organization, so there is
/// nothing to attribute and it is skipped.
///
/// Every write is fire-and-forget and swallowed on failure: usage is
/// analytics, and a metering outage must never become a customer-visible API
/// failure.
@Injectable()
export class ApiUsageMiddleware implements NestMiddleware {
  private readonly logger = new Logger(ApiUsageMiddleware.name);

  constructor(private readonly prisma: PrismaService) {}

  use(request: Request, response: Response, next: NextFunction): void {
    const startedAt = Date.now();

    response.on("finish", () => {
      const principal = request.apiKey;
      if (!principal) return;

      this.prisma.apiUsageRecord
        .create({
          data: {
            organizationId: principal.organizationId,
            apiKeyId: principal.apiKeyId,
            endpoint: routeTemplate(request),
            method: request.method,
            statusCode: response.statusCode,
            durationMs: Date.now() - startedAt,
          },
        })
        .catch((err: Error) => {
          this.logger.warn(
            `Failed to record API usage for ${request.method} ${request.path}: ${err.message}`,
          );
        });
    });

    next();
  }
}

/// The matched route pattern (e.g. "/v1/orders/:id"), never the concrete path.
/// Recording real paths would put customer ids into the analytics table and
/// make endpointBreakdown unbounded — one row per id rather than per route.
///
/// `route` is populated by Express once a handler matches. It is absent when
/// nothing matched (404) or when a guard rejected before routing resolved, so
/// request.path is the fallback.
function routeTemplate(request: Request): string {
  const route: unknown = (request as { route?: unknown }).route;
  if (typeof route === "object" && route !== null && "path" in route) {
    const path: unknown = route.path;
    if (typeof path === "string") return path;
  }
  return request.path;
}
