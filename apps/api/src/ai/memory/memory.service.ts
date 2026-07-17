import { Injectable } from "@nestjs/common";
import type { AiMemoryKind } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import type { CurrentUserPayload } from "../../auth/interfaces/current-user.interface";

/// Caps per kind, so memory cannot grow into the whole context window.
/// PINNED is deliberately the smallest budget and the highest priority: it is
/// the only kind the user explicitly asked for.
const LIMITS: Record<AiMemoryKind, number> = {
  PINNED: 10,
  PREFERENCE: 10,
  ENTITY_REFERENCE: 8,
  SUMMARY: 3,
};

const MAX_CONTENT_CHARS = 500;

/// What the assistant carries between turns.
///
/// Scoped by (organization, user) — never by organization alone. Two colleagues
/// at the same company have different roles and different visible data, so one
/// person's remembered "my usual customer is ACME" must never surface in the
/// other's context. The composite index is on (organizationId, userId, kind)
/// for exactly that reason.
@Injectable()
export class MemoryService {
  constructor(private readonly prisma: PrismaService) {}

  /// Records a fact.
  ///
  /// Upserts on content rather than appending: a user who says "always use EUR"
  /// three times should have one preference, not three copies eating the budget.
  async remember(
    actor: CurrentUserPayload,
    params: {
      kind: AiMemoryKind;
      content: string;
      conversationId?: string;
      entityType?: string;
      entityId?: string;
    },
  ) {
    const content = params.content.trim().slice(0, MAX_CONTENT_CHARS);
    if (!content) return null;

    const existing = await this.prisma.aiMemory.findFirst({
      where: {
        organizationId: actor.organizationId,
        userId: actor.userId,
        kind: params.kind,
        content,
        conversationId: params.conversationId ?? null,
      },
      select: { id: true },
    });

    if (existing) {
      return this.prisma.aiMemory.update({
        where: { id: existing.id },
        data: { updatedAt: new Date() },
      });
    }

    const created = await this.prisma.aiMemory.create({
      data: {
        organizationId: actor.organizationId,
        userId: actor.userId,
        conversationId: params.conversationId ?? null,
        kind: params.kind,
        content,
        entityType: params.entityType ?? null,
        entityId: params.entityId ?? null,
      },
    });

    await this.evict(actor, params.kind, params.conversationId);
    return created;
  }

  /// Drops the oldest entries once a kind exceeds its budget.
  ///
  /// Oldest-first, not least-used: tracking usage would need a write on every
  /// prompt build, and recency is a good enough proxy for a list this short.
  /// PINNED is never evicted — the user asked for it explicitly, and silently
  /// forgetting something they pinned is worse than refusing to pin more.
  private async evict(
    actor: CurrentUserPayload,
    kind: AiMemoryKind,
    conversationId?: string,
  ): Promise<void> {
    if (kind === "PINNED") return;

    const limit = LIMITS[kind];
    const rows = await this.prisma.aiMemory.findMany({
      where: {
        organizationId: actor.organizationId,
        userId: actor.userId,
        kind,
        ...(conversationId ? { conversationId } : {}),
      },
      orderBy: { updatedAt: "desc" },
      select: { id: true },
      skip: limit,
    });

    if (rows.length > 0) {
      await this.prisma.aiMemory.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
    }
  }

  /// The memories that should shape this turn: the user's cross-conversation
  /// preferences and pins, plus anything specific to this thread.
  async forPrompt(actor: CurrentUserPayload, conversationId: string) {
    return this.prisma.aiMemory.findMany({
      where: {
        organizationId: actor.organizationId,
        userId: actor.userId,
        OR: [
          // Global to this user: preferences and pins follow them between threads.
          { conversationId: null },
          // Specific to this thread: entity references and summaries.
          { conversationId },
        ],
      },
      orderBy: [{ kind: "asc" }, { updatedAt: "desc" }],
      take: 25,
    });
  }

  /// Renders memory for the prompt, grouped so the model can weigh a pin
  /// differently from a passing entity reference.
  render(memories: Array<{ kind: AiMemoryKind; content: string }>): string | undefined {
    if (memories.length === 0) return undefined;

    const byKind = new Map<AiMemoryKind, string[]>();
    for (const memory of memories) {
      const list = byKind.get(memory.kind) ?? [];
      list.push(memory.content);
      byKind.set(memory.kind, list);
    }

    const sections: string[] = [];
    const label: Record<AiMemoryKind, string> = {
      PINNED: "Pinned by the user (always relevant)",
      PREFERENCE: "Their stated preferences",
      ENTITY_REFERENCE: "Records this conversation has been about",
      SUMMARY: "Earlier in this conversation",
    };

    for (const kind of ["PINNED", "PREFERENCE", "SUMMARY", "ENTITY_REFERENCE"] as AiMemoryKind[]) {
      const items = byKind.get(kind);
      if (!items?.length) continue;
      sections.push(`${label[kind]}:`);
      for (const item of items) sections.push(`- ${item}`);
    }

    return sections.length > 0 ? sections.join("\n") : undefined;
  }

  async list(actor: CurrentUserPayload) {
    const memories = await this.prisma.aiMemory.findMany({
      where: { organizationId: actor.organizationId, userId: actor.userId },
      orderBy: { updatedAt: "desc" },
      take: 100,
    });
    return memories.map((m) => ({
      id: m.id,
      kind: m.kind,
      content: m.content,
      conversationId: m.conversationId,
      entityType: m.entityType,
      entityId: m.entityId,
      createdAt: m.createdAt.toISOString(),
      updatedAt: m.updatedAt.toISOString(),
    }));
  }

  /// Scoped by user, not just id: one user must not be able to delete another's
  /// memory by guessing a uuid.
  async forget(actor: CurrentUserPayload, id: string): Promise<boolean> {
    const deleted = await this.prisma.aiMemory.deleteMany({
      where: { id, organizationId: actor.organizationId, userId: actor.userId },
    });
    return deleted.count > 0;
  }

  /// Records which entities a turn touched, so a follow-up like "assign him to
  /// it" has referents. Called by the orchestrator after tools run.
  async rememberEntities(
    actor: CurrentUserPayload,
    conversationId: string,
    entities: Array<{ entityType: string; entityId: string; label: string }>,
  ): Promise<void> {
    for (const entity of entities.slice(0, 5)) {
      await this.remember(actor, {
        kind: "ENTITY_REFERENCE",
        conversationId,
        content: `${entity.entityType}: ${entity.label} (id ${entity.entityId})`,
        entityType: entity.entityType,
        entityId: entity.entityId,
      });
    }
  }
}
