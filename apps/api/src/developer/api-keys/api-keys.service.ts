import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { ApiKey } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../audit/audit.service";
import type { CurrentUserPayload } from "../../auth/interfaces/current-user.interface";
import { generateApiKey } from "./api-key.util";
import type { CreateApiKeyDto, UpdateApiKeyDto } from "./dto/api-key.dto";

/// The shape returned to clients. Deliberately built by an explicit mapper
/// rather than returning the Prisma row: keyHash must never leave this
/// service, and a spread would leak it the moment a column is added.
export interface ApiKeyResponse {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  status: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  rateLimitPerMinute: number;
  createdAt: string;
  /// Present only on the create and rotate responses — the one and only time
  /// the secret is visible.
  rawKey?: string;
}

@Injectable()
export class ApiKeysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /// Never includes keyHash, and never includes rawKey unless explicitly
  /// passed one by the mint path.
  private toResponse(key: ApiKey, rawKey?: string): ApiKeyResponse {
    return {
      id: key.id,
      name: key.name,
      keyPrefix: key.keyPrefix,
      scopes: key.scopes,
      status: key.status,
      expiresAt: key.expiresAt?.toISOString() ?? null,
      lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
      rateLimitPerMinute: key.rateLimitPerMinute,
      createdAt: key.createdAt.toISOString(),
      ...(rawKey ? { rawKey } : {}),
    };
  }

  /// Revoked keys stay listed: an operator needs to see that a key they are
  /// hunting for is already dead, and hiding it invites re-revoking a
  /// different key by mistake.
  async list(organizationId: string): Promise<{ items: ApiKeyResponse[] }> {
    const keys = await this.prisma.apiKey.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
    });
    return { items: keys.map((k) => this.toResponse(k)) };
  }

  private async findOrThrow(organizationId: string, id: string): Promise<ApiKey> {
    const key = await this.prisma.apiKey.findFirst({ where: { id, organizationId } });
    if (!key) throw new NotFoundException("API key not found");
    return key;
  }

  async create(
    actor: CurrentUserPayload,
    dto: CreateApiKeyDto,
  ): Promise<ApiKeyResponse> {
    const generated = generateApiKey();

    const key = await this.prisma.apiKey.create({
      data: {
        organizationId: actor.organizationId,
        name: dto.name,
        keyPrefix: generated.keyPrefix,
        keyHash: generated.keyHash,
        scopes: dto.scopes,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        rateLimitPerMinute: dto.rateLimitPerMinute ?? 120,
        createdByUserId: actor.userId,
      },
    });

    // The audit trail records that a key was minted and which scopes it got —
    // never the secret, and never anything that narrows it.
    await this.audit.log({
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      action: "api_key.create",
      entityType: "ApiKey",
      entityId: key.id,
      metadata: { name: key.name, scopes: key.scopes, keyPrefix: key.keyPrefix },
    });

    return this.toResponse(key, generated.rawKey);
  }

  async update(
    actor: CurrentUserPayload,
    id: string,
    dto: UpdateApiKeyDto,
  ): Promise<ApiKeyResponse> {
    const existing = await this.findOrThrow(actor.organizationId, id);
    if (existing.status === "REVOKED") {
      throw new ConflictException("Cannot modify a revoked API key");
    }

    const key = await this.prisma.apiKey.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.scopes !== undefined ? { scopes: dto.scopes } : {}),
        ...(dto.rateLimitPerMinute !== undefined
          ? { rateLimitPerMinute: dto.rateLimitPerMinute }
          : {}),
      },
    });

    await this.audit.log({
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      action: "api_key.update",
      entityType: "ApiKey",
      entityId: key.id,
      metadata: { name: key.name, scopes: key.scopes },
    });

    return this.toResponse(key);
  }

  /// Revocation is terminal and irreversible — the key is dead the instant
  /// this returns. `enable` deliberately cannot resurrect it; that is what
  /// DISABLED exists for.
  async revoke(actor: CurrentUserPayload, id: string): Promise<ApiKeyResponse> {
    const existing = await this.findOrThrow(actor.organizationId, id);
    if (existing.status === "REVOKED") {
      // Idempotent: re-revoking an already-dead key is not an error, it is
      // the caller getting the state they asked for.
      return this.toResponse(existing);
    }

    const key = await this.prisma.apiKey.update({
      where: { id },
      data: { status: "REVOKED", revokedAt: new Date() },
    });

    await this.audit.log({
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      action: "api_key.revoke",
      entityType: "ApiKey",
      entityId: key.id,
      metadata: { name: key.name, keyPrefix: key.keyPrefix },
    });

    return this.toResponse(key);
  }

  /// Reversible pause. Unlike revoke, the same secret works again after
  /// `enable` — this is for "turn the integration off while we debug it".
  async setEnabled(
    actor: CurrentUserPayload,
    id: string,
    enabled: boolean,
  ): Promise<ApiKeyResponse> {
    const existing = await this.findOrThrow(actor.organizationId, id);
    if (existing.status === "REVOKED") {
      throw new ConflictException("Cannot enable or disable a revoked API key");
    }

    const key = await this.prisma.apiKey.update({
      where: { id },
      data: { status: enabled ? "ACTIVE" : "DISABLED" },
    });

    await this.audit.log({
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      action: enabled ? "api_key.enable" : "api_key.disable",
      entityType: "ApiKey",
      entityId: key.id,
      metadata: { name: key.name },
    });

    return this.toResponse(key);
  }

  /// Mints a fresh secret onto the same key row, so the integration's
  /// identity, scopes and usage history survive while the old secret dies.
  /// The previous secret stops working immediately — there is deliberately no
  /// grace window, because a rotation is usually a response to a leak.
  async rotate(actor: CurrentUserPayload, id: string): Promise<ApiKeyResponse> {
    const existing = await this.findOrThrow(actor.organizationId, id);
    if (existing.status === "REVOKED") {
      throw new ConflictException("Cannot rotate a revoked API key");
    }

    const generated = generateApiKey();
    const key = await this.prisma.apiKey.update({
      where: { id },
      data: {
        keyPrefix: generated.keyPrefix,
        keyHash: generated.keyHash,
        // A rotation clears the usage marker: lastUsedAt now means "last used
        // with the current secret", which is the question an operator
        // verifying a rollout is actually asking.
        lastUsedAt: null,
      },
    });

    await this.audit.log({
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      action: "api_key.rotate",
      entityType: "ApiKey",
      entityId: key.id,
      metadata: { name: key.name, keyPrefix: key.keyPrefix },
    });

    return this.toResponse(key, generated.rawKey);
  }
}
