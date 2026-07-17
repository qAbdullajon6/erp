import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from "@nestjs/common";
import type { Request, Response } from "express";

interface WindowState {
  count: number;
  /// Epoch ms at which this window resets.
  resetAt: number;
}

const WINDOW_MS = 60_000;

/// Per-key request ceiling over a rolling 60-second window, using the limit
/// stored on each key (ApiKey.rateLimitPerMinute), so a customer can be given
/// a higher ceiling without a deploy.
///
/// Deliberately in-process. That is correct for a single API instance and
/// honest about its limit: across N instances a key effectively gets N times
/// its ceiling. Moving this to a shared store (Redis) is the known
/// prerequisite for running more than one instance — recorded in
/// TECHNICAL_DEBT.md rather than pretended away here.
///
/// Must run after ApiKeyGuard, which is what puts req.apiKey in place.
@Injectable()
export class ApiKeyRateLimitGuard implements CanActivate {
  private readonly windows = new Map<string, WindowState>();
  private lastSweep = Date.now();

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const principal = request.apiKey;

    // No key on the request means this guard is stacked on a route that
    // ApiKeyGuard did not authenticate. Nothing to meter; defer to whatever
    // guard did authenticate it.
    if (!principal) return true;

    const now = Date.now();
    this.sweepExpired(now);

    const response = context.switchToHttp().getResponse<Response>();
    const existing = this.windows.get(principal.apiKeyId);

    if (!existing || now >= existing.resetAt) {
      const resetAt = now + WINDOW_MS;
      this.windows.set(principal.apiKeyId, { count: 1, resetAt });
      this.setLimitHeaders(response, principal.rateLimitPerMinute, principal.rateLimitPerMinute - 1, resetAt);
      return true;
    }

    if (existing.count >= principal.rateLimitPerMinute) {
      const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));

      // Retry-After is a response HEADER, not a body field, and deliberately
      // so: AllExceptionsFilter normalizes every error body to
      // {error:{statusCode,message}}, so a retryAfter stuffed into the body is
      // silently dropped before the client ever sees it. The header is also
      // the standard clients already look for (RFC 9110 §10.2.3).
      this.setLimitHeaders(response, principal.rateLimitPerMinute, 0, existing.resetAt);
      response.setHeader("Retry-After", String(retryAfterSeconds));

      throw new HttpException(
        `Rate limit exceeded: ${principal.rateLimitPerMinute} requests per minute. Retry after ${retryAfterSeconds}s.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    existing.count += 1;
    this.setLimitHeaders(
      response,
      principal.rateLimitPerMinute,
      principal.rateLimitPerMinute - existing.count,
      existing.resetAt,
    );
    return true;
  }

  /// The conventional X-RateLimit-* trio, on every metered response rather
  /// than only on a 429 — a client should be able to back off *before* it is
  /// rejected, which it cannot do if the budget is only revealed by failing.
  private setLimitHeaders(
    response: Response,
    limit: number,
    remaining: number,
    resetAt: number,
  ): void {
    response.setHeader("X-RateLimit-Limit", String(limit));
    response.setHeader("X-RateLimit-Remaining", String(Math.max(0, remaining)));
    response.setHeader("X-RateLimit-Reset", String(Math.ceil(resetAt / 1000)));
  }

  /// Drops windows that have already reset, so the map cannot grow without
  /// bound as keys come and go. Amortized: at most once per window, and only
  /// on a request that was going to walk the map anyway.
  private sweepExpired(now: number): void {
    if (now - this.lastSweep < WINDOW_MS) return;
    this.lastSweep = now;

    for (const [keyId, state] of this.windows) {
      if (now >= state.resetAt) this.windows.delete(keyId);
    }
  }
}
