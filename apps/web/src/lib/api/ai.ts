import { apiFetch } from './fetch';
import { unwrapResponse } from './error';
import { sessionManager } from './session';

export type AiRole = 'USER' | 'ASSISTANT';

export interface AiToolCallSummary {
  id: string;
  name: string;
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'DENIED';
  durationMs: number | null;
  error: string | null;
}

export interface AiMessage {
  id: string;
  role: AiRole;
  content: string | null;
  model: string | null;
  filtered: boolean;
  finishReason: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  latencyMs: number | null;
  createdAt: string;
  toolCalls: AiToolCallSummary[];
}

export interface AiConversation {
  id: string;
  title: string;
  status: 'ACTIVE' | 'ARCHIVED';
  pinned: boolean;
  readOnly: boolean;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string;
}

export interface AiConversationDetail extends Omit<AiConversation, 'updatedAt'> {
  messages: AiMessage[];
}

export interface AiModelInfo {
  id: string;
  label: string;
  supportsTools: boolean;
  contextWindow: number;
}

export interface AiCapabilities {
  available: boolean;
  configured: boolean;
  provider: string;
  models: AiModelInfo[];
  defaultModel: string | null;
  tools: Array<{ name: string; description: string; mutating: boolean }>;
  suggestions: string[];
  rateLimit: { remaining: number; resetAt: number };
}

export interface AiMemoryEntry {
  id: string;
  kind: 'PINNED' | 'PREFERENCE' | 'ENTITY_REFERENCE' | 'SUMMARY';
  content: string;
  conversationId: string | null;
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AiConversationListResponse {
  items: AiConversation[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface ExecutionTrace {
  iterations: number;
  toolsCalled: Array<{ name: string; status: string; durationMs: number }>;
  totalDurationMs: number;
  retries: number;
  failures: number;
  recovered: number;
}

/// One event from the chat stream. Mirrors ChatEvent in the API's ai.service.ts.
export type ChatStreamEvent =
  | { type: 'text'; text: string }
  | { type: 'tool_start'; name: string }
  | { type: 'tool_end'; name: string; status: string; durationMs?: number; error?: string }
  | { type: 'planning'; steps: string[] }
  | { type: 'confirmation_required'; action: string; details: Record<string, unknown> }
  | { type: 'done'; messageId: string; usage: { promptTokens: number; completionTokens: number }; finishReason: string; trace: ExecutionTrace }
  | { type: 'error'; message: string };

class AiAPI {
  private baseUrl = '/api/ai';

  async capabilities(): Promise<AiCapabilities> {
    const response = await apiFetch(`${this.baseUrl}/capabilities`);
    return unwrapResponse<AiCapabilities>(response, 'Failed to load AI capabilities');
  }

  async health(): Promise<{ configured: boolean; provider: string | null; configuredProviders: string[] }> {
    const response = await apiFetch(`${this.baseUrl}/health`);
    return unwrapResponse(response, 'Failed to check AI status');
  }

  async createConversation(params: { title?: string; model?: string; readOnly?: boolean } = {}): Promise<AiConversation> {
    const response = await apiFetch(`${this.baseUrl}/conversations`, {
      method: 'POST',
      body: JSON.stringify(params),
    });
    return unwrapResponse<AiConversation>(response, 'Failed to start a conversation');
  }

  async listConversations(params: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
  } = {}): Promise<AiConversationListResponse> {
    const qs = new URLSearchParams();
    if (params.page) qs.set('page', String(params.page));
    if (params.limit) qs.set('limit', String(params.limit));
    if (params.search) qs.set('search', params.search);
    if (params.status) qs.set('status', params.status);
    const query = qs.toString();
    const response = await apiFetch(`${this.baseUrl}/conversations${query ? `?${query}` : ''}`);
    return unwrapResponse<AiConversationListResponse>(response, 'Failed to load conversations');
  }

  async getConversation(id: string): Promise<AiConversationDetail> {
    const response = await apiFetch(`${this.baseUrl}/conversations/${id}`);
    return unwrapResponse<AiConversationDetail>(response, 'Failed to load the conversation');
  }

  async rename(id: string, title: string): Promise<AiConversation> {
    const response = await apiFetch(`${this.baseUrl}/conversations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    });
    return unwrapResponse<AiConversation>(response, 'Failed to rename');
  }

  async setPinned(id: string, pinned: boolean): Promise<AiConversation> {
    const response = await apiFetch(`${this.baseUrl}/conversations/${id}/pin`, {
      method: 'POST',
      body: JSON.stringify({ pinned }),
    });
    return unwrapResponse<AiConversation>(response, 'Failed to pin');
  }

  async setStatus(id: string, status: 'ACTIVE' | 'ARCHIVED'): Promise<AiConversation> {
    const response = await apiFetch(`${this.baseUrl}/conversations/${id}/status`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    });
    return unwrapResponse<AiConversation>(response, 'Failed to update');
  }

  async remove(id: string): Promise<void> {
    const response = await apiFetch(`${this.baseUrl}/conversations/${id}`, { method: 'DELETE' });
    await unwrapResponse(response, 'Failed to delete the conversation');
  }

  async cancel(id: string): Promise<{ cancelled: boolean }> {
    const response = await apiFetch(`${this.baseUrl}/conversations/${id}/cancel`, { method: 'POST' });
    return unwrapResponse(response, 'Failed to stop generating');
  }

  async confirm(id: string, confirmed: boolean): Promise<{ acknowledged: boolean }> {
    const response = await apiFetch(`${this.baseUrl}/conversations/${id}/confirm`, {
      method: 'POST',
      body: JSON.stringify({ confirmed }),
    });
    return unwrapResponse(response, 'Failed to confirm action');
  }

  /// Streams a turn.
  ///
  /// fetch + ReadableStream rather than EventSource: EventSource cannot send an
  /// Authorization header (so the token would have to go in the URL, and into
  /// every access log), cannot POST (so the question would too), and cannot be
  /// aborted cleanly. This costs a hand-written SSE reader and buys correct auth.
  async *streamChat(
    conversationId: string,
    message: string,
    signal?: AbortSignal,
  ): AsyncGenerator<ChatStreamEvent> {
    const token = sessionManager.getAccessToken();
    const response = await fetch(`${this.baseUrl}/conversations/${conversationId}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ message }),
      signal,
    });

    if (!response.ok) {
      // The error arrives as the normal JSON envelope, because the failure
      // happened before any SSE header was written.
      let detail = 'The assistant is unavailable.';
      try {
        const body = (await response.json()) as { error?: { message?: string } };
        detail = body.error?.message ?? detail;
      } catch {
        /* non-JSON error body */
      }
      yield { type: 'error', message: detail };
      return;
    }

    if (!response.body) {
      yield { type: 'error', message: 'The assistant returned no response.' };
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;

        // stream: true holds a partial multi-byte character until the rest
        // arrives — without it an accented name split across two chunks
        // arrives corrupted mid-answer.
        buffer += decoder.decode(value, { stream: true });

        let boundary = buffer.indexOf('\n\n');
        while (boundary !== -1) {
          const raw = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);

          for (const line of raw.split('\n')) {
            if (!line.startsWith('data:')) continue;
            const data = line.slice(5).trim();
            if (!data) continue;
            try {
              yield JSON.parse(data) as ChatStreamEvent;
            } catch {
              // A frame we cannot parse is not worth killing the stream over.
            }
          }
          boundary = buffer.indexOf('\n\n');
        }
      }
    } finally {
      // Releases the socket on abort; without it a stopped generation leaks the
      // connection until GC.
      reader.releaseLock();
    }
  }

  async listMemory(): Promise<{ items: AiMemoryEntry[] }> {
    const response = await apiFetch(`${this.baseUrl}/memory`);
    return unwrapResponse(response, 'Failed to load memory');
  }

  async remember(kind: 'PINNED' | 'PREFERENCE', content: string): Promise<{ id: string | null }> {
    const response = await apiFetch(`${this.baseUrl}/memory`, {
      method: 'POST',
      body: JSON.stringify({ kind, content }),
    });
    return unwrapResponse(response, 'Failed to save');
  }

  async forget(id: string): Promise<{ forgotten: boolean }> {
    const response = await apiFetch(`${this.baseUrl}/memory/${id}`, { method: 'DELETE' });
    return unwrapResponse(response, 'Failed to forget');
  }
}

export const aiAPI = new AiAPI();
