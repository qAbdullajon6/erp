import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AiConfig } from "../../config/configuration";
import {
  LlmProviderError,
  type LlmModelInfo,
  type LlmProvider,
  type LlmRequest,
  type LlmResponse,
  type LlmStreamEvent,
  type LlmToolCall,
} from "./llm-provider.interface";
import {
  mapOpenAiFinish,
  streamOpenAiCompatible,
  toOpenAiError,
  toOpenAiMessages,
  toOpenAiTools,
} from "./openai.provider";

/// Ollama, via its OpenAI-compatible endpoint (`/v1/chat/completions`).
///
/// Deliberately NOT its native `/api/chat`: the compatible endpoint speaks the
/// exact wire format the OpenAI adapter already implements, so this adapter is
/// configuration plus a model list rather than a second streaming parser to
/// keep correct. The native API's only advantage is Modelfile options we do not
/// use.
///
/// The point of supporting it: a self-hosted model means an organization can run
/// the Copilot with no data leaving their network and no per-token cost — which
/// for a logistics company reviewing customer and pricing data is often the
/// deciding factor.
@Injectable()
export class OllamaProvider implements LlmProvider {
  readonly name = "ollama";

  constructor(private readonly config: ConfigService) {}

  private get aiConfig(): AiConfig {
    return this.config.getOrThrow<AiConfig>("ai");
  }

  /// A base URL is all it needs — a local server has no API key. Configured
  /// therefore means "an operator pointed us at one", not "we proved it is up";
  /// reachability is checked by listAvailableModels and by the first call.
  isConfigured(): boolean {
    return !!this.aiConfig.ollamaBaseUrl;
  }

  /// Static, because listing real models requires an HTTP call and this is on
  /// the synchronous path that builds the model selector. These are the
  /// tool-capable models Ollama ships; an operator running something else sets
  /// AI_MODEL explicitly and the factory honours it.
  listModels(): LlmModelInfo[] {
    return [
      { id: "llama3.1", label: "Llama 3.1 8B (local)", supportsTools: true, contextWindow: 128_000 },
      { id: "llama3.2", label: "Llama 3.2 3B (local)", supportsTools: true, contextWindow: 128_000 },
      { id: "qwen2.5", label: "Qwen 2.5 7B (local)", supportsTools: true, contextWindow: 32_000 },
      { id: "mistral", label: "Mistral 7B (local)", supportsTools: true, contextWindow: 32_000 },
    ];
  }

  /// What the server actually has pulled. Used by the health endpoint so an
  /// operator can tell "Ollama is down" from "the model is not pulled" —
  /// otherwise both present as the same opaque failure on first use.
  async listAvailableModels(): Promise<string[]> {
    const base = this.aiConfig.ollamaBaseUrl.replace(/\/$/, "");
    const response = await fetch(`${base}/api/tags`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new LlmProviderError("Ollama is not reachable", this.name, response.status, true);
    const body = (await response.json()) as { models?: Array<{ name?: string }> };
    return (body.models ?? []).map((m) => m.name ?? "").filter(Boolean);
  }

  private get url(): string {
    return `${this.aiConfig.ollamaBaseUrl.replace(/\/$/, "")}/v1/chat/completions`;
  }

  /// Ollama ignores auth, but sends a placeholder because some OpenAI-compatible
  /// proxies in front of it (LiteLLM, vLLM) reject a request with no Bearer.
  private headers(): Record<string, string> {
    return { "Content-Type": "application/json", Authorization: "Bearer ollama" };
  }

  private buildBody(request: LlmRequest, stream: boolean): Record<string, unknown> {
    return {
      model: request.model,
      messages: toOpenAiMessages(request.messages, request.system),
      max_tokens: request.maxTokens,
      temperature: request.temperature,
      ...(toOpenAiTools(request) ? { tools: toOpenAiTools(request) } : {}),
      ...(stream ? { stream: true } : {}),
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
          tool_calls?: Array<{ id?: string; function: { name: string; arguments: string | Record<string, unknown> } }>;
        };
        finish_reason: string;
      }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    const choice = body.choices[0];
    const toolCalls: LlmToolCall[] = (choice?.message.tool_calls ?? []).map((c, i) => ({
      // Ollama frequently omits the call id that OpenAI always sends. One is
      // synthesised because the tool-result message must reference something,
      // and an empty id would silently mismatch on the next turn.
      id: c.id || `ollama-tool-${i}`,
      name: c.function.name,
      arguments:
        typeof c.function.arguments === "string"
          ? (safeParse(c.function.arguments) ?? {})
          : (c.function.arguments ?? {}),
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

function safeParse(raw: string): Record<string, unknown> | null {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}
