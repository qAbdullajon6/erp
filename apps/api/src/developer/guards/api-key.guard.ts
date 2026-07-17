import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { PrismaService } from "../../prisma/prisma.service";
import { extractApiKey, hashApiKey, isApiKeyExpired, timingSafeKeyEquals } from "../api-keys/api-key.util";
import { API_KEY_SCOPES_KEY } from "../decorators/api-key-scopes.decorator";

/// What an API-key-authenticated request carries, in place of the
/// CurrentUserPayload a session request would have. Deliberately a distinct
/// shape: there is no user behind an API key, and code that needs a real
/// actor must not silently read a machine identity as one.
export interface ApiKeyPrincipal {
  apiKeyId: string;
  organizationId: string;
  scopes: string[];
  name: string;
  rateLimitPerMinute: number;
}

declare module "express" {
  interface Request {
    apiKey?: ApiKeyPrincipal;
  }
}

/// Authenticates a request bearing an API key, via either
/// `Authorization: Bearer flowerp_live_...` or `X-API-Key: ...`.
///
/// The lookup is by hash, not by prefix: the prefix is not unique and is not
/// a secret, so matching on it would be an enumeration surface. The stored
/// hash is compared again in constant time even though the DB already matched
/// it — the index lookup is an equality test the DB may short-circuit, and
/// this makes the decisive comparison timing-independent regardless.
///
/// Every rejection path returns the same generic message. A caller must not
/// be able to tell "no such key" from "revoked" from "expired": that
/// difference is exactly what tells an attacker which stolen key is worth
/// pursuing.
@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    const rawKey = extractApiKey(request.headers);
    if (!rawKey) {
      throw new UnauthorizedException("API key required");
    }

    const keyHash = hashApiKey(rawKey);
    const key = await this.prisma.apiKey.findUnique({
      where: { keyHash },
      include: { organization: { select: { id: true, status: true, deletedAt: true } } },
    });

    if (!key || !timingSafeKeyEquals(key.keyHash, keyHash)) {
      throw new UnauthorizedException("Invalid API key");
    }

    if (key.status !== "ACTIVE") {
      throw new UnauthorizedException("Invalid API key");
    }

    if (isApiKeyExpired(key.expiresAt)) {
      throw new UnauthorizedException("Invalid API key");
    }

    // A key must not outlive its tenant. Without this, a key minted before an
    // organization was suspended or soft-deleted would keep serving that
    // organization's data.
    if (key.organization.status !== "ACTIVE" || key.organization.deletedAt) {
      throw new UnauthorizedException("Invalid API key");
    }

    // Authentication is now settled — attach the principal BEFORE the scope
    // check, which is authorization. Two reasons this order matters:
    //  1. A 403 is a request by a known key. Attaching only on full success
    //     made scope-denied calls unattributable, so ApiUsageMiddleware could
    //     not record them and the Usage tab hid the very failures a developer
    //     opens it to find.
    //  2. ApiKeyRateLimitGuard runs after this one and meters req.apiKey; a
    //     caller must not be able to dodge their rate limit by hammering a
    //     route their key lacks the scope for.
    request.apiKey = {
      apiKeyId: key.id,
      organizationId: key.organizationId,
      scopes: key.scopes,
      name: key.name,
      rateLimitPerMinute: key.rateLimitPerMinute,
    };

    const required = this.reflector.getAllAndOverride<string[]>(API_KEY_SCOPES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (required && required.length > 0) {
      const missing = required.filter((scope) => !key.scopes.includes(scope));
      if (missing.length > 0) {
        // Scope failures are safe to describe: the caller already proved they
        // hold this key, so telling them what it lacks reveals nothing they
        // could not read off their own dashboard, and saves a support ticket.
        throw new ForbiddenException(
          `API key is missing required scope(s): ${missing.join(", ")}`,
        );
      }
    }

    // Fire-and-forget: lastUsedAt is telemetry, and a write failure here must
    // never fail an otherwise-valid API call. Not awaited so the caller does
    // not pay a round-trip for a field nothing in this request path reads.
    this.prisma.apiKey
      .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
      .catch((err: Error) => {
        this.logger.warn(`Failed to record lastUsedAt for key ${key.id}: ${err.message}`);
      });

    return true;
  }
}
