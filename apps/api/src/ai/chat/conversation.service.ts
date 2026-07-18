import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, type AiMessageRole } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import type { CurrentUserPayload } from "../../auth/interfaces/current-user.interface";
import type { LlmMessage } from "../providers/llm-provider.interface";

/// How many past turns are replayed into the prompt.
///
/// A cap is mandatory, not an optimisation: without one, the hundredth message
/// in a thread sends ninety-nine predecessors and either blows the context
/// window or costs a fortune to say "yes". Older turns are not lost — they stay
/// in the database and are visible in the UI; they simply stop being re-sent.
const HISTORY_TURNS = 20;

@Injectable()
export class ConversationService {
  constructor(private readonly prisma: PrismaService) {}

  /// Loads a conversation the caller owns.
  ///
  /// Scoped by BOTH organizationId and userId. A conversation is private to the
  /// person who had it — it can contain anything they were allowed to ask, and
  /// a colleague with a different role may not be allowed to see it. Scoping by
  /// organization alone would make every admin's chat readable by every other
  /// admin, which is not what "my assistant" means.
  async findOwned(actor: CurrentUserPayload, id: string) {
    const conversation = await this.prisma.aiConversation.findFirst({
      where: {
        id,
        organizationId: actor.organizationId,
        userId: actor.userId,
        deletedAt: null,
      },
    });
    if (!conversation) throw new NotFoundException("Conversation not found");
    return conversation;
  }

  async create(
    actor: CurrentUserPayload,
    params: { title?: string; provider: string; model: string; readOnly?: boolean },
  ) {
    return this.prisma.aiConversation.create({
      data: {
        organizationId: actor.organizationId,
        userId: actor.userId,
        // Renamed from the first user message once there is one — see
        // maybeAutoTitle. "New conversation" is only ever seen for the instant
        // between creating a thread and sending into it.
        title: params.title?.trim().slice(0, 200) || "New conversation",
        provider: params.provider,
        model: params.model,
        readOnly: params.readOnly ?? false,
      },
    });
  }

  async list(
    actor: CurrentUserPayload,
    query: { page?: number; limit?: number; search?: string; status?: string; pinned?: boolean },
  ) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 50);

    const where: Prisma.AiConversationWhereInput = {
      organizationId: actor.organizationId,
      userId: actor.userId,
      deletedAt: null,
      ...(query.status ? { status: query.status as never } : {}),
      ...(query.pinned !== undefined ? { pinned: query.pinned } : {}),
      ...(query.search
        ? {
            // Title OR message body: a user searching "ACME" remembers what they
            // asked, not what they called the thread.
            OR: [
              { title: { contains: query.search, mode: "insensitive" } },
              {
                messages: {
                  some: {
                    content: { contains: query.search, mode: "insensitive" },
                    // Only their own words and the answers — not the system
                    // prompt or raw tool payloads, which would match on
                    // internals and confuse the result list.
                    role: { in: ["USER", "ASSISTANT"] },
                  },
                },
              },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.aiConversation.findMany({
        where,
        // Pinned first, then most recent. Matches how the list reads.
        orderBy: [{ pinned: "desc" }, { lastMessageAt: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.aiConversation.count({ where }),
    ]);

    return {
      items: items.map((c) => this.toSummary(c)),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async messages(actor: CurrentUserPayload, conversationId: string) {
    await this.findOwned(actor, conversationId);

    const messages = await this.prisma.aiMessage.findMany({
      where: {
        conversationId,
        // SYSTEM turns are internal scaffolding; showing them would leak the
        // prompt into the UI. TOOL turns are raw JSON — the tool CALLS are
        // surfaced instead, attached to the assistant turn that made them.
        role: { in: ["USER", "ASSISTANT"] },
      },
      orderBy: { createdAt: "asc" },
      include: {
        toolCalls: {
          select: { id: true, toolName: true, status: true, durationMs: true, error: true },
        },
      },
    });

    return messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      model: m.model,
      filtered: m.filtered,
      finishReason: m.finishReason,
      promptTokens: m.promptTokens,
      completionTokens: m.completionTokens,
      latencyMs: m.latencyMs,
      createdAt: m.createdAt.toISOString(),
      // What the assistant DID, not just what it said. This is what makes a
      // tool-using answer auditable from the UI.
      toolCalls: m.toolCalls.map((t) => ({
        id: t.id,
        name: t.toolName,
        status: t.status,
        durationMs: t.durationMs,
        error: t.error,
      })),
    }));
  }

  /// The turns to replay into the prompt, oldest-first.
  ///
  /// Includes TOOL turns and the assistant's tool_calls: without them the model
  /// sees its own past answer with no evidence for it, and either repeats the
  /// tool call or, worse, invents what the result must have been.
  async historyForPrompt(conversationId: string): Promise<LlmMessage[]> {
    const messages = await this.prisma.aiMessage.findMany({
      where: { conversationId, role: { not: "SYSTEM" } },
      orderBy: { createdAt: "desc" },
      take: HISTORY_TURNS,
      include: {
        toolCalls: { select: { id: true, toolName: true, arguments: true, result: true } },
      },
    });

    const out: LlmMessage[] = [];

    // Reversed: fetched newest-first to apply the cap, replayed oldest-first
    // because that is the order a conversation happened in.
    for (const message of messages.reverse()) {
      if (message.role === "TOOL") {
        out.push({
          role: "tool",
          content: message.content ?? "",
          toolCallId: message.toolCallId ?? undefined,
        });
        continue;
      }

      if (message.role === "ASSISTANT" && message.toolCalls.length > 0) {
        out.push({
          role: "assistant",
          content: message.content,
          toolCalls: message.toolCalls.map((t) => ({
            id: t.id,
            name: t.toolName,
            arguments: (t.arguments ?? {}) as Record<string, unknown>,
          })),
        });
        continue;
      }

      out.push({
        role: message.role === "USER" ? "user" : "assistant",
        content: message.content ?? "",
      });
    }

    return out;
  }

  async addMessage(params: {
    conversationId: string;
    organizationId: string;
    role: AiMessageRole;
    content: string | null;
    model?: string;
    toolCallId?: string;
    promptTokens?: number;
    completionTokens?: number;
    latencyMs?: number;
    finishReason?: string;
    filtered?: boolean;
  }) {
    return this.prisma.aiMessage.create({
      data: {
        conversationId: params.conversationId,
        organizationId: params.organizationId,
        role: params.role,
        content: params.content,
        model: params.model,
        toolCallId: params.toolCallId,
        promptTokens: params.promptTokens,
        completionTokens: params.completionTokens,
        latencyMs: params.latencyMs,
        finishReason: params.finishReason,
        filtered: params.filtered ?? false,
      },
    });
  }

  /// Adds a turn's token cost to the thread's running totals.
  ///
  /// Incremented rather than derived, unlike the import counters: usage is
  /// append-only (a message is never re-billed), there is no resume path to
  /// double-count, and summing every message on each conversation-list row
  /// would be an N+1 over the whole list.
  async recordUsage(
    conversationId: string,
    usage: { promptTokens: number; completionTokens: number },
  ): Promise<void> {
    await this.prisma.aiConversation.update({
      where: { id: conversationId },
      data: {
        promptTokens: { increment: usage.promptTokens },
        completionTokens: { increment: usage.completionTokens },
        lastMessageAt: new Date(),
      },
    });
  }

  /// Names a thread after its first user message.
  ///
  /// Locally, from the message itself — NOT by asking the model. A title is not
  /// worth a second round trip, its latency, or its cost, and a truncated first
  /// question is what the user recognises in a list anyway.
  async maybeAutoTitle(conversationId: string, firstMessage: string): Promise<void> {
    const conversation = await this.prisma.aiConversation.findUnique({
      where: { id: conversationId },
      select: { title: true },
    });
    if (conversation?.title !== "New conversation") return;

    const title = firstMessage.replace(/\s+/g, " ").trim().slice(0, 60);
    if (!title) return;

    await this.prisma.aiConversation.update({
      where: { id: conversationId },
      data: { title: title.length === 60 ? `${title}…` : title },
    });
  }

  async rename(actor: CurrentUserPayload, id: string, title: string) {
    await this.findOwned(actor, id);
    const updated = await this.prisma.aiConversation.update({
      where: { id },
      data: { title: title.trim().slice(0, 200) },
    });
    return this.toSummary(updated);
  }

  async setPinned(actor: CurrentUserPayload, id: string, pinned: boolean) {
    await this.findOwned(actor, id);
    const updated = await this.prisma.aiConversation.update({ where: { id }, data: { pinned } });
    return this.toSummary(updated);
  }

  async setStatus(actor: CurrentUserPayload, id: string, status: "ACTIVE" | "ARCHIVED") {
    await this.findOwned(actor, id);
    const updated = await this.prisma.aiConversation.update({ where: { id }, data: { status } });
    return this.toSummary(updated);
  }

  /// Soft delete.
  ///
  /// An AI conversation is a record of what someone asked the system to do —
  /// including the tool calls that changed real data. Hard-deleting it would
  /// destroy the only human-readable account of why an order exists, so the row
  /// stays and the audit trail with it.
  async softDelete(actor: CurrentUserPayload, id: string): Promise<void> {
    await this.findOwned(actor, id);
    await this.prisma.aiConversation.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  private toSummary(c: {
    id: string;
    title: string;
    status: string;
    pinned: boolean;
    readOnly: boolean;
    provider: string;
    model: string;
    promptTokens: number;
    completionTokens: number;
    createdAt: Date;
    updatedAt: Date;
    lastMessageAt: Date;
  }) {
    return {
      id: c.id,
      title: c.title,
      status: c.status,
      pinned: c.pinned,
      readOnly: c.readOnly,
      provider: c.provider,
      model: c.model,
      promptTokens: c.promptTokens,
      completionTokens: c.completionTokens,
      totalTokens: c.promptTokens + c.completionTokens,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      lastMessageAt: c.lastMessageAt.toISOString(),
    };
  }
}
