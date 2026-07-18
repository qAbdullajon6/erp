import { apiFetch } from "./fetch";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { unwrapResponse as unwrap } from "./error";

// ── TypeScript interfaces ──────────────────────────────────────────

export type ApiKeyStatus = "ACTIVE" | "DISABLED" | "REVOKED";

export interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  /// Present ONLY on the create and rotate responses — the one time the
  /// server returns the secret. Never present in a list/get.
  rawKey?: string;
  scopes: string[];
  status: ApiKeyStatus;
  expiresAt: string | null;
  lastUsedAt: string | null;
  rateLimitPerMinute: number;
  createdAt: string;
}

export interface CreateApiKeyInput {
  name: string;
  scopes: string[];
  expiresAt?: string;
  rateLimitPerMinute?: number;
}

export interface UpdateApiKeyInput {
  name?: string;
  scopes?: string[];
  rateLimitPerMinute?: number;
}

export interface WebhookEndpoint {
  id: string;
  name: string;
  url: string;
  /// Optional for the same reason as ApiKey.rawKey: the signing secret comes
  /// back only from create and rotate-secret. A list/get deliberately
  /// withholds it, so typing this as required would be a lie the compiler
  /// would happily let the UI act on.
  secret?: string;
  events: string[];
  isActive: boolean;
  version: number;
  description: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastFailureReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWebhookInput {
  name: string;
  url: string;
  events: string[];
  description?: string;
}

export interface UpdateWebhookInput {
  name?: string;
  url?: string;
  events?: string[];
  isActive?: boolean;
  description?: string;
}

export type WebhookDeliveryStatus = "PENDING" | "DELIVERING" | "DELIVERED" | "FAILED";

export interface WebhookDelivery {
  id: string;
  endpointId: string;
  event: string;
  status: WebhookDeliveryStatus;
  httpStatus: number | null;
  attemptCount: number;
  durationMs: number | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
  failedAt: string | null;
}

export interface WebhookDeliveryAttempt {
  id: string;
  attemptNumber: number;
  status: string;
  httpStatus: number | null;
  responseBody: string | null;
  durationMs: number | null;
  errorMessage: string | null;
  createdAt: string;
}

export interface DeliveryDetail extends WebhookDelivery {
  payload: unknown;
  requestHeaders: Record<string, string> | null;
  responseBody: string | null;
  replayOfId: string | null;
  deliveryAttempts: WebhookDeliveryAttempt[];
}

export interface UsageStats {
  totalCalls: number;
  avgLatencyMs: number;
  statusBreakdown: Record<string, number>;
  endpointBreakdown: Record<string, number>;
  successCount: number;
  failureCount: number;
  successRate: number;
  webhookDeliveries: {
    total: number;
    delivered: number;
    failed: number;
    successRate: number;
  };
  lastActivityAt: string | null;
  dailyUsage: Array<{ date: string; count: number }>;
  monthlyUsage: Array<{ month: string; count: number }>;
}

// ── API class ──────────────────────────────────────────────────────

class DeveloperAPI {
  /// Vite proxies /api to the API and strips the prefix (see vite.config.ts),
  /// and any production reverse proxy must do the same. Every sibling client
  /// (customers.ts, orders.ts, auth.ts, ...) carries this same field; this one
  /// omitted it, so every Developer Portal request hit the dev server itself
  /// and 404'd.
  private baseUrl = "/api";

  // API Keys
  async listApiKeys(): Promise<{ items: ApiKey[] }> {
    const res = await apiFetch(`${this.baseUrl}/admin/api-keys`, { method: "GET" });
    return unwrap(res, "Failed to fetch API keys");
  }

  async createApiKey(input: CreateApiKeyInput): Promise<ApiKey> {
    const res = await apiFetch(`${this.baseUrl}/admin/api-keys`, { method: "POST", body: JSON.stringify(input) });
    return unwrap(res, "Failed to create API key");
  }

  async updateApiKey(id: string, input: UpdateApiKeyInput): Promise<ApiKey> {
    const res = await apiFetch(`${this.baseUrl}/admin/api-keys/${id}`, { method: "PATCH", body: JSON.stringify(input) });
    return unwrap(res, "Failed to update API key");
  }

  async revokeApiKey(id: string): Promise<ApiKey> {
    const res = await apiFetch(`${this.baseUrl}/admin/api-keys/${id}`, { method: "DELETE" });
    return unwrap(res, "Failed to revoke API key");
  }

  async rotateApiKey(id: string): Promise<ApiKey> {
    const res = await apiFetch(`${this.baseUrl}/admin/api-keys/${id}/rotate`, { method: "POST" });
    return unwrap(res, "Failed to rotate API key");
  }

  async setApiKeyEnabled(id: string, enabled: boolean): Promise<ApiKey> {
    const res = await apiFetch(`${this.baseUrl}/admin/api-keys/${id}/${enabled ? "enable" : "disable"}`, {
      method: "POST",
    });
    return unwrap(res, `Failed to ${enabled ? "enable" : "disable"} API key`);
  }

  // Webhooks
  async listWebhooks(): Promise<{ items: WebhookEndpoint[] }> {
    const res = await apiFetch(`${this.baseUrl}/admin/webhooks`, { method: "GET" });
    return unwrap(res, "Failed to fetch webhooks");
  }

  async createWebhook(input: CreateWebhookInput): Promise<WebhookEndpoint> {
    const res = await apiFetch(`${this.baseUrl}/admin/webhooks`, { method: "POST", body: JSON.stringify(input) });
    return unwrap(res, "Failed to create webhook");
  }

  async updateWebhook(id: string, input: UpdateWebhookInput): Promise<WebhookEndpoint> {
    const res = await apiFetch(`${this.baseUrl}/admin/webhooks/${id}`, { method: "PATCH", body: JSON.stringify(input) });
    return unwrap(res, "Failed to update webhook");
  }

  async deleteWebhook(id: string): Promise<void> {
    const res = await apiFetch(`${this.baseUrl}/admin/webhooks/${id}`, { method: "DELETE" });
    await unwrap(res, "Failed to delete webhook");
  }

  async enableWebhook(id: string): Promise<WebhookEndpoint> {
    const res = await apiFetch(`${this.baseUrl}/admin/webhooks/${id}/enable`, { method: "POST" });
    return unwrap(res, "Failed to enable webhook");
  }

  async disableWebhook(id: string): Promise<WebhookEndpoint> {
    const res = await apiFetch(`${this.baseUrl}/admin/webhooks/${id}/disable`, { method: "POST" });
    return unwrap(res, "Failed to disable webhook");
  }

  async rotateWebhookSecret(id: string): Promise<WebhookEndpoint> {
    const res = await apiFetch(`${this.baseUrl}/admin/webhooks/${id}/rotate-secret`, { method: "POST" });
    return unwrap(res, "Failed to rotate webhook secret");
  }

  async listWebhookEvents(): Promise<{ items: string[] }> {
    const res = await apiFetch(`${this.baseUrl}/admin/webhooks/events`, { method: "GET" });
    return unwrap(res, "Failed to fetch webhook events");
  }

  /// Sends a synthetic delivery and resolves with its settled result, so the
  /// UI can report reachable/unreachable rather than merely "queued".
  async testWebhook(id: string, event?: string): Promise<DeliveryDetail> {
    const res = await apiFetch(`${this.baseUrl}/admin/webhooks/${id}/test`, {
      method: "POST",
      body: JSON.stringify(event ? { event } : {}),
    });
    return unwrap(res, "Failed to send test delivery");
  }

  // Deliveries
  async listDeliveries(webhookId: string): Promise<{ items: WebhookDelivery[] }> {
    const res = await apiFetch(`${this.baseUrl}/admin/webhooks/${webhookId}/deliveries`, { method: "GET" });
    return unwrap(res, "Failed to fetch deliveries");
  }

  async getDelivery(webhookId: string, deliveryId: string): Promise<DeliveryDetail> {
    const res = await apiFetch(`${this.baseUrl}/admin/webhooks/${webhookId}/deliveries/${deliveryId}`, { method: "GET" });
    return unwrap(res, "Failed to fetch delivery");
  }

  async replayDelivery(
    webhookId: string,
    deliveryId: string,
  ): Promise<{ replayId: string; newDeliveryId: string; originalDeliveryId: string }> {
    const res = await apiFetch(`${this.baseUrl}/admin/webhooks/${webhookId}/deliveries/${deliveryId}/replay`, { method: "POST" });
    return unwrap(res, "Failed to replay delivery");
  }

  /// Re-queues the SAME failed delivery, continuing its attempt history —
  /// distinct from replay, which forks a new delivery from the same payload.
  async retryDelivery(webhookId: string, deliveryId: string): Promise<DeliveryDetail> {
    const res = await apiFetch(`${this.baseUrl}/admin/webhooks/${webhookId}/deliveries/${deliveryId}/retry`, { method: "POST" });
    return unwrap(res, "Failed to retry delivery");
  }

  // Usage
  async getUsageStats(startDate?: string, endDate?: string): Promise<UsageStats> {
    const params = new URLSearchParams();
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    const qs = params.toString();
    const res = await apiFetch(`${this.baseUrl}/admin/usage${qs ? `?${qs}` : ""}`, { method: "GET" });
    return unwrap(res, "Failed to fetch usage stats");
  }
}

export const developerAPI = new DeveloperAPI();

// ── Query keys ─────────────────────────────────────────────────────

export const developerKeys = {
  apiKeys: { all: ["api-keys"] as const, lists: () => [...developerKeys.apiKeys.all, "list"] as const },
  webhooks: { all: ["webhooks"] as const, lists: () => [...developerKeys.webhooks.all, "list"] as const },
  deliveries: (webhookId: string) => ["deliveries", webhookId] as const,
  delivery: (webhookId: string, deliveryId: string) => ["deliveries", webhookId, deliveryId] as const,
  usage: { all: ["usage"] as const, stats: (start?: string, end?: string) => [...developerKeys.usage.all, start, end] as const },
};

// ── React Query hooks — API Keys ───────────────────────────────────

export function useApiKeysQuery() {
  return useQuery({
    queryKey: developerKeys.apiKeys.lists(),
    queryFn: () => developerAPI.listApiKeys(),
  });
}

export function useCreateApiKeyMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateApiKeyInput) => developerAPI.createApiKey(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: developerKeys.apiKeys.all }),
  });
}

export function useUpdateApiKeyMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateApiKeyInput }) => developerAPI.updateApiKey(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: developerKeys.apiKeys.all }),
  });
}

export function useRevokeApiKeyMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => developerAPI.revokeApiKey(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: developerKeys.apiKeys.all }),
  });
}

export function useRotateApiKeyMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => developerAPI.rotateApiKey(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: developerKeys.apiKeys.all }),
  });
}

export function useSetApiKeyEnabledMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      developerAPI.setApiKeyEnabled(id, enabled),
    onSuccess: () => qc.invalidateQueries({ queryKey: developerKeys.apiKeys.all }),
  });
}

// ── React Query hooks — Webhooks ───────────────────────────────────

export function useWebhooksQuery() {
  return useQuery({
    queryKey: developerKeys.webhooks.lists(),
    queryFn: () => developerAPI.listWebhooks(),
  });
}

export function useCreateWebhookMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateWebhookInput) => developerAPI.createWebhook(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: developerKeys.webhooks.all }),
  });
}

export function useUpdateWebhookMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateWebhookInput }) => developerAPI.updateWebhook(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: developerKeys.webhooks.all }),
  });
}

export function useDeleteWebhookMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => developerAPI.deleteWebhook(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: developerKeys.webhooks.all }),
  });
}

export function useEnableWebhookMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => developerAPI.enableWebhook(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: developerKeys.webhooks.all }),
  });
}

export function useDisableWebhookMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => developerAPI.disableWebhook(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: developerKeys.webhooks.all }),
  });
}

export function useRotateWebhookSecretMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => developerAPI.rotateWebhookSecret(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: developerKeys.webhooks.all }),
  });
}

export function useWebhookEventsQuery() {
  return useQuery({
    queryKey: [...developerKeys.webhooks.all, "events"],
    queryFn: () => developerAPI.listWebhookEvents(),
    // The supported-event set changes only on deploy, so refetching it per
    // mount is pure waste.
    staleTime: Infinity,
  });
}

export function useTestWebhookMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, event }: { id: string; event?: string }) =>
      developerAPI.testWebhook(id, event),
    onSuccess: (_data, variables) => {
      // A test writes a delivery row and moves the endpoint's
      // lastSuccess/lastFailure, so both lists are now stale.
      void qc.invalidateQueries({ queryKey: developerKeys.webhooks.all });
      void qc.invalidateQueries({ queryKey: developerKeys.deliveries(variables.id) });
    },
  });
}

// ── React Query hooks — Deliveries ─────────────────────────────────

export function useDeliveriesQuery(webhookId: string | null) {
  return useQuery({
    queryKey: developerKeys.deliveries(webhookId ?? ""),
    queryFn: () => developerAPI.listDeliveries(webhookId!),
    enabled: !!webhookId,
  });
}

export function useDeliveryQuery(webhookId: string | null, deliveryId: string | null) {
  return useQuery({
    queryKey: developerKeys.delivery(webhookId ?? "", deliveryId ?? ""),
    queryFn: () => developerAPI.getDelivery(webhookId!, deliveryId!),
    enabled: !!webhookId && !!deliveryId,
  });
}

export function useReplayDeliveryMutation(webhookId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (deliveryId: string) => developerAPI.replayDelivery(webhookId, deliveryId),
    onSuccess: () => qc.invalidateQueries({ queryKey: developerKeys.deliveries(webhookId) }),
  });
}

export function useRetryDeliveryMutation(webhookId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (deliveryId: string) => developerAPI.retryDelivery(webhookId, deliveryId),
    onSuccess: (_data, deliveryId) => {
      // Retry mutates the delivery in place, so its detail view is stale too —
      // unlike replay, which only adds a row to the list.
      void qc.invalidateQueries({ queryKey: developerKeys.deliveries(webhookId) });
      void qc.invalidateQueries({ queryKey: developerKeys.delivery(webhookId, deliveryId) });
    },
  });
}

// ── React Query hooks — Usage ──────────────────────────────────────

export function useUsageStatsQuery(startDate?: string, endDate?: string) {
  return useQuery({
    queryKey: developerKeys.usage.stats(startDate, endDate),
    queryFn: () => developerAPI.getUsageStats(startDate, endDate),
  });
}
