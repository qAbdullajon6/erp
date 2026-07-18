export interface AppConfig {
  port: number;
  nodeEnv: string;
  corsOrigins: string[];
  databaseUrl: string;
  /// Graceful shutdown timeout in milliseconds. When SIGTERM/SIGINT is received,
  /// NestJS runs onModuleDestroy/onApplicationShutdown hooks. If they don't
  /// complete within this time, the process force-exits to prevent hanging on
  /// stuck SSE streams, blocked Prisma disconnects, etc. Must be shorter than
  /// Docker's SIGKILL timeout (default 10s) to allow clean shutdown logs.
  shutdownTimeoutMs: number;
  /// Global HTTP request timeout in milliseconds. Prevents slow queries or
  /// hanging operations from blocking workers indefinitely. Does NOT apply to
  /// Server-Sent Events (SSE) endpoints (AI streaming, telematics live-stream)
  /// which are long-lived by design. Default 30000ms (30 seconds).
  requestTimeoutMs: number;
}

export interface AuthConfig {
  jwtAccessSecret: string;
  /// Seconds, not a duration string — @nestjs/jwt's newer typings want
  /// `expiresIn` as a number (interpreted as seconds) or a template-literal
  /// "StringValue" type from the `ms` package; a plain string doesn't
  /// satisfy either, so this is a number end-to-end to sidestep that.
  jwtAccessExpiresInSeconds: number;
  refreshTokenExpiresInDays: number;
}

export interface InvitationConfig {
  /// Base URL of the frontend (the origin the browser loads), used later to
  /// build the invitation accept link, e.g.
  /// `${appPublicUrl}/auth/accept-invite?token=...`. Required in production —
  /// an empty value there produces dead invite links.
  appPublicUrl: string;
  /// How long an invitation stays valid, in days. A positive integer; expiry
  /// (Invitation.expiresAt) is derived from this when an invite is sent.
  expiresInDays: number;
  /// Optional SMTP transport placeholders, wired up in the mail phase. Absent
  /// (undefined) means no real transport is configured, so the mail layer
  /// falls back to logging the link in development. SMTP_URL may embed
  /// credentials — it is read here but never logged.
  smtpUrl?: string;
  mailFrom?: string;
}

export interface WebhookConfig {
  /// Whether outbound webhooks may target private/loopback addresses.
  ///
  /// Exists so a developer can point a webhook at a local receiver
  /// (http://localhost:9000/hook) while the SSRF guard still blocks those
  /// everywhere real. Forced to false in production regardless of the
  /// environment variable — see the check in the factory below: a
  /// misconfigured deploy must not be able to switch SSRF protection off.
  allowPrivateTargets: boolean;
  /// Per-attempt HTTP timeout, milliseconds.
  timeoutMs: number;
  /// How many times a delivery is attempted in total before it is FAILED.
  maxAttempts: number;
  /// Circuit breaker: consecutive failures before opening circuit.
  /// When open, deliveries are skipped (not sent) and retried after reset timeout.
  circuitFailureThreshold: number;
  /// Circuit breaker: milliseconds before attempting half-open recovery test.
  circuitResetTimeoutMs: number;
  /// Circuit breaker: successful test requests before closing circuit.
  circuitHalfOpenRequests: number;
}

export interface AiConfig {
  /// Which vendor serves the Copilot: "anthropic" | "openai" | "gemini" |
  /// "ollama". Switching is configuration only — see ProviderFactory.
  provider: string;
  /// Explicit model id. Empty means "the active provider's default".
  model: string;
  /// Absent means that provider is unconfigured, and the factory refuses to
  /// select it rather than failing on a user's first message.
  anthropicApiKey?: string;
  openaiApiKey?: string;
  geminiApiKey?: string;
  /// Overridable so an OpenAI-compatible gateway (LiteLLM, Azure) can be used
  /// without a new adapter.
  openaiBaseUrl: string;
  ollamaBaseUrl: string;
  /// Ceiling on a single completion.
  maxTokens: number;
  temperature: number;
  /// How many times the agent loop may round-trip to the model within one user
  /// turn. Bounds both cost and runaway tool recursion.
  maxToolIterations: number;
  /// Wall-clock ceiling for one user turn, milliseconds.
  requestTimeoutMs: number;
  /// Per-user ceiling on Copilot turns per hour. The Copilot spends real money
  /// per call, so this is a cost control as much as an abuse control.
  rateLimitPerHour: number;
}

export interface TelematicsConfig {
  /// Max concurrent SSE (live-stream) connections a single organization may hold
  /// on this instance. A fairness limit: one org (or a leaky frontend opening a
  /// stream per navigation) cannot exhaust the whole process. Default 20.
  sseMaxConnectionsPerOrg: number;
  /// Max concurrent SSE connections across all organizations on this instance.
  /// A process-safety ceiling against memory / file-descriptor exhaustion. Default 500.
  sseMaxConnectionsGlobal: number;
}

export default (): {
  app: AppConfig;
  auth: AuthConfig;
  invitation: InvitationConfig;
  webhook: WebhookConfig;
  ai: AiConfig;
  telematics: TelematicsConfig;
} => {
  const nodeEnv = process.env.NODE_ENV ?? "development";
  const jwtAccessSecret = process.env.JWT_ACCESS_SECRET ?? "";

  // Fail fast and loudly rather than boot with an empty/guessable JWT
  // secret — that would let anyone forge a valid access token.
  if (!jwtAccessSecret) {
    throw new Error(
      "JWT_ACCESS_SECRET is not set. Copy apps/api/.env.example to apps/api/.env and set a real secret.",
    );
  }

  // Only required in production: locally and in tests the browser loads the web
  // app from Vite on :3000, and no invitation email is actually sent.
  const appPublicUrl = process.env.APP_PUBLIC_URL ?? "";
  if (nodeEnv === "production" && !appPublicUrl) {
    throw new Error(
      "APP_PUBLIC_URL is not set. It is required in production to build invitation links, e.g. https://app.flowerp.uz",
    );
  }

  const invitationExpiresInDays = parseInt(process.env.INVITATION_EXPIRES_IN_DAYS ?? "7", 10);
  if (!Number.isInteger(invitationExpiresInDays) || invitationExpiresInDays <= 0) {
    throw new Error(
      "INVITATION_EXPIRES_IN_DAYS must be a positive integer number of days (default 7).",
    );
  }

  // SSRF protection is not negotiable in production. Reading the flag and
  // then ANDing it with the environment (rather than trusting the variable)
  // means the only way to disable the guard in prod is to change this line
  // in review — not to set a variable on a box.
  const allowPrivateTargets =
    nodeEnv !== "production" && process.env.WEBHOOK_ALLOW_PRIVATE_TARGETS === "true";

  const webhookTimeoutMs = parseInt(process.env.WEBHOOK_TIMEOUT_MS ?? "10000", 10);
  if (!Number.isInteger(webhookTimeoutMs) || webhookTimeoutMs <= 0) {
    throw new Error("WEBHOOK_TIMEOUT_MS must be a positive integer number of milliseconds (default 10000).");
  }

  const webhookMaxAttempts = parseInt(process.env.WEBHOOK_MAX_ATTEMPTS ?? "5", 10);
  if (!Number.isInteger(webhookMaxAttempts) || webhookMaxAttempts <= 0) {
    throw new Error("WEBHOOK_MAX_ATTEMPTS must be a positive integer (default 5).");
  }

  const circuitFailureThreshold = parseInt(process.env.WEBHOOK_CIRCUIT_FAILURE_THRESHOLD ?? "5", 10);
  if (!Number.isInteger(circuitFailureThreshold) || circuitFailureThreshold <= 0) {
    throw new Error("WEBHOOK_CIRCUIT_FAILURE_THRESHOLD must be a positive integer (default 5).");
  }

  const circuitResetTimeoutMs = parseInt(process.env.WEBHOOK_CIRCUIT_RESET_TIMEOUT_MS ?? "60000", 10);
  if (!Number.isInteger(circuitResetTimeoutMs) || circuitResetTimeoutMs <= 0) {
    throw new Error("WEBHOOK_CIRCUIT_RESET_TIMEOUT_MS must be a positive integer in milliseconds (default 60000).");
  }

  const circuitHalfOpenRequests = parseInt(process.env.WEBHOOK_CIRCUIT_HALF_OPEN_REQUESTS ?? "3", 10);
  if (!Number.isInteger(circuitHalfOpenRequests) || circuitHalfOpenRequests <= 0) {
    throw new Error("WEBHOOK_CIRCUIT_HALF_OPEN_REQUESTS must be a positive integer (default 3).");
  }

  const aiProvider = (process.env.AI_PROVIDER ?? "anthropic").toLowerCase();
  const KNOWN_AI_PROVIDERS = ["anthropic", "openai", "gemini", "ollama"];
  if (!KNOWN_AI_PROVIDERS.includes(aiProvider)) {
    throw new Error(
      `AI_PROVIDER must be one of: ${KNOWN_AI_PROVIDERS.join(", ")} (got "${aiProvider}").`,
    );
  }

  const aiMaxTokens = parseInt(process.env.AI_MAX_TOKENS ?? "4096", 10);
  if (!Number.isInteger(aiMaxTokens) || aiMaxTokens <= 0) {
    throw new Error("AI_MAX_TOKENS must be a positive integer (default 4096).");
  }

  const aiTemperature = Number.parseFloat(process.env.AI_TEMPERATURE ?? "0.2");
  if (!Number.isFinite(aiTemperature) || aiTemperature < 0 || aiTemperature > 2) {
    throw new Error("AI_TEMPERATURE must be between 0 and 2 (default 0.2).");
  }

  const aiMaxToolIterations = parseInt(process.env.AI_MAX_TOOL_ITERATIONS ?? "8", 10);
  if (!Number.isInteger(aiMaxToolIterations) || aiMaxToolIterations <= 0) {
    throw new Error("AI_MAX_TOOL_ITERATIONS must be a positive integer (default 8).");
  }

  const aiRateLimitPerHour = parseInt(process.env.AI_RATE_LIMIT_PER_HOUR ?? "120", 10);
  if (!Number.isInteger(aiRateLimitPerHour) || aiRateLimitPerHour <= 0) {
    throw new Error("AI_RATE_LIMIT_PER_HOUR must be a positive integer (default 120).");
  }

  const aiRequestTimeoutMs = parseInt(process.env.AI_REQUEST_TIMEOUT_MS ?? "120000", 10);
  if (!Number.isInteger(aiRequestTimeoutMs) || aiRequestTimeoutMs <= 0) {
    throw new Error("AI_REQUEST_TIMEOUT_MS must be a positive integer (default 120000).");
  }

  const shutdownTimeoutMs = parseInt(process.env.SHUTDOWN_TIMEOUT_MS ?? "30000", 10);
  if (!Number.isInteger(shutdownTimeoutMs) || shutdownTimeoutMs <= 0) {
    throw new Error("SHUTDOWN_TIMEOUT_MS must be a positive integer in milliseconds (default 30000).");
  }

  const requestTimeoutMs = parseInt(process.env.REQUEST_TIMEOUT_MS ?? "30000", 10);
  if (!Number.isInteger(requestTimeoutMs) || requestTimeoutMs <= 0) {
    throw new Error("REQUEST_TIMEOUT_MS must be a positive integer in milliseconds (default 30000).");
  }

  const telematicsSseMaxPerOrg = parseInt(process.env.TELEMATICS_SSE_MAX_CONNECTIONS_PER_ORG ?? "20", 10);
  if (!Number.isInteger(telematicsSseMaxPerOrg) || telematicsSseMaxPerOrg <= 0) {
    throw new Error("TELEMATICS_SSE_MAX_CONNECTIONS_PER_ORG must be a positive integer (default 20).");
  }

  const telematicsSseMaxGlobal = parseInt(process.env.TELEMATICS_SSE_MAX_CONNECTIONS_GLOBAL ?? "500", 10);
  if (!Number.isInteger(telematicsSseMaxGlobal) || telematicsSseMaxGlobal <= 0) {
    throw new Error("TELEMATICS_SSE_MAX_CONNECTIONS_GLOBAL must be a positive integer (default 500).");
  }

  return {
    ai: {
      provider: aiProvider,
      model: process.env.AI_MODEL ?? "",
      // Empty string -> undefined, so "configured" is a simple presence check.
      anthropicApiKey: process.env.ANTHROPIC_API_KEY || undefined,
      openaiApiKey: process.env.OPENAI_API_KEY || undefined,
      geminiApiKey: process.env.GEMINI_API_KEY || undefined,
      openaiBaseUrl: process.env.AI_OPENAI_BASE_URL ?? "https://api.openai.com/v1",
      ollamaBaseUrl: process.env.AI_OLLAMA_BASE_URL ?? "http://127.0.0.1:11434",
      maxTokens: aiMaxTokens,
      temperature: aiTemperature,
      maxToolIterations: aiMaxToolIterations,
      requestTimeoutMs: aiRequestTimeoutMs,
      rateLimitPerHour: aiRateLimitPerHour,
    },
    webhook: {
      allowPrivateTargets,
      timeoutMs: webhookTimeoutMs,
      maxAttempts: webhookMaxAttempts,
      circuitFailureThreshold,
      circuitResetTimeoutMs,
      circuitHalfOpenRequests,
    },
    telematics: {
      sseMaxConnectionsPerOrg: telematicsSseMaxPerOrg,
      sseMaxConnectionsGlobal: telematicsSseMaxGlobal,
    },
    app: {
      port: parseInt(process.env.PORT ?? "4000", 10),
      nodeEnv,
      corsOrigins: (process.env.CORS_ORIGIN ?? "")
        .split(",")
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0),
      databaseUrl: process.env.DATABASE_URL ?? "",
      shutdownTimeoutMs,
      requestTimeoutMs,
    },
    auth: {
      jwtAccessSecret,
      jwtAccessExpiresInSeconds: parseInt(process.env.JWT_ACCESS_EXPIRES_IN_SECONDS ?? "900", 10),
      refreshTokenExpiresInDays: parseInt(process.env.REFRESH_TOKEN_EXPIRES_IN_DAYS ?? "30", 10),
    },
    invitation: {
      appPublicUrl,
      expiresInDays: invitationExpiresInDays,
      // Empty string -> undefined, so the mail layer can treat "no transport
      // configured" as a simple presence check.
      smtpUrl: process.env.SMTP_URL || undefined,
      mailFrom: process.env.MAIL_FROM || undefined,
    },
  };
};
