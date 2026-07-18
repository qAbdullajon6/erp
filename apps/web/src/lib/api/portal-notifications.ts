import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { portalFetch } from './portal-fetch';
import { unwrapResponse as unwrap } from './error';
import { portalNotificationKeys } from './portal-query-keys';

export interface PortalNotification {
  key: string;
  type: 'ORDER' | 'INVOICE';
  title: string;
  message: string;
  entityType: string;
  entityId: string;
  createdAt: string;
  isRead: boolean;
}

export interface ListPortalNotificationsResponse {
  items: PortalNotification[];
}

export interface UnreadCountResponse {
  unreadCount: number;
}

function buildQuery(params: object): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params) as [string, unknown][]) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

class PortalNotificationsAPI {
  private baseUrl = '/api/customer-portal/notifications';

  async list(limit = 50): Promise<ListPortalNotificationsResponse> {
    const response = await portalFetch(`${this.baseUrl}${buildQuery({ limit })}`, { method: 'GET' });
    return unwrap(response, 'Failed to fetch notifications');
  }

  async unreadCount(): Promise<UnreadCountResponse> {
    const response = await portalFetch(`${this.baseUrl}/unread-count`, { method: 'GET' });
    return unwrap(response, 'Failed to fetch unread count');
  }

  async markRead(key: string): Promise<void> {
    const response = await portalFetch(`${this.baseUrl}/${key}/read`, { method: 'POST' });
    await unwrap(response, 'Failed to mark notification as read');
  }

  async markAllRead(): Promise<void> {
    const response = await portalFetch(`${this.baseUrl}/read-all`, { method: 'POST' });
    await unwrap(response, 'Failed to mark all as read');
  }
}

export const portalNotificationsAPI = new PortalNotificationsAPI();

function invalidateAll(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: portalNotificationKeys.all });
}

export function usePortalNotificationsList(limit = 50) {
  return useQuery({
    queryKey: portalNotificationKeys.list({ limit }),
    queryFn: () => portalNotificationsAPI.list(limit),
  });
}

export function usePortalUnreadCount() {
  return useQuery({
    queryKey: portalNotificationKeys.unreadCount(),
    queryFn: () => portalNotificationsAPI.unreadCount(),
  });
}

export function usePortalMarkRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (key: string) => portalNotificationsAPI.markRead(key),
    onSuccess: () => invalidateAll(queryClient),
  });
}

export function usePortalMarkAllRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => portalNotificationsAPI.markAllRead(),
    onSuccess: () => invalidateAll(queryClient),
  });
}
