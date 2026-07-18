import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AiConfig } from "../../config/configuration";
import {
  LlmProviderError,
  type LlmMessage,
  type LlmModelInfo,
  type LlmProvider,
  type LlmRequest,
  type LlmResponse,
  type LlmStreamEvent,
  type LlmToolCall,
} from "./llm-provider.interface";
import { parseSseStream } from "./sse-parser";

const API_URL = "https://api.anthropic.com/v1/messages";
/// Pinned. The Messages API is versioned by header, and an unpinned client
/// silently changes behaviour when Anthropic ships a new default.
const API_VERSION = "2023-06-01";

/// Anthropic Messages API adapter, over plain fetch.
///
/// No vendor SDK, for all four providers: the surface we use is one POST and an
/// SSE stream, and four SDKs would be four dependency trees, four release
/// cadences and four sets of transitive advisories to carry for a few hundred
/// lines of translation.
@Injectable()
export class AnthropicProvider implements LlmProvider {
  readonly name = "anthropic";

  constructor(private readonly config: ConfigService) {}

  private get aiConfig(): AiConfig {
    return this.config.getOrThrow<AiConfig>("ai");
  }

  isConfigured(): boolean {
    return !!this.aiConfig.anthropicApiKey;
  }

  listModels(): LlmModelInfo[] {
    return [
      { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5", supportsTools: true, contextWindow: 200_000 },
      { id: "claude-opus-4-8", label: "Claude Opus 4.8", supportsTools: true, contextWindow: 200_000 },
      { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5", supportsTools: true, contextWindow: 200_000 },
    ];
  }

  private headers(): Record<string, string> {
    const key = this.aiConfig.anthropicApiKey;
    if (!key) {
      throw new LlmProviderError("ANTHROPIC_API_KEY is not configured", this.name);
    }
    return {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": API_VERSION,
    };
  }

  /// Translates our neutral message list into Anthropic's shape.
  ///
  /// Three things differ from the common denominator and are handled here so
  /// nothing above this file has to know:
  ///  - the system prompt is a top-level field, not a message;
  ///  - tool calls and results are content BLOCKS, not message fields;
  ///  - a tool result is a `user` message, not a `tool` role.
  private toAnthropicMessages(messages: LlmMessage[]): unknown[] {
    const out: unknown[] = [];

    for (const message of messages) {
      if (message.role === "system") continue;

      if (message.role === "tool") {
        out.push({
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: message.toolCallId,
              content: message.content ?? "",
            },
          ],
        });
        continue;
      }

      if (message.role === "assistant" && message.toolCalls?.length) {
        const blocks: unknown[] = [];
        if (message.content) blocks.push({ type: "text", text: message.content });
        for (const call of message.toolCalls) {
          blocks.push({ type: "tool_use", id: call.id, name: call.name, input: call.arguments });
        }
        out.push({ role: "assistant", content: blocks });
        continue;
      }

      out.push({ role: message.role, content: message.content ?? "" });
    }

    return out;
  }

  private buildBody(request: LlmRequest, stream: boolean): Record<string, unknown> {
    return {
      model: request.model,
      max_tokens: request.maxTokens,
      temperature: request.temperature,
      ...(request.system ? { system: request.system } : {}),
      messages: this.toAnthropicMessages(request.messages),
      ...(request.tools?.length
        ? {
            tools: request.tools.map((t) => ({
              name: t.name,
              description: t.description,
              input_schema: t.parameters,
            })),
          }
        : {}),
      ...(stream ? { stream: true } : {}),
    };
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(this.buildBody(request, false)),
      signal: request.signal,
    });

    if (!response.ok) throw await this.toError(response);

    const body = (await response.json()) as {
      content: Array<{ type: string; text?: string; id?: string; name?: string; input?: unknown }>;
      stop_reason: string;
      model: string;
      usage: { input_tokens: number; output_tokens: number };
    };

    const text = body.content
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("");

    const toolCalls: LlmToolCall[] = body.content
      .filter((b) => b.type === "tool_use")
      .map((b) => ({
        id: b.id ?? "",
        name: b.name ?? "",
        arguments: (b.input ?? {}) as Record<string, unknown>,
      }));

    return {
      content: text || null,
      toolCalls,
      usage: {
        promptTokens: body.usage.input_tokens,
        completionTokens: body.usage.output_tokens,
      },
      finishReason: this.mapStopReason(body.stop_reason),
      model: body.model,
    };
  }

  async *stream(request: LlmRequest): AsyncIterable<LlmStreamEvent> {
    let response: Response;
    try {
      response = await fetch(API_URL, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(this.buildBody(request, true)),
        signal: request.signal,
      });
    } catch (err) {
      // An aborted fetch is the user pressing Stop, not a failure.
      if (err instanceof Error && err.name === "AbortError") {
        yield { type: "done", usage: { promptTokens: 0, completionTokens: 0 }, finishReason: "cancelled" };
        return;
      }
      throw new LlmProviderError(
        err instanceof Error ? err.message : String(err),
        this.name,
        undefined,
        true,
      );
    }

    if (!response.ok) throw await this.toError(response);
    if (!response.body) throw new LlmProviderError("Empty response stream", this.name);

    // Tool-call arguments arrive as fragmented JSON across many deltas;
    // accumulate per block index and only emit once each is parseable.
    const partialTools = new Map<number, { id: string; name: string; json: string }>();
    const usage = { promptTokens: 0, completionTokens: 0 };
    let finishReason: LlmResponse["finishReason"] = "stop";

    try {
      for await (const event of parseSseStream(response.body, request.signal)) {
        const data = event.data;
        if (!data || data === "[DONE]") continue;

        const parsed = JSON.parse(data) as {
          type: string;
          index?: number;
          delta?: { type?: string; text?: string; partial_json?: string; stop_reason?: string };
          content_block?: { type: string; id?: string; name?: string };
          message?: { usage?: { input_tokens?: number; output_tokens?: number } };
          usage?: { output_tokens?: number };
        };

        switch (parsed.type) {
          case "message_start":
            usage.promptTokens = parsed.message?.usage?.input_tokens ?? 0;
            break;

          case "content_block_start":
            if (parsed.content_block?.type === "tool_use" && parsed.index !== undefined) {
              partialTools.set(parsed.index, {
                id: parsed.content_block.id ?? "",
                name: parsed.content_block.name ?? "",
                json: "",
              });
            }
            break;

          case "content_block_delta":
            if (parsed.delta?.type === "text_delta" && parsed.delta.text) {
              yield { type: "text", text: parsed.delta.text };
            } else if (parsed.delta?.type === "input_json_delta" && parsed.index !== undefined) {
              const partial = partialTools.get(parsed.index);
              if (partial) partial.json += parsed.delta.partial_json ?? "";
            }
            break;

          case "message_delta":
            if (parsed.delta?.stop_reason) finishReason = this.mapStopReason(parsed.delta.stop_reason);
            if (parsed.usage?.output_tokens) usage.completionTokens = parsed.usage.output_tokens;
            break;

          case "error":
            yield { type: "error", message: "Provider reported an error mid-stream" };
            return;
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        yield { type: "done", usage, finishReason: "cancelled" };
        return;
      }
      throw err;
    }

    if (partialTools.size > 0) {
      const toolCalls: LlmToolCall[] = [];
      for (const partial of partialTools.values()) {
        toolCalls.push({
          id: partial.id,
          name: partial.name,
          // An empty argument object is legitimate for a no-parameter tool, and
          // is what Anthropic sends for one.
          arguments: partial.json ? (JSON.parse(partial.json) as Record<string, unknown>) : {},
        });
      }
      yield { type: "tool_calls", toolCalls };
      finishReason = "tool_calls";
    }

    yield { type: "done", usage, finishReason };
  }

  private mapStopReason(reason: string): LlmResponse["finishReason"] {
    switch (reason) {
      case "end_turn":
      case "stop_sequence":
        return "stop";
      case "tool_use":
        return "tool_calls";
      case "max_tokens":
        return "length";
      default:
        return "stop";
    }
  }

  /// Turns a non-2xx into an error whose message is safe to show a user.
  ///
  /// The vendor's body is NOT surfaced verbatim: it can echo the request, which
  /// contains the org's data and our system prompt. 429/5xx are marked
  /// retryable so the orchestrator can distinguish them from a bad key.
  private async toError(response: Response): Promise<LlmProviderError> {
    const raw = await response.text().catch(() => "");
    let detail = "";
    try {
      const parsed = JSON.parse(raw) as { error?: { message?: string } };
      detail = parsed.error?.message ?? "";
    } catch {
      /* non-JSON error body; fall through to the status-based message */
    }

    const retryable = response.status === 429 || response.status >= 500;
    const message =
      response.status === 401
        ? "The configured Anthropic API key was rejected."
        : response.status === 429
          ? "The AI provider is rate limiting this request. Try again shortly."
          : retryable
            ? "The AI provider is temporarily unavailable."
            : `The AI provider rejected the request${detail ? `: ${detail.slice(0, 200)}` : ""}.`;

    return new LlmProviderError(message, this.name, response.status, retryable);
  }
}
