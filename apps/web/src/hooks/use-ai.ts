'use client';

import { useCallback, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { aiAPI, type AiMessage, type ChatStreamEvent, type ExecutionTrace } from '@/lib/api/ai';

export const aiKeys = {
  all: ['ai'] as const,
  capabilities: () => [...aiKeys.all, 'capabilities'] as const,
  conversations: (params?: unknown) => [...aiKeys.all, 'conversations', params ?? {}] as const,
  conversation: (id: string) => [...aiKeys.all, 'conversation', id] as const,
  memory: () => [...aiKeys.all, 'memory'] as const,
};

export function useAiCapabilities() {
  return useQuery({
    queryKey: aiKeys.capabilities(),
    queryFn: () => aiAPI.capabilities(),
    // Depends on the deployment's provider config and the user's role, neither
    // of which changes within a session.
    staleTime: 5 * 60 * 1000,
  });
}

export function useAiConversations(params: { search?: string; status?: string; limit?: number } = {}) {
  return useQuery({
    queryKey: aiKeys.conversations(params),
    queryFn: () => aiAPI.listConversations(params),
  });
}

export function useAiConversation(id: string | null) {
  return useQuery({
    queryKey: aiKeys.conversation(id ?? ''),
    queryFn: () => aiAPI.getConversation(id!),
    enabled: !!id,
  });
}

export function useCreateConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { title?: string; model?: string; readOnly?: boolean } = {}) => aiAPI.createConversation(params),
    onSuccess: () => void qc.invalidateQueries({ queryKey: aiKeys.all }),
  });
}

export function useConversationActions() {
  const qc = useQueryClient();
  const invalidate = () => void qc.invalidateQueries({ queryKey: aiKeys.all });

  return {
    rename: useMutation({
      mutationFn: ({ id, title }: { id: string; title: string }) => aiAPI.rename(id, title),
      onSuccess: invalidate,
    }),
    pin: useMutation({
      mutationFn: ({ id, pinned }: { id: string; pinned: boolean }) => aiAPI.setPinned(id, pinned),
      onSuccess: invalidate,
    }),
    archive: useMutation({
      mutationFn: ({ id, status }: { id: string; status: 'ACTIVE' | 'ARCHIVED' }) =>
        aiAPI.setStatus(id, status),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) => aiAPI.remove(id),
      onSuccess: invalidate,
    }),
  };
}

/// A turn in flight, assembled from the stream.
export interface StreamingTurn {
  text: string;
  /// Tools the assistant is running or has run, in order, so the UI can show
  /// "Searching customers…" instead of an unexplained pause. A tool call can
  /// take seconds, and silence during it reads as a hang.
  tools: Array<{ name: string; status: 'running' | 'done' | 'failed'; durationMs?: number }>;
  /// Execution trace, available when the turn completes.
  trace: ExecutionTrace | null;
  /// Set when the AI requests user confirmation before a dangerous action.
  confirmationRequired: { action: string; details: Record<string, unknown> } | null;
}

/// Drives one streamed turn.
///
/// Owns the AbortController so Stop can abort the request itself, not merely
/// hide the output — the tokens are billed either way, and the server's
/// `res.on('close')` turns the abort into a real provider cancellation.
export function useChatStream(conversationId: string | null) {
  const qc = useQueryClient();
  const [streaming, setStreaming] = useState(false);
  const [turn, setTurn] = useState<StreamingTurn>({ text: '', tools: [], trace: null, confirmationRequired: null });
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const send = useCallback(
    async (message: string) => {
      if (!conversationId || streaming) return;

      setStreaming(true);
      setError(null);
      setTurn({ text: '', tools: [], trace: null, confirmationRequired: null });

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        for await (const event of aiAPI.streamChat(conversationId, message, controller.signal)) {
          applyEvent(event, setTurn, setError);
          if (event.type === 'done' || event.type === 'error') break;
        }
      } catch (err) {
        // An abort is the user pressing Stop, not a failure.
        if (!(err instanceof DOMException && err.name === 'AbortError')) {
          setError(err instanceof Error ? err.message : 'The assistant failed unexpectedly.');
        }
      } finally {
        setStreaming(false);
        abortRef.current = null;
        // Refetch so the turn is replaced by the persisted messages — including
        // anything the optimistic stream did not carry (token counts, tool
        // metadata, the server's own filtering).
        void qc.invalidateQueries({ queryKey: aiKeys.conversation(conversationId) });
        void qc.invalidateQueries({ queryKey: aiKeys.conversations() });
        setTurn({ text: '', tools: [], trace: null, confirmationRequired: null });
      }
    },
    [conversationId, streaming, qc],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    // Tell the server too: aborting the fetch closes our end, but the explicit
    // call is what stops the provider request deterministically rather than
    // relying on the socket-close handler winning the race.
    if (conversationId) void aiAPI.cancel(conversationId).catch(() => undefined);
  }, [conversationId]);

  return { send, stop, streaming, turn, error };
}

function applyEvent(
  event: ChatStreamEvent,
  setTurn: React.Dispatch<React.SetStateAction<StreamingTurn>>,
  setError: (message: string) => void,
): void {
  switch (event.type) {
    case 'text':
      setTurn((prev) => ({ ...prev, text: prev.text + event.text }));
      break;
    case 'tool_start':
      setTurn((prev) => ({ ...prev, tools: [...prev.tools, { name: event.name, status: 'running' }] }));
      break;
    case 'tool_end':
      setTurn((prev) => ({
        ...prev,
        tools: prev.tools.map((t, i) =>
          i === lastIndexOf(prev.tools, event.name)
            ? { ...t, status: event.status === 'SUCCEEDED' ? 'done' : 'failed', durationMs: event.durationMs }
            : t,
        ),
      }));
      break;
    case 'confirmation_required':
      setTurn((prev) => ({
        ...prev,
        confirmationRequired: { action: event.action, details: event.details },
      }));
      break;
    case 'done':
      setTurn((prev) => ({ ...prev, trace: event.trace }));
      break;
    case 'error':
      setError(event.message);
      break;
  }
}

function lastIndexOf(tools: StreamingTurn['tools'], name: string): number {
  for (let i = tools.length - 1; i >= 0; i--) {
    if (tools[i].name === name && tools[i].status === 'running') return i;
  }
  return -1;
}

export function useAiMemory() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: aiKeys.memory(), queryFn: () => aiAPI.listMemory() });

  const forget = useMutation({
    mutationFn: (id: string) => aiAPI.forget(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: aiKeys.memory() }),
  });

  const remember = useMutation({
    mutationFn: ({ kind, content }: { kind: 'PINNED' | 'PREFERENCE'; content: string }) =>
      aiAPI.remember(kind, content),
    onSuccess: () => void qc.invalidateQueries({ queryKey: aiKeys.memory() }),
  });

  return { items: query.data?.items ?? [], loading: query.isPending, forget, remember };
}

export type { AiMessage };
