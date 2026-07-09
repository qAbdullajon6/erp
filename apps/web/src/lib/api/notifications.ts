import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './fetch';

export type NotificationCategory = 'OPERATIONS' | 'FINANCE' | 'CUSTOMERS' | 'FLEET';
export type NotificationSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface Notification {
  id: string;
  organizationId: string;
  type: string;
  category: NotificationCategory;
  severity: NotificationSeverity;
  title: string;
  message: string;
  entityType: string | null;
  entityId: string | null;
  isRead: boolean;
  readAt: string | null;
  isArchived: boolean;
  archivedAt: string | null;
  createdAt: string;
  metadata: Record<string, unknown> | null;
}

export interface ListNotificationsResponse {
  items: Notification[];
  meta: { page: number; limit: number; total: number; totalPages: number };
  unreadCount: number;
}

export interface ListNotificationsParams {
  page?: number;
  limit?: number;
  category?: NotificationCategory;
  severity?: NotificationSeverity;
  isRead?: boolean;
  isArchived?: boolean;
  sortBy?: 'createdAt' | 'severity';
  sortOrder?: 'asc' | 'desc';
}

export interface NotificationSettings {
  enabledCategories: NotificationCategory[];
  invoiceDueSoonDays: number;
  creditLimitWarningPercent: number;
  expiryWarningDays: number;
  lowSeverityEnabled: boolean;
  updatedAt: string;
}

export interface UpdateNotificationSettingsInput {
  enabledCategories?: NotificationCategory[];
  invoiceDueSoonDays?: number;
  creditLimitWarningPercent?: number;
  expiryWarningDays?: number;
  lowSeverityEnabled?: boolean;
}

function buildQuery(params: object): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params) as [string, unknown][]) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

async function unwrap<T>(response: Response, fallbackMessage: string): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || fallbackMessage);
  }
  const result = await response.json();
  return (result.data ?? result) as T;
}

class NotificationsAPI {
  async list(params: ListNotificationsParams = {}): Promise<ListNotificationsResponse> {
    const response = await apiFetch(`/api/notifications${buildQuery(params)}`, { method: 'GET' });
    return unwrap(response, 'Failed to fetch notifications');
  }

  async unreadCount(): Promise<{ unreadCount: number }> {
    const response = await apiFetch('/api/notifications/unread-count', { method: 'GET' });
    return unwrap(response, 'Failed to fetch unread count');
  }

  async getSettings(): Promise<NotificationSettings> {
    const response = await apiFetch('/api/notifications/settings', { method: 'GET' });
    return unwrap(response, 'Failed to fetch notification settings');
  }

  async updateSettings(input: UpdateNotificationSettingsInput): Promise<NotificationSettings> {
    const response = await apiFetch('/api/notifications/settings', { method: 'PATCH', body: JSON.stringify(input) });
    return unwrap(response, 'Failed to update notification settings');
  }

  async markRead(id: string): Promise<Notification> {
    const response = await apiFetch(`/api/notifications/${id}/read`, { method: 'POST' });
    return unwrap(response, 'Failed to mark notification as read');
  }

  async markUnread(id: string): Promise<Notification> {
    const response = await apiFetch(`/api/notifications/${id}/unread`, { method: 'POST' });
    return unwrap(response, 'Failed to mark notification as unread');
  }

  async archive(id: string): Promise<Notification> {
    const response = await apiFetch(`/api/notifications/${id}/archive`, { method: 'POST' });
    return unwrap(response, 'Failed to archive notification');
  }

  async readAll(): Promise<{ updatedCount: number }> {
    const response = await apiFetch('/api/notifications/read-all', { method: 'POST' });
    return unwrap(response, 'Failed to mark all as read');
  }

  async archiveAll(): Promise<{ updatedCount: number }> {
    const response = await apiFetch('/api/notifications/archive-all', { method: 'POST' });
    return unwrap(response, 'Failed to archive all');
  }
}

export const notificationsAPI = new NotificationsAPI();

/// Shared across the bell dropdown and the full /app/notifications page —
/// both must invalidate the same keys so a read/archive in one place is
/// reflected in the other immediately, per the "badge and list must never
/// drift apart" requirement.
export const notificationKeys = {
  all: ['notifications'] as const,
  lists: () => [...notificationKeys.all, 'list'] as const,
  list: (params: ListNotificationsParams) => [...notificationKeys.lists(), params] as const,
  unreadCount: () => [...notificationKeys.all, 'unread-count'] as const,
  settings: () => [...notificationKeys.all, 'settings'] as const,
};

function invalidateAllNotificationQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: notificationKeys.lists() });
  queryClient.invalidateQueries({ queryKey: notificationKeys.unreadCount() });
}

export function useNotificationsQuery(params: ListNotificationsParams = {}, enabled = true) {
  return useQuery({
    queryKey: notificationKeys.list(params),
    queryFn: () => notificationsAPI.list(params),
    enabled,
  });
}

export function useUnreadCountQuery(enabled = true) {
  return useQuery({
    queryKey: notificationKeys.unreadCount(),
    queryFn: () => notificationsAPI.unreadCount(),
    enabled,
    refetchInterval: enabled ? 60_000 : false,
  });
}

export function useNotificationSettingsQuery(enabled = true) {
  return useQuery({
    queryKey: notificationKeys.settings(),
    queryFn: () => notificationsAPI.getSettings(),
    enabled,
  });
}

export function useUpdateNotificationSettingsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateNotificationSettingsInput) => notificationsAPI.updateSettings(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: notificationKeys.settings() }),
  });
}

export function useMarkReadMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => notificationsAPI.markRead(id),
    onSuccess: () => invalidateAllNotificationQueries(queryClient),
  });
}

export function useMarkUnreadMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => notificationsAPI.markUnread(id),
    onSuccess: () => invalidateAllNotificationQueries(queryClient),
  });
}

export function useArchiveMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => notificationsAPI.archive(id),
    onSuccess: () => invalidateAllNotificationQueries(queryClient),
  });
}

export function useMarkAllReadMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => notificationsAPI.readAll(),
    onSuccess: () => invalidateAllNotificationQueries(queryClient),
  });
}

export function useArchiveAllMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => notificationsAPI.archiveAll(),
    onSuccess: () => invalidateAllNotificationQueries(queryClient),
  });
}
