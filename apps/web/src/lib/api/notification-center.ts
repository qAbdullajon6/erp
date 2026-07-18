import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./fetch";
import { unwrapResponse } from "./error";
import type { Notification, NotificationCategory, NotificationSeverity } from "./notifications";

/// Notification Center client — the full-page management surface (list, filter,
/// bulk actions, preferences) backed by the `/notification-center` controller.
/// Uses the same `apiFetch` + `unwrapResponse` infrastructure as every other
/// client, and reuses the canonical Notification types from `./notifications`
/// so an item rendered here is the exact same shape the bell renders.
export type { Notification, NotificationCategory, NotificationSeverity } from "./notifications";

const BASE = "/api/notification-center";

export interface NotificationPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface NotificationListResult {
  notifications: Notification[];
  pagination: NotificationPagination;
}

export interface NotificationPreferences {
  emailEnabled: boolean;
  smsEnabled: boolean;
  pushEnabled: boolean;
  webhookEnabled: boolean;
  digestMode: boolean;
  digestTime?: number;
  quietHoursStart?: number;
  quietHoursEnd?: number;
  timezone: string;
  categoryPrefs: Record<
    string,
    { emailEnabled?: boolean; smsEnabled?: boolean; pushEnabled?: boolean }
  >;
}

export interface NotificationQuery {
  search?: string;
  category?: NotificationCategory;
  severity?: NotificationSeverity;
  isRead?: boolean;
  isArchived?: boolean;
  page?: number;
  limit?: number;
}

function buildQuery(query: NotificationQuery): string {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined) params.append(key, String(value));
  });
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

// ── Query keys ─────────────────────────────────────────────────────

export const notificationCenterKeys = {
  all: ["notification-center"] as const,
  list: (query: NotificationQuery) => [...notificationCenterKeys.all, "list", query] as const,
  unreadCount: () => [...notificationCenterKeys.all, "unread-count"] as const,
  preferences: () => [...notificationCenterKeys.all, "preferences"] as const,
};

// ── Queries ────────────────────────────────────────────────────────

export function useNotifications(query: NotificationQuery = {}) {
  return useQuery({
    queryKey: notificationCenterKeys.list(query),
    queryFn: async () => {
      const res = await apiFetch(`${BASE}/notifications${buildQuery(query)}`, { method: "GET" });
      return unwrapResponse<NotificationListResult>(res, "Failed to load notifications");
    },
    staleTime: 10_000,
  });
}

export function useUnreadCount() {
  return useQuery({
    queryKey: notificationCenterKeys.unreadCount(),
    queryFn: async () => {
      const res = await apiFetch(`${BASE}/notifications/unread-count`, { method: "GET" });
      return unwrapResponse<{ count: number }>(res, "Failed to load unread count");
    },
    staleTime: 5_000,
    refetchInterval: 30_000,
  });
}

export function useNotificationPreferences() {
  return useQuery({
    queryKey: notificationCenterKeys.preferences(),
    queryFn: async () => {
      const res = await apiFetch(`${BASE}/preferences`, { method: "GET" });
      return unwrapResponse<NotificationPreferences>(res, "Failed to load notification preferences");
    },
  });
}

// ── Mutations ──────────────────────────────────────────────────────

/// Any notification mutation can change the list, the unread badge, or both, so
/// each invalidates the whole notification-center root.
function useInvalidateNotifications() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: notificationCenterKeys.all });
}

function usePost(path: (id: string) => string, fallback: string) {
  const invalidate = useInvalidateNotifications();
  return useMutation({
    mutationFn: async (notificationId: string) => {
      const res = await apiFetch(`${BASE}${path(notificationId)}`, { method: "POST" });
      await unwrapResponse<{ success: boolean }>(res, fallback);
    },
    onSuccess: () => invalidate(),
  });
}

export function useMarkAsRead() {
  return usePost((id) => `/notifications/${id}/read`, "Failed to mark as read");
}

export function useMarkAsUnread() {
  return usePost((id) => `/notifications/${id}/unread`, "Failed to mark as unread");
}

export function useArchiveNotification() {
  return usePost((id) => `/notifications/${id}/archive`, "Failed to archive notification");
}

export function useDeleteNotification() {
  const invalidate = useInvalidateNotifications();
  return useMutation({
    mutationFn: async (notificationId: string) => {
      const res = await apiFetch(`${BASE}/notifications/${notificationId}`, { method: "DELETE" });
      await unwrapResponse<{ success: boolean }>(res, "Failed to delete notification");
    },
    onSuccess: () => invalidate(),
  });
}

function useBulk(path: string, fallback: string) {
  const invalidate = useInvalidateNotifications();
  return useMutation({
    mutationFn: async (notificationIds: string[]) => {
      const res = await apiFetch(`${BASE}${path}`, {
        method: "POST",
        body: JSON.stringify({ notificationIds }),
      });
      await unwrapResponse<{ success: boolean }>(res, fallback);
    },
    onSuccess: () => invalidate(),
  });
}

export function useBulkMarkAsRead() {
  return useBulk("/notifications/bulk-read", "Failed to mark selected as read");
}

export function useBulkArchive() {
  return useBulk("/notifications/bulk-archive", "Failed to archive selected");
}

export function useMarkAllAsRead() {
  const invalidate = useInvalidateNotifications();
  return useMutation({
    mutationFn: async () => {
      const res = await apiFetch(`${BASE}/notifications/mark-all-read`, { method: "POST" });
      await unwrapResponse<{ success: boolean }>(res, "Failed to mark all as read");
    },
    onSuccess: () => invalidate(),
  });
}

export function useUpdatePreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (updates: Partial<NotificationPreferences>) => {
      const res = await apiFetch(`${BASE}/preferences`, {
        method: "PATCH",
        body: JSON.stringify(updates),
      });
      return unwrapResponse<NotificationPreferences>(res, "Failed to update preferences");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: notificationCenterKeys.preferences() }),
  });
}
