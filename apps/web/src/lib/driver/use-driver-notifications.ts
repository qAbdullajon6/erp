'use client';

import { useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  driverWorkspaceAPI,
  driverWorkspaceKeys,
  useDriverInboxNotificationsQuery,
} from '@/lib/api/driver-workspace';
import { isDriverRelevantNotificationType } from './notification-types';

export function useDriverNotifications(enabled = true) {
  const query = useDriverInboxNotificationsQuery(enabled);
  const queryClient = useQueryClient();

  const items = useMemo(() => {
    const raw = query.data?.items ?? [];
    return raw.filter((n) => isDriverRelevantNotificationType(n.type) || n.type === 'DRIVER_NEW_ASSIGNMENT');
  }, [query.data?.items]);

  const markRead = useMutation({
    mutationFn: (id: string) => driverWorkspaceAPI.markNotificationRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: driverWorkspaceKeys.notifications() }),
  });

  return {
    ...query,
    items,
    unreadCount: items.filter((n) => !n.isRead).length,
    markRead,
  };
}
