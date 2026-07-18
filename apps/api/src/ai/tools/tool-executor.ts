import { ForbiddenException, HttpException, Injectable, Logger } from "@nestjs/common";
import type { AiToolCallStatus } from "@prisma/client";
import type { CurrentUserPayload } from "../../auth/interfaces/current-user.interface";
import type { LlmToolCall } from "../providers/llm-provider.interface";
import { ToolRegistry } from "./tool-registry";
import { ToolExecutionError } from "./tool.interface";

export interface ToolExecutionResult {
  toolCallId: string;
  toolName: string;
  status: AiToolCallStatus;
  /// Fed back to the model as the tool-result message. Always a string, because
  /// that is what every provider's tool-result field takes.
  content: string;
  /// Structured result, persisted for the audit trail.
  raw: unknown;
  error?: string;
  durationMs: number;
}

/// A tool result is fed straight back into the prompt, so its size is a direct
/// token cost — and an unbounded one is a way to blow the context window with a
/// single query. Truncation is visible to the model so it can narrow its search
/// rather than silently reasoning over half a list.
const MAX_RESULT_CHARS = 8_000;

@Injectable()
export class ToolExecutor {
  private readonly logger = new Logger(ToolExecutor.name);

  constructor(private readonly registry: ToolRegistry) {}

  /// Runs one tool call on the CALLER's behalf.
  ///
  /// Never throws for a tool-level problem. A thrown error would abort the whole
  /// turn; returning the failure as a result lets the model read "customer not
  /// found", apologise, and try a different search — which is the behaviour a
  /// user wants. Only a bug in this class itself escapes.
  async execute(call: LlmToolCall, actor: CurrentUserPayload): Promise<ToolExecutionResult> {
    const startedAt = Date.now();
    const tool = this.registry.get(call.name);

    if (!tool) {
      // The model invented a tool. Tell it plainly rather than failing the turn.
      return this.deny(
        call,
        startedAt,
        `No such tool: "${call.name}". Use only the tools provided.`,
        "FAILED",
      );
    }

    // The decisive check. ToolRegistry.forUser already withheld this tool from
    // the prompt, but that is an offer-time filter: it would not stop a replayed
    // conversation, a model echoing a tool name it saw in earlier context, or a
    // future code path that forgets to filter. Authorization is enforced HERE,
    // immediately before the handler runs, where it cannot be bypassed.
    if (!tool.allowedRoles.includes(actor.role)) {
      this.logger.warn(
        `Blocked ${actor.role} from AI tool "${call.name}" (org ${actor.organizationId})`,
      );
      return this.deny(
        call,
        startedAt,
        // Phrased as "not available", not "you lack permission": confirming a
        // capability exists tells the user what to go looking for.
        `The tool "${call.name}" is not available to you.`,
        "DENIED",
      );
    }

    try {
      const raw = await tool.handler(call.arguments ?? {}, actor);
      const content = this.serialize(raw);
      return {
        toolCallId: call.id,
        toolName: call.name,
        status: "SUCCEEDED",
        content,
        raw,
        durationMs: Date.now() - startedAt,
      };
    } catch (err) {
      return this.fail(call, startedAt, err);
    }
  }

  /// Runs a batch. Sequential, not Promise.all: a batch can contain mutations
  /// (create the customer, then the order for it), and running those
  /// concurrently would race — the second needs the first's id. Reads are fast
  /// enough that the ordering guarantee is worth more than the parallelism.
  async executeAll(
    calls: LlmToolCall[],
    actor: CurrentUserPayload,
  ): Promise<ToolExecutionResult[]> {
    const results: ToolExecutionResult[] = [];
    for (const call of calls) {
      results.push(await this.execute(call, actor));
    }
    return results;
  }

  private deny(
    call: LlmToolCall,
    startedAt: number,
    message: string,
    status: AiToolCallStatus,
  ): ToolExecutionResult {
    return {
      toolCallId: call.id,
      toolName: call.name,
      status,
      content: JSON.stringify({ error: message }),
      raw: null,
      error: message,
      durationMs: Date.now() - startedAt,
    };
  }

  private fail(call: LlmToolCall, startedAt: number, err: unknown): ToolExecutionResult {
    const message = this.humanize(err);
    this.logger.warn(`AI tool "${call.name}" failed: ${message}`);
    return {
      toolCallId: call.id,
      toolName: call.name,
      status: "FAILED",
      content: JSON.stringify({ error: message }),
      raw: null,
      error: message,
      durationMs: Date.now() - startedAt,
    };
  }

  /// Turns a thrown error into something the MODEL can act on.
  ///
  /// Domain exceptions carry exactly the message a user should see — a
  /// ConflictException from the assignment policy says why the driver is
  /// unavailable, and relaying that lets the model offer an alternative.
  /// Anything else is deliberately generic: an unexpected error's message can
  /// carry a stack, a query, or a column name, and feeding that to a model puts
  /// it one step from the user's screen.
  private humanize(err: unknown): string {
    if (err instanceof ToolExecutionError) return err.message;

    if (err instanceof ForbiddenException) {
      return "You do not have access to that.";
    }

    if (err instanceof HttpException) {
      const response = err.getResponse();
      if (typeof response === "string") return response;
      if (typeof response === "object" && response !== null && "message" in response) {
        const message = (response as { message: unknown }).message;
        if (typeof message === "string") return message;
        if (Array.isArray(message)) return message.join(", ");
      }
      return err.message;
    }

    this.logger.error(
      `Unexpected AI tool error: ${err instanceof Error ? err.stack ?? err.message : String(err)}`,
    );
    return "That operation failed unexpectedly. Nothing was changed.";
  }

  private serialize(raw: unknown): string {
    if (raw === null || raw === undefined) return JSON.stringify({ ok: true });

    const json = JSON.stringify(raw, jsonSafe);
    if (json.length <= MAX_RESULT_CHARS) return json;

    // Say so rather than truncating silently: a model reasoning over a
    // half-list will confidently state a wrong total.
    return JSON.stringify({
      truncated: true,
      note: `Result exceeded ${MAX_RESULT_CHARS} characters and was cut off. Narrow the query (add filters or a smaller limit) for a complete answer.`,
      preview: json.slice(0, MAX_RESULT_CHARS),
    });
  }
}

/// Prisma returns Decimal for money and Date for timestamps; neither survives
/// JSON.stringify in a form a model reads well (Decimal serialises to an object
/// with `s`/`e`/`d` internals). This renders both as the text a person expects.
function jsonSafe(_key: string, value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "object" && "toFixed" in (value as object) && "s" in (value as object)) {
    return (value as { toString(): string }).toString();
  }
  return value;
}
