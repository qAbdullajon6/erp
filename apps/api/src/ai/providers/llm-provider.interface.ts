/// The seam between this ERP and whichever LLM vendor is configured.
///
/// Everything above this file — the agent loop, the tool registry, the context
/// builder, the controller — is written against these types and has never heard
/// of Anthropic or OpenAI. Switching vendors is an env var, not a refactor.
///
/// The shape deliberately mirrors the *common denominator* of the four
/// providers rather than any one of them: a messages array, a tool list, and a
/// response that is either prose or a request to call tools. Each adapter
/// translates to and from its vendor's wire format, and that translation is the
/// only place a vendor's quirks are allowed to exist.

export type LlmRole = "system" | "user" | "assistant" | "tool";

/// A tool the model may ask us to run. JSON Schema, because all four providers
/// accept it (OpenAI/Ollama natively, Anthropic as `input_schema`, Gemini as a
/// near-subset — see GeminiProvider for the one field it rejects).
export interface LlmToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/// The model asking to run a tool. `id` is the vendor's correlation id, echoed
/// back on the result so a parallel batch of calls can be matched up.
export interface LlmToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface LlmMessage {
  role: LlmRole;
  /// Null on an assistant turn that only requested tools.
  content: string | null;
  /// Present on an assistant turn that requested tools.
  toolCalls?: LlmToolCall[];
  /// Present on a tool-result turn; matches LlmToolCall.id.
  toolCallId?: string;
  /// The tool's name, which some providers require on the result message.
  toolName?: string;
}

export interface LlmUsage {
  promptTokens: number;
  completionTokens: number;
}

export type LlmFinishReason = "stop" | "tool_calls" | "length" | "cancelled" | "error";

export interface LlmResponse {
  content: string | null;
  toolCalls: LlmToolCall[];
  usage: LlmUsage;
  finishReason: LlmFinishReason;
  model: string;
}

/// One incremental event from a streaming completion.
///
/// Tool calls are NOT streamed as deltas: every provider emits their arguments
/// as fragmented JSON, and a half-parsed argument object is useless (and
/// dangerous) to act on. Adapters accumulate them and emit one `tool_calls`
/// event once they are complete and parseable.
export type LlmStreamEvent =
  | { type: "text"; text: string }
  | { type: "tool_calls"; toolCalls: LlmToolCall[] }
  | { type: "done"; usage: LlmUsage; finishReason: LlmFinishReason }
  | { type: "error"; message: string };

export interface LlmRequest {
  messages: LlmMessage[];
  /// Hoisted out of `messages` because Anthropic and Gemini take the system
  /// prompt as a separate top-level field, not as a message.
  system?: string;
  tools?: LlmToolDefinition[];
  model: string;
  maxTokens: number;
  temperature: number;
  /// Aborts the underlying HTTP request. This is what makes "Stop generating"
  /// actually stop billing, rather than merely hiding the output.
  signal?: AbortSignal;
}

export interface LlmModelInfo {
  id: string;
  label: string;
  /// Whether this model can call tools. A model that cannot is still usable for
  /// plain Q&A, and the agent loop degrades to that rather than failing.
  supportsTools: boolean;
  contextWindow: number;
}

export interface LlmProvider {
  /// Stable id used in config and persisted on each conversation.
  readonly name: string;

  /// Models this provider offers, for the UI's model selector.
  listModels(): LlmModelInfo[];

  /// True when this provider has everything it needs to make a real call.
  /// The factory refuses to select an unconfigured provider rather than
  /// failing later on the user's first message.
  isConfigured(): boolean;

  complete(request: LlmRequest): Promise<LlmResponse>;

  stream(request: LlmRequest): AsyncIterable<LlmStreamEvent>;
}

/// Thrown for a provider-side failure that the caller can render. Carries the
/// vendor's status so the orchestrator can distinguish "your key is wrong"
/// (fatal, tell the user) from "rate limited" (retryable).
export class LlmProviderError extends Error {
  constructor(
    message: string,
    readonly provider: string,
    readonly status?: number,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "LlmProviderError";
  }
}
