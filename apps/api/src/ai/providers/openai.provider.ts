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

/// Translates our neutral messages into the OpenAI chat-completions shape.
///
/// Exported because Ollama serves an OpenAI-compatible endpoint, so its adapter
/// reuses this verbatim rather than maintaining a second copy that drifts.
export function toOpenAiMessages(messages: LlmMessage[], system?: string): unknown[] {
  const out: unknown[] = [];
  // Unlike Anthropic/Gemini, OpenAI takes the system prompt as a message.
  if (system) out.push({ role: "system", content: system });

  for (const message of messages) {
    if (message.role === "system") {
      out.push({ role: "system", content: message.content ?? "" });
      continue;
    }
    if (message.role === "tool") {
      out.push({
        role: "tool",
        tool_call_id: message.toolCallId,
        content: message.content ?? "",
      });
      continue;
    }
    if (message.role === "assistant" && message.toolCalls?.length) {
      out.push({
        role: "assistant",
        content: message.content,
        tool_calls: message.toolCalls.map((c) => ({
          id: c.id,
          type: "function",
          function: { name: c.name, arguments: JSON.stringify(c.arguments) },
        })),
      });
      continue;
    }
    out.push({ role: message.role, content: message.content ?? "" });
  }

  return out;
}

export function toOpenAiTools(request: LlmRequest): unknown[] | undefined {
  if (!request.tools?.length) return undefined;
  return request.tools.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}

export function mapOpenAiFinish(reason: string | null | undefined): LlmResponse["finishReason"] {
  switch (reason) {
    case "stop":
      return "stop";
    case "tool_calls":
    case "function_call":
      return "tool_calls";
    case "length":
      return "length";
    default:
      return "stop";
  }
}

/// Accumulates OpenAI's streamed tool-call deltas.
///
/// Shared with the Ollama adapter. The vendor sends a tool call's `arguments` as
/// fragmented JSON across many deltas keyed by `index`, so nothing can be
/// parsed until the stream ends — acting on half an argument object would mean
/// calling a real ERP mutation with truncated input.
export class OpenAiToolAccumulator {
  private readonly partial = new Map<number, { id: string; name: string; args: string }>();

  add(deltas: Array<{ index?: number; id?: string; function?: { name?: string; arguments?: string } }>): void {
    for (const delta of deltas) {
      const index = delta.index ?? 0;
      const existing = this.partial.get(index) ?? { id: "", name: "", args: "" };
      if (delta.id) existing.id = delta.id;
      if (delta.function?.name) existing.name = delta.function.name;
      if (delta.function?.arguments) existing.args += delta.function.arguments;
      this.partial.set(index, existing);
    }
  }

  get size(): number {
    return this.partial.size;
  }

  /// Drops any call whose arguments never became valid JSON rather than
  /// throwing: one malformed call must not discard the others in the batch.
  drain(): LlmToolCall[] {
    const out: LlmToolCall[] = [];
    for (const partial of this.partial.values()) {
      if (!partial.name) continue;
      let args: Record<string, unknown> = {};
      if (partial.args) {
        try {
          args = JSON.parse(partial.args) as Record<string, unknown>;
        } catch {
          continue;
        }
      }
      out.push({ id: partial.id, name: partial.name, arguments: args });
    }
    this.partial.clear();
    return out;
  }
}

@Injectable()
export class OpenAiProvider implements LlmProvider {
  readonly name = "openai";

  constructor(private readonly config: ConfigService) {}

  private get aiConfig(): AiConfig {
    return this.config.getOrThrow<AiConfig>("ai");
  }

  isConfigured(): boolean {
    return !!this.aiConfig.openaiApiKey;
  }

  listModels(): LlmModelInfo[] {
    return [
      { id: "gpt-4o", label: "GPT-4o", supportsTools: true, contextWindow: 128_000 },
      { id: "gpt-4o-mini", label: "GPT-4o mini", supportsTools: true, contextWindow: 128_000 },
      { id: "gpt-4-turbo", label: "GPT-4 Turbo", supportsTools: true, contextWindow: 128_000 },
    ];
  }

  private get url(): string {
    return `${this.aiConfig.openaiBaseUrl.replace(/\/$/, "")}/chat/completions`;
  }

  private headers(): Record<string, string> {
    const key = this.aiConfig.openaiApiKey;
    if (!key) throw new LlmProviderError("OPENAI_API_KEY is not configured", this.name);
    return { "Content-Type": "application/json", Authorization: `Bearer ${key}` };
  }

  private buildBody(request: LlmRequest, stream: boolean): Record<string, unknown> {
    return {
      model: request.model,
      messages: toOpenAiMessages(request.messages, request.system),
      max_tokens: request.maxTokens,
      temperature: request.temperature,
      ...(toOpenAiTools(request) ? { tools: toOpenAiTools(request) } : {}),
      ...(stream ? { stream: true, stream_options: { include_usage: true } } : {}),
    };
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    const response = await fetch(this.url, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(this.buildBody(request, false)),
      signal: request.signal,
    });
    if (!response.ok) throw await toOpenAiError(response, this.name);

    const body = (await response.json()) as {
      model: string;
      choices: Array<{
        message: {
          content: string | null;
          tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
        };
        finish_reason: string;
      }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    const choice = body.choices[0];
    const toolCalls: LlmToolCall[] = (choice?.message.tool_calls ?? []).map((c) => ({
      id: c.id,
      name: c.function.name,
      arguments: safeParseArgs(c.function.arguments),
    }));

    return {
      content: choice?.message.content ?? null,
      toolCalls,
      usage: {
        promptTokens: body.usage?.prompt_tokens ?? 0,
        completionTokens: body.usage?.completion_tokens ?? 0,
      },
      finishReason: mapOpenAiFinish(choice?.finish_reason),
      model: body.model,
    };
  }

  async *stream(request: LlmRequest): AsyncIterable<LlmStreamEvent> {
    yield* streamOpenAiCompatible(
      this.url,
      this.headers(),
      this.buildBody(request, true),
      this.name,
      request.signal,
    );
  }
}

/// The streaming loop, shared by the OpenAI and Ollama adapters.
export async function* streamOpenAiCompatible(
  url: string,
  headers: Record<string, string>,
  body: Record<string, unknown>,
  providerName: string,
  signal?: AbortSignal,
): AsyncIterable<LlmStreamEvent> {
  let response: Response;
  try {
    response = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      yield { type: "done", usage: { promptTokens: 0, completionTokens: 0 }, finishReason: "cancelled" };
      return;
    }
    throw new LlmProviderError(
      err instanceof Error ? err.message : String(err),
      providerName,
      undefined,
      true,
    );
  }

  if (!response.ok) throw await toOpenAiError(response, providerName);
  if (!response.body) throw new LlmProviderError("Empty response stream", providerName);

  const tools = new OpenAiToolAccumulator();
  const usage = { promptTokens: 0, completionTokens: 0 };
  let finishReason: LlmResponse["finishReason"] = "stop";

  try {
    for await (const event of parseSseStream(response.body, signal)) {
      if (event.data === "[DONE]") break;

      const parsed = JSON.parse(event.data) as {
        choices?: Array<{
          delta?: {
            content?: string;
            tool_calls?: Array<{ index?: number; id?: string; function?: { name?: string; arguments?: string } }>;
          };
          finish_reason?: string | null;
        }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };

      // The usage-only frame arrives last and has no choices.
      if (parsed.usage) {
        usage.promptTokens = parsed.usage.prompt_tokens ?? usage.promptTokens;
        usage.completionTokens = parsed.usage.completion_tokens ?? usage.completionTokens;
      }

      const choice = parsed.choices?.[0];
      if (!choice) continue;

      if (choice.delta?.content) yield { type: "text", text: choice.delta.content };
      if (choice.delta?.tool_calls) tools.add(choice.delta.tool_calls);
      if (choice.finish_reason) finishReason = mapOpenAiFinish(choice.finish_reason);
    }
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      yield { type: "done", usage, finishReason: "cancelled" };
      return;
    }
    throw err;
  }

  if (tools.size > 0) {
    const drained = tools.drain();
    if (drained.length > 0) {
      yield { type: "tool_calls", toolCalls: drained };
      finishReason = "tool_calls";
    }
  }

  yield { type: "done", usage, finishReason };
}

function safeParseArgs(raw: string): Record<string, unknown> {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // A model that emits malformed JSON gets an empty object, and the tool's
    // own schema validation then rejects it with a message the model can act
    // on — better than throwing and killing the whole turn.
    return {};
  }
}

/// Shared by both OpenAI-compatible adapters. As with Anthropic, the vendor's
/// body is not echoed verbatim: it can contain the request, and the request
/// contains the organization's data.
export async function toOpenAiError(response: Response, providerName: string): Promise<LlmProviderError> {
  const raw = await response.text().catch(() => "");
  let detail = "";
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string } };
    detail = parsed.error?.message ?? "";
  } catch {
    /* non-JSON body */
  }

  const retryable = response.status === 429 || response.status >= 500;
  const message =
    response.status === 401
      ? `The configured ${providerName} API key was rejected.`
      : response.status === 429
        ? "The AI provider is rate limiting this request. Try again shortly."
        : retryable
          ? "The AI provider is temporarily unavailable."
          : `The AI provider rejected the request${detail ? `: ${detail.slice(0, 200)}` : ""}.`;

  return new LlmProviderError(message, providerName, response.status, retryable);
}
