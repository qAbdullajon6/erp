import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AiConfig } from "../../config/configuration";
import { AnthropicProvider } from "./anthropic.provider";
import { GeminiProvider } from "./gemini.provider";
import { OllamaProvider } from "./ollama.provider";
import { OpenAiProvider } from "./openai.provider";
import type { LlmModelInfo, LlmProvider } from "./llm-provider.interface";

/// Selects the configured provider.
///
/// This is the only place that knows all four exist. Everything downstream
/// takes an `LlmProvider`, so switching vendors is `AI_PROVIDER=openai` in the
/// environment — no code change, no redeploy of anything but config.
@Injectable()
export class ProviderFactory {
  private readonly logger = new Logger(ProviderFactory.name);
  private readonly providers: LlmProvider[];

  constructor(
    private readonly config: ConfigService,
    anthropic: AnthropicProvider,
    openai: OpenAiProvider,
    gemini: GeminiProvider,
    ollama: OllamaProvider,
  ) {
    this.providers = [anthropic, openai, gemini, ollama];
  }

  private get aiConfig(): AiConfig {
    return this.config.getOrThrow<AiConfig>("ai");
  }

  /// The provider the deployment is set to use.
  ///
  /// Throws rather than silently falling back to another vendor: if an operator
  /// configured Anthropic and the key is missing, quietly answering via Ollama
  /// would send their data somewhere they did not choose.
  get(): LlmProvider {
    const name = this.aiConfig.provider;
    if (!name) {
      throw new ServiceUnavailableException(
        "The AI Copilot is disabled. Set AI_PROVIDER to anthropic, openai, gemini, or ollama and provide the matching API key.",
      );
    }
    const provider = this.providers.find((p) => p.name === name);

    if (!provider) {
      throw new ServiceUnavailableException(
        `AI_PROVIDER is set to "${name}", which is not a known provider. Valid: ${this.providers
          .map((p) => p.name)
          .join(", ")}`,
      );
    }

    if (!provider.isConfigured()) {
      throw new ServiceUnavailableException(
        `The AI Copilot is not configured: provider "${name}" is selected but its credentials are missing. ` +
          `Set ${this.credentialNameFor(name)} in the API environment.`,
      );
    }

    return provider;
  }

  /// Whether the Copilot can serve a request at all. The controller uses this
  /// to answer /ai/health, so the UI can say "not configured" instead of
  /// failing on the user's first message.
  isConfigured(): boolean {
    const provider = this.providers.find((p) => p.name === this.aiConfig.provider);
    return !!provider?.isConfigured();
  }

  /// Every provider that COULD serve, for diagnostics. Not for switching — the
  /// active provider is a deployment decision, not a per-request one.
  listConfigured(): string[] {
    return this.providers.filter((p) => p.isConfigured()).map((p) => p.name);
  }

  /// Models offered by the active provider, for the UI's selector.
  ///
  /// Only the active provider's: offering another vendor's models would let a
  /// user pick one that cannot be served.
  listModels(): LlmModelInfo[] {
    const provider = this.providers.find((p) => p.name === this.aiConfig.provider);
    if (!provider) return [];
    return provider.listModels();
  }

  /// The model to use when a conversation does not name one. An operator's
  /// explicit AI_MODEL wins; otherwise the provider's first listed model, which
  /// each adapter orders with its best general-purpose model first.
  defaultModel(): string {
    const configured = this.aiConfig.model;
    if (configured) return configured;

    const models = this.listModels();
    if (models.length === 0) {
      throw new ServiceUnavailableException(
        `No model is configured for provider "${this.aiConfig.provider}". Set AI_MODEL.`,
      );
    }
    return models[0].id;
  }

  /// Rejects a model the active provider does not offer, so a stale
  /// conversation (or a hand-crafted request) cannot pin a model from a vendor
  /// the deployment has since switched away from.
  resolveModel(requested?: string | null): string {
    if (!requested) return this.defaultModel();

    const known = this.listModels().some((m) => m.id === requested);
    if (known) return requested;

    // An operator running a self-hosted model we do not list is legitimate, so
    // for Ollama an unknown id is honoured rather than refused.
    if (this.aiConfig.provider === "ollama") return requested;

    this.logger.warn(
      `Model "${requested}" is not offered by provider "${this.aiConfig.provider}"; using the default instead.`,
    );
    return this.defaultModel();
  }

  private credentialNameFor(provider: string): string {
    switch (provider) {
      case "anthropic":
        return "ANTHROPIC_API_KEY";
      case "openai":
        return "OPENAI_API_KEY";
      case "gemini":
        return "GEMINI_API_KEY";
      case "ollama":
        return "AI_OLLAMA_BASE_URL";
      default:
        return "the provider's credentials";
    }
  }
}
