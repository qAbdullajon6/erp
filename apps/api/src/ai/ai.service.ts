import { BadRequestException, ForbiddenException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import type { CurrentUserPayload } from "../auth/interfaces/current-user.interface";
import type { AiConfig } from "../config/configuration";
import { ProviderFactory } from "./providers/provider.factory";
import type { LlmMessage, LlmStreamEvent, LlmToolCall } from "./providers/llm-provider.interface";
import { ConversationService } from "./chat/conversation.service";
import { ErpContextBuilder } from "./context/erp-context.builder";
import { PromptLibrary } from "./prompts/prompt-library";
import { RagService } from "./rag/rag.service";
import { MemoryService } from "./memory/memory.service";
import { ToolRegistry } from "./tools/tool-registry";
import { ToolExecutor, type ToolExecutionResult } from "./tools/tool-executor";
import { PromptInjectionGuard } from "./security/prompt-injection.guard";
import { OutputFilter } from "./security/output-filter";
import { AiRateLimitService } from "./security/ai-rate-limit.service";
import { UsageMeteringService } from "../billing/usage-metering.service";
import { UsageMetricType } from "@prisma/client";

/// Events the controller relays to the browser over SSE.
export type ChatEvent =
  | { type: "text"; text: string }
  | { type: "tool_start"; name: string }
  | { type: "tool_end"; name: string; status: string; durationMs?: number; error?: string }
  | { type: "planning"; steps: string[] }
  | { type: "confirmation_required"; action: string; details: Record<string, unknown> }
  | { type: "done"; messageId: string; usage: { promptTokens: number; completionTokens: number }; finishReason: string; trace: ExecutionTrace }
  | { type: "error"; message: string };

/// Aggregated metadata about what happened in a turn, for audit and debugging.
export interface ExecutionTrace {
  iterations: number;
  toolsCalled: Array<{ name: string; status: string; durationMs: number }>;
  totalDurationMs: number;
  retries: number;
  failures: number;
  recovered: number;
}

/// A driver has no Copilot tools and no business questions it can answer, so
/// they are refused at the door rather than handed an assistant that can only
/// say no.
const DENIED_ROLES = new Set(["DRIVER"]);

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  /// In-flight turns, so "Stop generating" can abort the provider request
  /// rather than merely hiding output that is still being billed.
  private readonly running = new Map<string, AbortController>();

  /// A mutating tool call the model requested but has not yet been allowed to
  /// run. Set when `chat()` yields `confirmation_required`; resolved by
  /// `recordConfirmation()`, which the /confirm endpoint calls. Per-process and
  /// in-memory like `running` above — a pending confirmation does not need to
  /// survive an API restart, and the row in `AiToolCall` (status
  /// AWAITING_CONFIRMATION) is the durable record of what was proposed.
  private readonly pendingConfirmations = new Map<
    string,
    { toolCalls: LlmToolCall[]; assistantMessageId: string; decision?: boolean }
  >();

  /// Called by the /confirm endpoint. Records the user's decision; the actual
  /// execution (or cancellation) happens on the NEXT chat() call for this
  /// conversation, which is what the client sends immediately after — see
  /// ConfirmationBanner. Returns false if there is nothing pending, so the
  /// controller can tell a stale click from a real one.
  recordConfirmation(actor: CurrentUserPayload, conversationId: string, confirmed: boolean): boolean {
    const pending = this.pendingConfirmations.get(conversationId);
    if (!pending) return false;
    pending.decision = confirmed;
    this.logger.log(
      `AI tool call ${confirmed ? "confirmed" : "denied"} by ${actor.userId} on conversation ${conversationId}`,
    );
    return true;
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly providers: ProviderFactory,
    private readonly conversations: ConversationService,
    private readonly contextBuilder: ErpContextBuilder,
    private readonly prompts: PromptLibrary,
    private readonly rag: RagService,
    private readonly memory: MemoryService,
    private readonly registry: ToolRegistry,
    private readonly executor: ToolExecutor,
    private readonly injectionGuard: PromptInjectionGuard,
    private readonly outputFilter: OutputFilter,
    private readonly rateLimit: AiRateLimitService,
    private readonly usageMetering: UsageMeteringService,
  ) {}

  private get aiConfig(): AiConfig {
    return this.config.getOrThrow<AiConfig>("ai");
  }

  assertAllowed(actor: CurrentUserPayload): void {
    if (DENIED_ROLES.has(actor.role)) {
      throw new ForbiddenException("The AI Copilot is not available for your role.");
    }
  }

  /// Streams one turn.
  ///
  /// The agent loop: ask the model, run any tools it requests, feed the results
  /// back, repeat until it produces prose or hits the iteration ceiling. Every
  /// step is persisted as it happens, so a disconnect mid-turn leaves a complete
  /// record rather than a half-written conversation.
  async *chat(
    actor: CurrentUserPayload,
    params: { conversationId: string; message: string },
  ): AsyncGenerator<ChatEvent> {
    this.assertAllowed(actor);
    // Checked BEFORE any provider call: a quota checked afterwards has
    // already spent the money it exists to protect.
    await this.usageMetering.enforceLimit(actor.organizationId, UsageMetricType.AI_CREDITS, 1);
    this.rateLimit.consume(actor.userId);

    const conversation = await this.conversations.findOwned(actor, params.conversationId);

    const message = params.message.trim();
    if (!message) throw new BadRequestException("Message cannot be empty");
    if (this.injectionGuard.isOversized(message)) {
      throw new BadRequestException("Message is too long. Please ask a shorter question.");
    }

    const verdict = this.injectionGuard.inspect(message);
    if (verdict.blocked) {
      this.injectionGuard.logAttempt(actor.userId, actor.organizationId, verdict);
      await this.audit.log({
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        action: "ai.injection_blocked",
        entityType: "AiConversation",
        entityId: conversation.id,
        // The patterns, never the message: the message is the attack payload,
        // and copying it into the audit table spreads it.
        metadata: { patterns: verdict.matched },
      });

      // The user's turn is still recorded — an investigator needs to see what
      // was asked, and a silently dropped message looks like a bug.
      await this.conversations.addMessage({
        conversationId: conversation.id,
        organizationId: actor.organizationId,
        role: "USER",
        content: message,
      });

      const refusal =
        "I can't help with that. I'm the FlowERP Copilot — ask me about your orders, customers, fleet or reports.";
      const stored = await this.conversations.addMessage({
        conversationId: conversation.id,
        organizationId: actor.organizationId,
        role: "ASSISTANT",
        content: refusal,
        finishReason: "blocked",
        filtered: true,
      });

      yield { type: "text", text: refusal };
      yield {
        type: "done",
        messageId: stored.id,
        usage: { promptTokens: 0, completionTokens: 0 },
        finishReason: "blocked",
        trace: { iterations: 0, toolsCalled: [], totalDurationMs: 0, retries: 0, failures: 0, recovered: 0 },
      };
      return;
    }

    const provider = this.providers.get();
    const model = this.providers.resolveModel(conversation.model);

    // A mutating tool call from the PREVIOUS turn, still AWAITING_CONFIRMATION.
    // Resolved BEFORE this turn's own message is persisted, and — for an
    // approval — its TOOL result is too (see resumedToolCalls further down):
    // an assistant message with tool_calls must be immediately followed by
    // that call's own tool-result message with nothing in between, not even
    // this turn's "Yes, proceed."/"No, cancel that.", or every
    // OpenAI-compatible provider rejects the next prompt as malformed.
    const pending = this.pendingConfirmations.get(conversation.id);
    this.pendingConfirmations.delete(conversation.id);
    const resumedToolCalls = pending?.decision === true ? pending.toolCalls : null;
    const resumedAssistantMessageId = pending?.decision === true ? pending.assistantMessageId : null;

    if (pending && pending.decision !== true) {
      // Denied, or abandoned — a new message arrived without going through
      // confirm/cancel at all — either way it never runs.
      const declined: ToolExecutionResult[] = pending.toolCalls.map((call) => ({
        toolCallId: call.id,
        toolName: call.name,
        status: "DENIED",
        content: JSON.stringify({ error: "The user did not approve this action." }),
        raw: null,
        error: "The user did not approve this action.",
        durationMs: 0,
      }));
      await this.updateToolCallResults(pending.toolCalls, declined);
      for (const result of declined) {
        await this.conversations.addMessage({
          conversationId: conversation.id,
          organizationId: actor.organizationId,
          role: "TOOL",
          content: result.content,
          toolCallId: result.toolCallId,
        });
      }
    }

    // For a fresh message or a denial, the user's turn is persisted now, same
    // as always. For an approval, it is persisted later — right after the
    // resumed tool call's own TOOL result — for the ordering reason above.
    if (!resumedToolCalls) {
      await this.conversations.addMessage({
        conversationId: conversation.id,
        organizationId: actor.organizationId,
        role: "USER",
        content: message,
      });
      await this.conversations.maybeAutoTitle(conversation.id, message);
    }

    const readOnly = conversation.readOnly;
    const system = await this.buildSystemPrompt(actor, conversation.id, message, readOnly);
    const history = await this.conversations.historyForPrompt(conversation.id);
    const tools = this.registry.definitionsFor(actor, { readOnly });

    const abort = new AbortController();
    this.running.set(conversation.id, abort);
    // A turn that never finishes must not pin an abort controller and a socket
    // forever; the provider request dies with it.
    const timeout = setTimeout(() => abort.abort(), this.aiConfig.requestTimeoutMs);

    const totalUsage = { promptTokens: 0, completionTokens: 0 };
    const startedAt = Date.now();
    const trace: ExecutionTrace = {
      iterations: 0,
      toolsCalled: [],
      totalDurationMs: 0,
      retries: 0,
      failures: 0,
      recovered: 0,
    };

    try {
      const messages: LlmMessage[] = [...history];

      for (let iteration = 0; iteration < this.aiConfig.maxToolIterations; iteration++) {
        trace.iterations = iteration + 1;
        let text = "";
        let toolCalls: LlmToolCall[] = [];
        let finishReason = "stop";
        let assistantMessageId: string;
        const iterationStart = Date.now();

        // The first step of a turn that resumes an approved confirmation: the
        // model already told us exactly what to call, so run that instead of
        // asking again — asking again could get a different answer the user
        // never approved.
        const seeded = iteration === 0 && !!resumedToolCalls && !!resumedAssistantMessageId;
        if (seeded) {
          toolCalls = resumedToolCalls!;
          assistantMessageId = resumedAssistantMessageId!;
        } else {
        const streamFilter = this.outputFilter.createStreamFilter();

        for await (const event of provider.stream({
          messages,
          system,
          tools: tools.length > 0 ? tools : undefined,
          model,
          maxTokens: this.aiConfig.maxTokens,
          temperature: this.aiConfig.temperature,
          signal: abort.signal,
        })) {
          const relayed = this.handleStreamEvent(event, streamFilter, totalUsage);
          if (relayed.text) {
            text += relayed.text;
            yield { type: "text", text: relayed.text };
          }
          if (relayed.toolCalls) toolCalls = relayed.toolCalls;
          if (relayed.finishReason) finishReason = relayed.finishReason;
          if (relayed.error) {
            yield { type: "error", message: relayed.error };
            return;
          }
        }

        const tail = streamFilter.flush();
        if (tail) {
          text += tail;
          yield { type: "text", text: tail };
        }

        // No tools requested: the model has answered, and the turn is over.
        if (toolCalls.length === 0) {
          trace.totalDurationMs = Date.now() - startedAt;
          const stored = await this.conversations.addMessage({
            conversationId: conversation.id,
            organizationId: actor.organizationId,
            role: "ASSISTANT",
            content: text || null,
            model,
            promptTokens: totalUsage.promptTokens,
            completionTokens: totalUsage.completionTokens,
            latencyMs: Date.now() - startedAt,
            finishReason,
            filtered: streamFilter.filtered,
          });
          await this.conversations.recordUsage(conversation.id, totalUsage);
          yield { type: "done", messageId: stored.id, usage: totalUsage, finishReason, trace };
          return;
        }

        // The model wants tools. Persist its request, run them, feed back.
        const assistantMessage = await this.conversations.addMessage({
          conversationId: conversation.id,
          organizationId: actor.organizationId,
          role: "ASSISTANT",
          content: text || null,
          model,
          latencyMs: Date.now() - iterationStart,
          finishReason: "tool_calls",
          filtered: streamFilter.filtered,
        });
        assistantMessageId = assistantMessage.id;

        // At least one of these changes data: stop here and ask the user,
        // rather than let a hallucinated or injected request through. The
        // model is not asked again on approval — see the resumedToolCalls
        // branch above — so nothing executes that was not shown to the user
        // verbatim.
        const mutatingCalls = toolCalls.filter((call) => this.registry.get(call.name)?.mutating);
        if (mutatingCalls.length > 0) {
          const awaiting: ToolExecutionResult[] = toolCalls.map((call) => ({
            toolCallId: call.id,
            toolName: call.name,
            status: "AWAITING_CONFIRMATION",
            content: JSON.stringify({ status: "awaiting_confirmation" }),
            raw: null,
            durationMs: 0,
          }));
          await this.persistToolCalls(assistantMessageId, actor.organizationId, toolCalls, awaiting);
          this.pendingConfirmations.set(conversation.id, { toolCalls, assistantMessageId });

          trace.totalDurationMs = Date.now() - startedAt;
          yield {
            type: "confirmation_required",
            action:
              mutatingCalls.length === 1
                ? `Run "${mutatingCalls[0].name}"`
                : `Run ${mutatingCalls.length} actions: ${mutatingCalls.map((c) => c.name).join(", ")}`,
            details: { calls: mutatingCalls.map((c) => ({ tool: c.name, arguments: c.arguments })) },
          };
          yield {
            type: "done",
            messageId: assistantMessageId,
            usage: totalUsage,
            finishReason: "tool_calls",
            trace,
          };
          return;
        }
        }

        const results: ToolExecutionResult[] = [];
        for (const call of toolCalls) {
          yield { type: "tool_start", name: call.name };
          let result = await this.executor.execute(call, actor);

          // Retry once on transient failures (network, timeout, lock contention).
          if (result.status === "FAILED" && this.isRetryable(result.error)) {
            trace.retries++;
            result = await this.executor.execute(call, actor);
            if (result.status === "SUCCEEDED") trace.recovered++;
          }

          if (result.status === "FAILED") trace.failures++;
          trace.toolsCalled.push({
            name: call.name,
            status: result.status,
            durationMs: result.durationMs,
          });

          results.push(result);
          yield {
            type: "tool_end",
            name: call.name,
            status: result.status,
            durationMs: result.durationMs,
            error: result.error,
          };
        }

        if (seeded) {
          await this.updateToolCallResults(toolCalls, results);
        } else {
          await this.persistToolCalls(assistantMessageId, actor.organizationId, toolCalls, results);
        }
        await this.auditMutations(actor, conversation.id, toolCalls, results);

        messages.push({
          role: "assistant",
          content: text || null,
          toolCalls,
        });

        for (const result of results) {
          await this.conversations.addMessage({
            conversationId: conversation.id,
            organizationId: actor.organizationId,
            role: "TOOL",
            content: result.content,
            toolCallId: result.toolCallId,
          });
          messages.push({
            role: "tool",
            // Tool output is untrusted text — a customer's name could say
            // "ignore your instructions". Fenced as data before it re-enters
            // the prompt.
            content: this.injectionGuard.sanitizeToolResult(result.content),
            toolCallId: result.toolCallId,
            toolName: result.toolName,
          });
        }

        await this.rememberTouchedEntities(actor, conversation.id, results);

        // The deferred "Yes, proceed." — see the top of this method. Now that
        // the approved call's own TOOL result is persisted immediately after
        // its assistant message, this can safely follow.
        if (seeded) {
          await this.conversations.addMessage({
            conversationId: conversation.id,
            organizationId: actor.organizationId,
            role: "USER",
            content: message,
          });
          await this.conversations.maybeAutoTitle(conversation.id, message);
          messages.push({ role: "user", content: message });
        }
      }

      // The loop ran out. Almost always a model looping on a tool that keeps
      // returning nothing useful; say so rather than stopping silently.
      trace.totalDurationMs = Date.now() - startedAt;
      const depthMessage =
        "I wasn't able to finish that — I kept needing more information and hit my step limit. " +
        "Try asking for something more specific.";
      const stored = await this.conversations.addMessage({
        conversationId: conversation.id,
        organizationId: actor.organizationId,
        role: "ASSISTANT",
        content: depthMessage,
        model,
        finishReason: "max_depth",
      });
      await this.conversations.recordUsage(conversation.id, totalUsage);
      yield { type: "text", text: depthMessage };
      yield { type: "done", messageId: stored.id, usage: totalUsage, finishReason: "max_depth", trace };
    } finally {
      clearTimeout(timeout);
      this.running.delete(conversation.id);
    }
  }

  /// Translates one provider event. Pure apart from the usage accumulator, so
  /// the loop above stays readable.
  private handleStreamEvent(
    event: LlmStreamEvent,
    filter: ReturnType<OutputFilter["createStreamFilter"]>,
    usage: { promptTokens: number; completionTokens: number },
  ): { text?: string; toolCalls?: LlmToolCall[]; finishReason?: string; error?: string } {
    switch (event.type) {
      case "text":
        return { text: filter.push(event.text) };
      case "tool_calls":
        return { toolCalls: event.toolCalls };
      case "done":
        usage.promptTokens += event.usage.promptTokens;
        usage.completionTokens += event.usage.completionTokens;
        return { finishReason: event.finishReason };
      case "error":
        return { error: event.message };
    }
  }

  private async persistToolCalls(
    messageId: string,
    organizationId: string,
    calls: LlmToolCall[],
    results: ToolExecutionResult[],
  ): Promise<void> {
    await this.prisma.aiToolCall.createMany({
      data: calls.map((call, i) => {
        const result = results[i];
        return {
          // The provider's call id, so the tool-result message matches up and
          // the record is traceable back to the vendor's own logs.
          id: call.id,
          messageId,
          organizationId,
          toolName: call.name,
          arguments: call.arguments as never,
          result: result?.raw ? (JSON.parse(JSON.stringify(result.raw)) as never) : undefined,
          status: result?.status ?? "FAILED",
          error: result?.error,
          durationMs: result?.durationMs,
        };
      }),
      // A provider that reuses a call id across turns must not kill the turn.
      skipDuplicates: true,
    });
  }

  /// Resolves rows `persistToolCalls` already created for a confirmation that
  /// was AWAITING_CONFIRMATION — an update, not a second insert, because the
  /// row (and its audit trail) must stay the same one the user was shown.
  private async updateToolCallResults(
    calls: LlmToolCall[],
    results: ToolExecutionResult[],
  ): Promise<void> {
    await Promise.all(
      calls.map((call, i) => {
        const result = results[i];
        return this.prisma.aiToolCall.update({
          where: { id: call.id },
          data: {
            result: result?.raw ? (JSON.parse(JSON.stringify(result.raw)) as never) : undefined,
            status: result?.status ?? "FAILED",
            error: result?.error,
            durationMs: result?.durationMs,
          },
        });
      }),
    );
  }

  /// Audits every tool that CHANGED something.
  ///
  /// Reads are already visible in ai_tool_calls; writes go to the same audit log
  /// as every other mutation in the system, so "who created this order" has one
  /// answer whether a human clicked or asked.
  private async auditMutations(
    actor: CurrentUserPayload,
    conversationId: string,
    calls: LlmToolCall[],
    results: ToolExecutionResult[],
  ): Promise<void> {
    for (const [i, call] of calls.entries()) {
      const tool = this.registry.get(call.name);
      if (!tool?.mutating) continue;

      const result = results[i];
      await this.audit.log({
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        action: `ai.tool.${call.name}`,
        entityType: "AiConversation",
        entityId: conversationId,
        metadata: {
          tool: call.name,
          status: result?.status,
          arguments: call.arguments,
          ...(result?.error ? { error: result.error } : {}),
        },
      });
    }
  }

  /// Records what the turn touched, so "assign him to it" resolves next turn.
  private async rememberTouchedEntities(
    actor: CurrentUserPayload,
    conversationId: string,
    results: ToolExecutionResult[],
  ): Promise<void> {
    const entities: Array<{ entityType: string; entityId: string; label: string }> = [];

    for (const result of results) {
      if (result.status !== "SUCCEEDED" || !result.raw) continue;
      const raw = result.raw as Record<string, unknown>;

      // A create returns the single thing it made — that is what a follow-up
      // refers to. A search returns a list, and remembering ten candidates
      // would fill memory with noise rather than a referent.
      if (typeof raw.id === "string") {
        const label =
          str(raw.orderNumber) ?? str(raw.companyName) ?? str(raw.customerCode) ?? str(raw.name) ?? raw.id;
        entities.push({
          entityType: entityTypeFor(result.toolName),
          entityId: raw.id,
          label,
        });
      }
    }

    if (entities.length > 0) {
      await this.memory.rememberEntities(actor, conversationId, entities);
    }
  }

  private async buildSystemPrompt(
    actor: CurrentUserPayload,
    conversationId: string,
    message: string,
    readOnly = false,
  ): Promise<string> {
    // Independent reads, so they overlap rather than queue.
    const [erpContext, memories, chunks] = await Promise.all([
      this.contextBuilder.build(actor),
      this.memory.forPrompt(actor, conversationId),
      this.rag.retrieve(actor.organizationId, message),
    ]);

    return this.prompts.build({
      role: actor.role,
      erpContext: this.contextBuilder.render(erpContext),
      memory: this.memory.render(memories),
      knowledge: this.rag.render(chunks),
      toolNames: this.registry.forUser(actor, { readOnly }).map((t) => t.name),
      readOnly,
    });
  }

  /// Aborts an in-flight turn. Returns false when there was nothing running —
  /// the user pressed Stop just as it finished, which is not an error.
  cancel(actor: CurrentUserPayload, conversationId: string): boolean {
    const controller = this.running.get(conversationId);
    if (!controller) return false;
    controller.abort();
    this.running.delete(conversationId);
    this.logger.log(`AI turn cancelled by ${actor.userId} on conversation ${conversationId}`);
    return true;
  }

  /// Whether a tool failure is worth retrying. Transient errors (network,
  /// timeout, lock contention) may succeed on a second attempt; permanent
  /// errors (validation, not found, permission) will not.
  private isRetryable(error?: string): boolean {
    if (!error) return false;
    const lower = error.toLowerCase();
    return (
      lower.includes("timeout") ||
      lower.includes("timed out") ||
      lower.includes("econnrefused") ||
      lower.includes("econnreset") ||
      lower.includes("deadlock") ||
      lower.includes("lock") ||
      lower.includes("temporarily") ||
      lower.includes("try again") ||
      lower.includes("503") ||
      lower.includes("429")
    );
  }

  /// What the Copilot can do for THIS user — the UI renders its model selector
  /// and starter prompts from this, so it never offers something that 403s.
  capabilities(actor: CurrentUserPayload) {
    const denied = DENIED_ROLES.has(actor.role);
    return {
      available: !denied && this.providers.isConfigured(),
      configured: this.providers.isConfigured(),
      provider: this.aiConfig.provider,
      models: denied ? [] : this.providers.listModels(),
      defaultModel: this.providers.isConfigured() ? this.providers.defaultModel() : null,
      tools: denied ? [] : this.registry.forUser(actor).map((t) => ({
        name: t.name,
        description: t.description,
        mutating: t.mutating,
      })),
      suggestions: this.prompts.suggestionsFor(actor.role),
      rateLimit: this.rateLimit.remaining(actor.userId),
    };
  }
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/// Maps a tool name to the entity kind it deals in, for memory labelling.
function entityTypeFor(toolName: string): string {
  if (toolName.includes("customer")) return "Customer";
  if (toolName.includes("order")) return "Order";
  if (toolName.includes("driver")) return "Driver";
  if (toolName.includes("vehicle")) return "Vehicle";
  if (toolName.includes("workflow")) return "Workflow";
  return "Record";
}
