import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AiConfig } from "../../config/configuration";

interface Window {
  count: number;
  resetAt: number;
}

const WINDOW_MS = 60 * 60 * 1000;

/// Per-user ceiling on Copilot turns.
///
/// This is a COST control first and an abuse control second. Every turn spends
/// real money at the provider, and a single scripted loop could run a month's
/// budget in an afternoon — the global ThrottlerGuard's 300/min is far too loose
/// for something that costs cents per call.
///
/// Keyed by user, not organization: one person hammering it must not lock out
/// their colleagues.
///
/// In-process, like ApiKeyRateLimitGuard — correct for one instance, and N times
/// looser across N. Same fix, same payoff point; see TD-018.
@Injectable()
export class AiRateLimitService {
  private readonly windows = new Map<string, Window>();
  private lastSweep = Date.now();

  constructor(private readonly config: ConfigService) {}

  private get limit(): number {
    return this.config.getOrThrow<AiConfig>("ai").rateLimitPerHour;
  }

  /// Consumes one turn's budget, throwing 429 when exhausted.
  consume(userId: string): void {
    const now = Date.now();
    this.sweep(now);

    const existing = this.windows.get(userId);

    if (!existing || now >= existing.resetAt) {
      this.windows.set(userId, { count: 1, resetAt: now + WINDOW_MS });
      return;
    }

    if (existing.count >= this.limit) {
      const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
      throw new HttpException(
        `You have reached the AI Copilot limit of ${this.limit} messages per hour. ` +
          `Try again in ${Math.ceil(retryAfterSeconds / 60)} minute(s).`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    existing.count += 1;
  }

  /// What is left, for the UI to warn before the wall rather than at it.
  remaining(userId: string): { remaining: number; resetAt: number } {
    const existing = this.windows.get(userId);
    const now = Date.now();
    if (!existing || now >= existing.resetAt) {
      return { remaining: this.limit, resetAt: now + WINDOW_MS };
    }
    return {
      remaining: Math.max(0, this.limit - existing.count),
      resetAt: existing.resetAt,
    };
  }

  /// Drops expired windows so the map cannot grow without bound as users come
  /// and go. Amortized: at most once per window.
  private sweep(now: number): void {
    if (now - this.lastSweep < WINDOW_MS) return;
    this.lastSweep = now;
    for (const [key, window] of this.windows) {
      if (now >= window.resetAt) this.windows.delete(key);
    }
  }
}
