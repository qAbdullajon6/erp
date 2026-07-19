'use client';

import { useState } from 'react';
import { Bell } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { LoadingState, ErrorState, EmptyState } from '@/components/shared/list-states';
import { Button } from '@/components/ui/button';
import { useNotifications, useMarkAllAsRead } from '@/lib/api/notification-center';
import { NotificationFilters } from './notification-filters';
import { NotificationList } from './notification-list';
import { NotificationActions } from './notification-actions';
import type { NotificationCategory, NotificationSeverity } from '@/lib/api/notifications';

export function NotificationsView() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<NotificationCategory | undefined>();
  const [severity, setSeverity] = useState<NotificationSeverity | undefined>();
  const [isRead, setIsRead] = useState<boolean | undefined>();
  const [isArchived, setIsArchived] = useState(false);
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { data, isLoading, error, refetch } = useNotifications({
    search: search || undefined,
    category,
    severity,
    isRead,
    isArchived,
    page,
    limit: 20,
  });

  const markAllAsReadMutation = useMarkAllAsRead();

  const handleMarkAllAsRead = async () => {
    await markAllAsReadMutation.mutateAsync();
    setSelectedIds(new Set());
  };

  const handleSelectAll = () => {
    if (!data?.notifications) return;
    if (selectedIds.size === data.notifications.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(data.notifications.map((n) => n.id)));
    }
  };

  const handleToggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Notifications" />
        <LoadingState label="Loading notifications..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Notifications" />
        <ErrorState
          message={error instanceof Error ? error.message : 'Failed to load notifications'}
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  const notifications = data?.notifications ?? [];
  const pagination = data?.pagination;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        subtitle={`${pagination?.total ?? 0} notification${pagination?.total === 1 ? '' : 's'}`}
        action={
          <Button onClick={handleMarkAllAsRead} variant="outline" size="sm">
            Mark All as Read
          </Button>
        }
      />

      <NotificationFilters
        search={search}
        category={category}
        severity={severity}
        isRead={isRead}
        isArchived={isArchived}
        onSearchChange={setSearch}
        onCategoryChange={setCategory}
        onSeverityChange={setSeverity}
        onIsReadChange={setIsRead}
        onIsArchivedChange={setIsArchived}
      />

      {selectedIds.size > 0 && (
        <NotificationActions
          selectedCount={selectedIds.size}
          selectedIds={Array.from(selectedIds)}
          onClearSelection={() => setSelectedIds(new Set())}
        />
      )}

      {notifications.length === 0 ? (
        <EmptyState
          title={isArchived ? 'No archived notifications' : 'No notifications'}
          description={
            search || category || severity !== undefined || isRead !== undefined
              ? 'Try adjusting your filters'
              : 'You have no notifications yet'
          }
          icon={Bell}
        />
      ) : (
        <NotificationList
          notifications={notifications}
          selectedIds={selectedIds}
          onSelectAll={handleSelectAll}
          onToggleSelect={handleToggleSelect}
          pagination={pagination}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}
