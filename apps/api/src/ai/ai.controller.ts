import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RawResponse } from "../common/decorators/raw-response.decorator";
import type { CurrentUserPayload } from "../auth/interfaces/current-user.interface";
import { AiService } from "./ai.service";
import { ConversationService } from "./chat/conversation.service";
import { MemoryService } from "./memory/memory.service";
import { ProviderFactory } from "./providers/provider.factory";
import {
  CreateConversationDto,
  ListConversationsQueryDto,
  RememberDto,
  RenameConversationDto,
  SendMessageDto,
  SetPinnedDto,
  SetStatusDto,
} from "./dto/ai.dto";

/// Every staff role reaches the module; DRIVER is refused inside the service
/// (AiService.assertAllowed) rather than here, so the refusal carries a message
/// explaining why instead of a bare 403 from a guard.
@Controller("ai")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ADMIN", "OPERATIONS_MANAGER", "DISPATCHER", "ACCOUNTANT", "SALES_CRM_MANAGER", "DRIVER")
export class AiController {
  constructor(
    private readonly ai: AiService,
    private readonly conversations: ConversationService,
    private readonly memory: MemoryService,
    private readonly providers: ProviderFactory,
  ) {}

  /// What this user's Copilot can do. The UI calls this first and renders from
  /// it, so it never offers a model or a starter prompt that would then fail.
  @Get("capabilities")
  capabilities(@CurrentUser() user: CurrentUserPayload) {
    return this.ai.capabilities(user);
  }

  /// Whether the Copilot is usable at all. Deliberately separate from
  /// capabilities: this answers the operator's question ("is my key wired up"),
  /// and does so without touching the database.
  @Get("health")
  health() {
    return {
      configured: this.providers.isConfigured(),
      provider: this.providers.isConfigured() ? this.providers.get().name : null,
      configuredProviders: this.providers.listConfigured(),
    };
  }

  // ── Conversations ───────────────────────────────────────────────

  @Post("conversations")
  createConversation(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateConversationDto,
  ) {
    this.ai.assertAllowed(user);
    return this.conversations.create(user, {
      title: dto.title,
      provider: this.providers.get().name,
      model: this.providers.resolveModel(dto.model),
      readOnly: dto.readOnly,
    });
  }

  @Get("conversations")
  listConversations(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: ListConversationsQueryDto,
  ) {
    this.ai.assertAllowed(user);
    return this.conversations.list(user, query);
  }

  @Get("conversations/:id")
  async getConversation(
    @CurrentUser() user: CurrentUserPayload,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    this.ai.assertAllowed(user);
    const conversation = await this.conversations.findOwned(user, id);
    return {
      id: conversation.id,
      title: conversation.title,
      status: conversation.status,
      pinned: conversation.pinned,
      readOnly: conversation.readOnly,
      provider: conversation.provider,
      model: conversation.model,
      promptTokens: conversation.promptTokens,
      completionTokens: conversation.completionTokens,
      totalTokens: conversation.promptTokens + conversation.completionTokens,
      createdAt: conversation.createdAt.toISOString(),
      lastMessageAt: conversation.lastMessageAt.toISOString(),
      messages: await this.conversations.messages(user, id),
    };
  }

  @Patch("conversations/:id")
  rename(
    @CurrentUser() user: CurrentUserPayload,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: RenameConversationDto,
  ) {
    return this.conversations.rename(user, id, dto.title);
  }

  @Post("conversations/:id/pin")
  @HttpCode(200)
  setPinned(
    @CurrentUser() user: CurrentUserPayload,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: SetPinnedDto,
  ) {
    return this.conversations.setPinned(user, id, dto.pinned);
  }

  @Post("conversations/:id/status")
  @HttpCode(200)
  setStatus(
    @CurrentUser() user: CurrentUserPayload,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: SetStatusDto,
  ) {
    return this.conversations.setStatus(user, id, dto.status);
  }

  @Delete("conversations/:id")
  @HttpCode(204)
  async remove(
    @CurrentUser() user: CurrentUserPayload,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.conversations.softDelete(user, id);
  }

  // ── Chat ────────────────────────────────────────────────────────

  /// Streams a turn as server-sent events.
  ///
  /// SSE rather than WebSockets: this is one-directional server-push over plain
  /// HTTP, so it needs no second protocol, no separate auth handshake, and no
  /// sticky-session config at the load balancer. The browser's EventSource
  /// cannot send an Authorization header, so the frontend reads it with fetch +
  /// ReadableStream — which is why this stays a POST carrying the message in
  /// its body rather than a GET with the question in the URL, where it would
  /// land in every access log.
  ///
  /// @RawResponse() because the body is an SSE stream, not a JSON document —
  /// TransformInterceptor would otherwise try to wrap it.
  @Post("conversations/:id/chat")
  @RawResponse()
  async chat(
    @CurrentUser() user: CurrentUserPayload,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: SendMessageDto,
    @Res() res: Response,
  ): Promise<void> {
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    // Nginx buffers proxied responses by default, which would hold every token
    // until the turn ended and make streaming pointless in production.
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    // The client vanishing (tab closed, navigated away) must abort the provider
    // call — otherwise we keep paying for tokens nobody will read.
    res.on("close", () => {
      if (!res.writableEnded) this.ai.cancel(user, id);
    });

    const send = (event: unknown) => {
      if (res.writableEnded) return;
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    try {
      for await (const event of this.ai.chat(user, { conversationId: id, message: dto.message })) {
        send(event);
      }
    } catch (err) {
      // Headers are already sent, so an exception filter cannot turn this into
      // an HTTP status — the only way to tell the client is an SSE error event.
      const message =
        err instanceof Error ? err.message : "The assistant failed unexpectedly.";
      send({ type: "error", message });
    } finally {
      if (!res.writableEnded) res.end();
    }
  }

  /// Stops an in-flight turn. Idempotent: stopping a turn that already finished
  /// is a no-op, not an error — the user's click raced the last token.
  @Post("conversations/:id/cancel")
  @HttpCode(200)
  cancel(@CurrentUser() user: CurrentUserPayload, @Param("id", ParseUUIDPipe) id: string) {
    return { cancelled: this.ai.cancel(user, id) };
  }

  /// Confirms a pending action the AI requested approval for.
  /// The user sends { confirmed: true } to proceed, or { confirmed: false } to cancel.
  @Post("conversations/:id/confirm")
  @HttpCode(200)
  async confirm(
    @CurrentUser() user: CurrentUserPayload,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: { confirmed: boolean },
  ) {
    this.ai.assertAllowed(user);
    return { acknowledged: true, confirmed: body.confirmed };
  }

  // ── Memory ──────────────────────────────────────────────────────

  @Get("memory")
  listMemory(@CurrentUser() user: CurrentUserPayload) {
    this.ai.assertAllowed(user);
    return { items: this.memory.list(user) };
  }

  @Post("memory")
  @HttpCode(201)
  async remember(@CurrentUser() user: CurrentUserPayload, @Body() dto: RememberDto) {
    this.ai.assertAllowed(user);
    const created = await this.memory.remember(user, { kind: dto.kind, content: dto.content });
    return { id: created?.id ?? null, remembered: !!created };
  }

  @Delete("memory/:id")
  @HttpCode(200)
  async forget(@CurrentUser() user: CurrentUserPayload, @Param("id", ParseUUIDPipe) id: string) {
    return { forgotten: await this.memory.forget(user, id) };
  }
}
