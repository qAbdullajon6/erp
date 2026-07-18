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

const BASE = "https://generativelanguage.googleapis.com/v1beta";

/// Google Gemini adapter.
///
/// The most divergent of the four, and every divergence is absorbed here:
///  - roles are "user"/"model", not "user"/"assistant";
///  - messages are `contents` with `parts`, not `content` strings;
///  - the system prompt is `systemInstruction`;
///  - tool calls/results are `functionCall`/`functionResponse` parts;
///  - the API key goes in a query string, not a header;
///  - JSON Schema is accepted but `additionalProperties` is REJECTED outright.
@Injectable()
export class GeminiProvider implements LlmProvider {
  readonly name = "gemini";

  constructor(private readonly config: ConfigService) {}

  private get aiConfig(): AiConfig {
    return this.config.getOrThrow<AiConfig>("ai");
  }

  isConfigured(): boolean {
    return !!this.aiConfig.geminiApiKey;
  }

  listModels(): LlmModelInfo[] {
    return [
      { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash", supportsTools: true, contextWindow: 1_000_000 },
      { id: "gemini-1.5-pro", label: "Gemini 1.5 Pro", supportsTools: true, contextWindow: 2_000_000 },
      { id: "gemini-1.5-flash", label: "Gemini 1.5 Flash", supportsTools: true, contextWindow: 1_000_000 },
    ];
  }

  private key(): string {
    const key = this.aiConfig.geminiApiKey;
    if (!key) throw new LlmProviderError("GEMINI_API_KEY is not configured", this.name);
    return key;
  }

  private url(model: string, stream: boolean): string {
    const method = stream ? "streamGenerateContent" : "generateContent";
    // The key is a query parameter because that is the only auth this API
    // accepts. It never reaches a log: LoggingMiddleware redacts URLs, and this
    // URL is never returned to a client.
    const alt = stream ? "&alt=sse" : "";
    return `${BASE}/models/${model}:${method}?key=${encodeURIComponent(this.key())}${alt}`;
  }

  private toContents(messages: LlmMessage[]): unknown[] {
    const out: unknown[] = [];

    for (const message of messages) {
      if (message.role === "system") continue;

      if (message.role === "tool") {
        out.push({
          role: "user",
          parts: [
            {
              functionResponse: {
                name: message.toolName ?? "",
                // Gemini requires an object here, not a string — a bare string
                // is rejected with a 400 that names no field.
                response: { result: message.content ?? "" },
              },
            },
          ],
        });
        continue;
      }

      if (message.role === "assistant" && message.toolCalls?.length) {
        const parts: unknown[] = [];
        if (message.content) parts.push({ text: message.content });
        for (const call of message.toolCalls) {
          parts.push({ functionCall: { name: call.name, args: call.arguments } });
        }
        out.push({ role: "model", parts });
        continue;
      }

      out.push({
        role: message.role === "assistant" ? "model" : "user",
        parts: [{ text: message.content ?? "" }],
      });
    }

    return out;
  }

  private buildBody(request: LlmRequest): Record<string, unknown> {
    return {
      contents: this.toContents(request.messages),
      ...(request.system ? { systemInstruction: { parts: [{ text: request.system }] } } : {}),
      generationConfig: {
        maxOutputTokens: request.maxTokens,
        temperature: request.temperature,
      },
      ...(request.tools?.length
        ? {
            tools: [
              {
                functionDeclarations: request.tools.map((t) => ({
                  name: t.name,
                  description: t.description,
                  parameters: stripUnsupportedSchemaKeys(t.parameters),
                })),
              },
            ],
          }
        : {}),
    };
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    const response = await fetch(this.url(request.model, false), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(this.buildBody(request)),
      signal: request.signal,
    });
    if (!response.ok) throw await this.toError(response);

    const body = (await response.json()) as GeminiResponseBody;
    const candidate = body.candidates?.[0];
    const parts = candidate?.content?.parts ?? [];

    const text = parts.map((p) => p.text ?? "").join("");
    const toolCalls: LlmToolCall[] = parts
      .filter((p) => p.functionCall)
      .map((p, i) => ({
        // Gemini has no call ids at all; synthesise a stable one so the
        // tool-result message can reference it.
        id: `gemini-tool-${i}`,
        name: p.functionCall!.name,
        arguments: p.functionCall!.args ?? {},
      }));

    return {
      content: text || null,
      toolCalls,
      usage: {
        promptTokens: body.usageMetadata?.promptTokenCount ?? 0,
        completionTokens: body.usageMetadata?.candidatesTokenCount ?? 0,
      },
      finishReason: this.mapFinish(candidate?.finishReason, toolCalls.length > 0),
      model: request.model,
    };
  }

  async *stream(request: LlmRequest): AsyncIterable<LlmStreamEvent> {
    let response: Response;
    try {
      response = await fetch(this.url(request.model, true), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(this.buildBody(request)),
        signal: request.signal,
      });
    } catch (err) {
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

    const usage = { promptTokens: 0, completionTokens: 0 };
    const toolCalls: LlmToolCall[] = [];
    let finishReason: LlmResponse["finishReason"] = "stop";

    try {
      for await (const event of parseSseStream(response.body, request.signal)) {
        if (!event.data) continue;
        const parsed = JSON.parse(event.data) as GeminiResponseBody;

        const candidate = parsed.candidates?.[0];
        for (const part of candidate?.content?.parts ?? []) {
          if (part.text) yield { type: "text", text: part.text };
          if (part.functionCall) {
            // Gemini streams a function call as one complete part, not as
            // fragmented JSON — so unlike the other three there is nothing to
            // accumulate.
            toolCalls.push({
              id: `gemini-tool-${toolCalls.length}`,
              name: part.functionCall.name,
              arguments: part.functionCall.args ?? {},
            });
          }
        }

        if (parsed.usageMetadata) {
          usage.promptTokens = parsed.usageMetadata.promptTokenCount ?? usage.promptTokens;
          usage.completionTokens = parsed.usageMetadata.candidatesTokenCount ?? usage.completionTokens;
        }
        if (candidate?.finishReason) {
          finishReason = this.mapFinish(candidate.finishReason, toolCalls.length > 0);
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        yield { type: "done", usage, finishReason: "cancelled" };
        return;
      }
      throw err;
    }

    if (toolCalls.length > 0) {
      yield { type: "tool_calls", toolCalls };
      finishReason = "tool_calls";
    }
    yield { type: "done", usage, finishReason };
  }

  private mapFinish(reason: string | undefined, hasTools: boolean): LlmResponse["finishReason"] {
    if (hasTools) return "tool_calls";
    switch (reason) {
      case "STOP":
        return "stop";
      case "MAX_TOKENS":
        return "length";
      // SAFETY/RECITATION mean Gemini withheld the answer. Surfaced as "stop"
      // rather than "error": the turn genuinely ended, and the orchestrator's
      // empty-content path already tells the user nothing came back.
      case "SAFETY":
      case "RECITATION":
        return "stop";
      default:
        return "stop";
    }
  }

  private async toError(response: Response): Promise<LlmProviderError> {
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
      response.status === 400 && detail.toLowerCase().includes("api key")
        ? "The configured Gemini API key was rejected."
        : response.status === 429
          ? "The AI provider is rate limiting this request. Try again shortly."
          : retryable
            ? "The AI provider is temporarily unavailable."
            : `The AI provider rejected the request${detail ? `: ${detail.slice(0, 200)}` : ""}.`;

    return new LlmProviderError(message, this.name, response.status, retryable);
  }
}

interface GeminiResponseBody {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string; functionCall?: { name: string; args?: Record<string, unknown> } }> };
    finishReason?: string;
  }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

/// Gemini rejects a JSON Schema containing `additionalProperties` or `$schema`
/// with an opaque 400 that names no field. Our tool schemas set
/// `additionalProperties: false` deliberately (it is what makes a model's extra
/// invented argument an error rather than silently ignored), so rather than
/// weaken every schema for one vendor, the key is stripped here — recursively,
/// because nested object properties carry it too.
function stripUnsupportedSchemaKeys(schema: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(schema)) {
    if (key === "additionalProperties" || key === "$schema") continue;

    if (Array.isArray(value)) {
      out[key] = value.map((item) =>
        typeof item === "object" && item !== null
          ? stripUnsupportedSchemaKeys(item as Record<string, unknown>)
          : item,
      );
    } else if (typeof value === "object" && value !== null) {
      out[key] = stripUnsupportedSchemaKeys(value as Record<string, unknown>);
    } else {
      out[key] = value;
    }
  }

  return out;
}
