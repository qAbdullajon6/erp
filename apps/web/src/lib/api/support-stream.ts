/**
 * useSupportStream — real-time staff reply delivery via SSE.
 *
 * Connects to GET /api/support/events (authenticated fetch+ReadableStream,
 * same pattern as /tracking/live-stream and the AI streaming endpoint).
 * Never uses EventSource because EventSource cannot send an Authorization header.
 *
 * On new "support.message.created" events:
 *   1. Appends the message to the cached ticket detail (if loaded), preventing
 *      a full re-fetch while giving an immediate optimistic update.
 *   2. Updates the ticket list item's updatedAt so the list re-orders correctly.
 *   3. Increments the unread count only when the arrived ticket is not the
 *      currently open ticket (so "reading it now" doesn't flicker unread).
 *
 * Reconnects with truncated binary backoff (1 s → 2 s → 4 s → … → 30 s max).
 */

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { sessionManager } from './session';
import { supportKeys, type SupportTicket, type TicketMessage } from './support';

export interface SupportRealtimeEvent {
  type: 'support.message.created';
  ticketId: string;
  message: {
    id: string;
    ticketId: string;
    isStaff: boolean;
    body: string;
    createdAt: string;
    /** Staff author is intentionally null — staff identity is platform-internal. */
    author: null;
  };
}

const SSE_URL = '/api/support/events';
const BASE_DELAY_MS = 1_000;
const MAX_DELAY_MS = 30_000;

function backoffDelay(attempt: number): number {
  return Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS);
}

interface UseSupportStreamOptions {
  /** When true the hook establishes the connection. Pass false when the user
   *  is not authenticated or does not have a role that allows support. */
  enabled: boolean;
  /** ID of the ticket currently open in the drawer, or null. Used to decide
   *  whether to increment the unread count when a new message arrives. */
  openTicketId: string | null;
}

export function useSupportStream({ enabled, openTicketId }: UseSupportStreamOptions): void {
  const qc = useQueryClient();
  // Keep a stable ref so the effect closure always reads the latest value
  // without re-running the effect (and restarting the connection).
  const openTicketIdRef = useRef(openTicketId);
  openTicketIdRef.current = openTicketId;

  useEffect(() => {
    if (!enabled) return;

    let stopped = false;
    let attempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    const controller = new AbortController();

    const handleEvent = (event: SupportRealtimeEvent) => {
      if (event.type !== 'support.message.created') return;
      const { ticketId, message } = event;

      // 1. Update the cached ticket detail if it's loaded — append the message,
      //    deduplicated by id. This is the primary "realtime" UX benefit.
      qc.setQueryData<SupportTicket>(supportKeys.ticket(ticketId), (old) => {
        if (!old) return old; // not cached — no-op
        const existing = old.messages ?? [];
        if (existing.some((m: TicketMessage) => m.id === message.id)) return old; // deduplicate
        return {
          ...old,
          updatedAt: message.createdAt,
          messages: [
            ...existing,
            {
              id: message.id,
              ticketId: message.ticketId,
              authorId: null,
              isStaff: message.isStaff,
              body: message.body,
              createdAt: message.createdAt,
              // Staff author is null in realtime events — identity is platform-internal.
              author: null,
            } satisfies TicketMessage,
          ],
        };
      });

      // 2. Bump the ticket in the list so it re-orders by updatedAt.
      qc.setQueryData<{ items: SupportTicket[]; meta: unknown }>(
        supportKeys.list(),
        (old) => {
          if (!old) return old;
          return {
            ...old,
            items: old.items.map((t) =>
              t.id === ticketId ? { ...t, updatedAt: message.createdAt } : t,
            ),
          };
        },
      );

      // 3. Refresh unread count when the message is for a ticket other than
      //    the one currently open (which is already "being read").
      if (openTicketIdRef.current !== ticketId) {
        void qc.invalidateQueries({ queryKey: [...supportKeys.all, 'unread-count'] });
      }
    };

    const connect = async () => {
      if (stopped || controller.signal.aborted) return;

      const token = sessionManager.getAccessToken();
      let response: Response;
      try {
        response = await fetch(SSE_URL, {
          method: 'GET',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: controller.signal,
        });
      } catch (err) {
        if (controller.signal.aborted || stopped) return;
        // Network / abort error — reconnect with backoff.
        scheduleReconnect();
        return;
      }

      if (!response.ok || !response.body) {
        // 401/403 → authentication lost; no retry to avoid hammering.
        if (response.status === 401 || response.status === 403) return;
        if (controller.signal.aborted || stopped) return;
        scheduleReconnect();
        return;
      }

      // Stream is open — reset backoff attempt counter.
      attempt = 0;

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buf = '';

      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });

          let boundary = buf.indexOf('\n\n');
          while (boundary !== -1) {
            const frame = buf.slice(0, boundary);
            buf = buf.slice(boundary + 2);
            for (const line of frame.split('\n')) {
              if (!line.startsWith('data:')) continue; // ignore ": keep-alive"
              const raw = line.slice(5).trim();
              if (!raw) continue;
              try {
                const parsed = JSON.parse(raw) as SupportRealtimeEvent;
                handleEvent(parsed);
              } catch {
                // Malformed frame — keep the stream alive.
              }
            }
            boundary = buf.indexOf('\n\n');
          }
        }
      } catch {
        // read() threw (e.g. abort) — handled below.
      } finally {
        reader.releaseLock();
      }

      if (controller.signal.aborted || stopped) return;
      // Stream ended unexpectedly — reconnect.
      scheduleReconnect();
    };

    const scheduleReconnect = () => {
      if (stopped || controller.signal.aborted) return;
      const delay = backoffDelay(attempt);
      attempt += 1;
      reconnectTimer = setTimeout(() => { void connect(); }, delay);
    };

    void connect();

    return () => {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      controller.abort();
    };
  }, [enabled, qc]);
}
