import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './fetch';
import { unwrapResponse } from './error';

// ─── Types ────────────────────────────────────────────────────────────────────

export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';

export interface TicketAuthor {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export interface TicketMessage {
  id: string;
  ticketId: string;
  authorId: string | null;
  isStaff: boolean;
  body: string;
  createdAt: string;
  author: TicketAuthor | null;
}

export interface SupportTicket {
  id: string;
  subject: string;
  status: TicketStatus;
  /// Set when staff asked "did this solve it?" — the drawer shows its
  /// confirmation prompt while this is non-null and the ticket is still open.
  resolutionRequestedAt: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  createdBy: TicketAuthor | null;
  _count?: { messages: number };
  messages?: TicketMessage[];
}

export interface TicketListResponse {
  items: SupportTicket[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

// ─── Query keys ───────────────────────────────────────────────────────────────

export const supportKeys = {
  all: ['support'] as const,
  list: () => [...supportKeys.all, 'list'] as const,
  ticket: (id: string) => [...supportKeys.all, 'ticket', id] as const,
};

// ─── API class ────────────────────────────────────────────────────────────────

class SupportAPI {
  private base = '/api/support/tickets';

  async listTickets(): Promise<TicketListResponse> {
    const res = await apiFetch(`${this.base}?limit=20`, { method: 'GET' });
    return unwrapResponse(res, 'Failed to load support tickets');
  }

  async getTicket(id: string): Promise<SupportTicket> {
    const res = await apiFetch(`${this.base}/${id}`, { method: 'GET' });
    return unwrapResponse(res, 'Failed to load ticket');
  }

  async createTicket(data: {
    subject: string;
    body: string;
  }): Promise<SupportTicket> {
    const res = await apiFetch(this.base, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return unwrapResponse(res, 'Failed to create ticket');
  }

  async addMessage(ticketId: string, body: string): Promise<TicketMessage> {
    const res = await apiFetch(`${this.base}/${ticketId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    });
    return unwrapResponse(res, 'Failed to send message');
  }

  async closeTicket(ticketId: string): Promise<{ id: string; status: TicketStatus }> {
    const res = await apiFetch(`${this.base}/${ticketId}/close`, {
      method: 'POST',
    });
    return unwrapResponse(res, 'Failed to close ticket');
  }

  /// Tenant confirms the staff answer solved it → chat CLOSED.
  async confirmResolution(ticketId: string): Promise<{ id: string; status: TicketStatus }> {
    const res = await apiFetch(`${this.base}/${ticketId}/confirm-resolution`, {
      method: 'POST',
    });
    return unwrapResponse(res, 'Failed to confirm resolution');
  }

  /// Tenant declines ("still have a question") → prompt withdrawn, the chat
  /// continues while OPEN.
  async declineResolution(
    ticketId: string,
  ): Promise<{ id: string; status: TicketStatus; resolutionRequestedAt: string | null }> {
    const res = await apiFetch(`${this.base}/${ticketId}/decline-resolution`, {
      method: 'POST',
    });
    return unwrapResponse(res, 'Failed to decline resolution');
  }

  async unreadCount(): Promise<{ unreadCount: number }> {
    const res = await apiFetch(`${this.base}/unread-count`, { method: 'GET' });
    return unwrapResponse(res, 'Failed to fetch unread count');
  }

  async markRead(ticketId: string): Promise<{ ok: boolean }> {
    const res = await apiFetch(`${this.base}/${ticketId}/read`, { method: 'POST' });
    return unwrapResponse(res, 'Failed to mark as read');
  }

  /** Upload a file attachment for a ticket. Returns { url, name, mime }. */
  async uploadAttachment(
    ticketId: string,
    file: File,
  ): Promise<{ url: string; name: string; mime: string; size: number }> {
    const form = new FormData();
    form.append('file', file);
    const res = await apiFetch(`${this.base}/${ticketId}/attachments`, {
      method: 'POST',
      body: form,
    });
    return unwrapResponse(res, 'Failed to upload attachment');
  }

  /** Server-side verified AI context summary for a ticket.
   *  Never send raw ticket data to the AI — always use this instead. */
  async getAiContext(ticketId: string): Promise<{ context: string }> {
    const res = await apiFetch(`${this.base}/${ticketId}/ai-context`, { method: 'GET' });
    return unwrapResponse(res, 'Failed to load AI context');
  }
}

export const supportAPI = new SupportAPI();

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useSupportTickets(enabled = true) {
  return useQuery({
    queryKey: supportKeys.list(),
    queryFn: () => supportAPI.listTickets(),
    enabled,
    staleTime: 30_000,
  });
}

export function useSupportTicket(id: string | null) {
  return useQuery({
    queryKey: supportKeys.ticket(id ?? ''),
    queryFn: () => supportAPI.getTicket(id!),
    enabled: !!id,
    staleTime: 10_000,
  });
}

export function useCreateTicketMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { subject: string; body: string }) =>
      supportAPI.createTicket(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: supportKeys.list() }),
  });
}

export function useAddMessageMutation(ticketId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => supportAPI.addMessage(ticketId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: supportKeys.ticket(ticketId) }),
  });
}

export function useSupportUnreadCount(enabled = true) {
  return useQuery({
    queryKey: [...supportKeys.all, 'unread-count'] as const,
    queryFn: () => supportAPI.unreadCount(),
    enabled,
    staleTime: 30_000,
    refetchInterval: 60_000, // poll every minute
  });
}

export function useMarkTicketReadMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ticketId: string) => supportAPI.markRead(ticketId),
    onSuccess: (_data, ticketId) => {
      qc.invalidateQueries({ queryKey: [...supportKeys.all, 'unread-count'] });
      qc.invalidateQueries({ queryKey: supportKeys.ticket(ticketId) });
    },
  });
}

export function useCloseTicketMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ticketId: string) => supportAPI.closeTicket(ticketId),
    onSuccess: (_data, ticketId) => {
      qc.invalidateQueries({ queryKey: supportKeys.ticket(ticketId) });
      qc.invalidateQueries({ queryKey: supportKeys.list() });
    },
  });
}

export function useUploadAttachmentMutation(ticketId: string) {
  return useMutation({
    mutationFn: (file: File) => supportAPI.uploadAttachment(ticketId, file),
  });
}

export function useConfirmResolutionMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ticketId: string) => supportAPI.confirmResolution(ticketId),
    onSuccess: (_data, ticketId) => {
      qc.invalidateQueries({ queryKey: supportKeys.ticket(ticketId) });
      qc.invalidateQueries({ queryKey: supportKeys.list() });
    },
  });
}

export function useDeclineResolutionMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ticketId: string) => supportAPI.declineResolution(ticketId),
    onSuccess: (_data, ticketId) => {
      qc.invalidateQueries({ queryKey: supportKeys.ticket(ticketId) });
    },
  });
}

// ─── Display helpers ──────────────────────────────────────────────────────────

export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In progress',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
};

export function ticketStatusVariant(
  status: TicketStatus,
): 'default' | 'secondary' | 'success' | 'muted' | 'warning' | 'destructive' {
  switch (status) {
    case 'OPEN':        return 'default';
    case 'IN_PROGRESS': return 'warning';
    case 'RESOLVED':    return 'success';
    case 'CLOSED':      return 'muted';
  }
}

export function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function getInitials(firstName: string, lastName: string): string {
  return `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase();
}
