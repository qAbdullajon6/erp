'use client';

import { useEffect, useState } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { Bell } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/page-header';
import { LoadingState, ErrorState, EmptyState } from '@/components/shared/list-states';
import { Button } from '@/components/ui/button';
import { describeError } from '@/lib/api/describe-error';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';
import { useNotifications, useMarkAllAsRead } from '@/lib/api/notification-center';
import { NotificationFilters } from './notification-filters';
import { NotificationList } from './notification-list';
import { NotificationActions } from './notification-actions';
import { useCurrentUser } from '@/lib/api/auth';
import { NotificationPreferences } from './notification-preferences';
import type { NotificationCategory, NotificationSeverity } from '@/lib/api/notifications';

export function NotificationsView() {
  const { data: currentUser } = useCurrentUser();
  const isAdmin = currentUser?.membership.role === 'ADMIN';

  const routeSearch = useSearch({ from: '/app/notifications' });
  const navigate = useNavigate({ from: '/app/notifications' });

  const search = routeSearch.search ?? '';
  const category = routeSearch.category;
  const severity = routeSearch.severity;
  const isRead = routeSearch.isRead;
  const isArchived = routeSearch.isArchived ?? false;
  const page = routeSearch.page ?? 1;

  // The input must respond to every keystroke; the URL (and the query it
  // drives) must not — pushing a navigation per character races the async
  // route update against the next keystroke and drops most of what was
  // typed. Same fix as CustomersList: buffer locally, debounce, then sync.
  const [localSearch, setLocalSearch] = useState(search);
  useEffect(() => {
    setLocalSearch(search);
  }, [search]);
  const debouncedSearch = useDebouncedValue(localSearch, 300);
  useEffect(() => {
    if (debouncedSearch === search) return;
    void navigate({ search: (prev) => ({ ...prev, search: debouncedSearch || undefined, page: undefined }) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const setCategory = (value?: NotificationCategory) =>
    void navigate({ search: (prev) => ({ ...prev, category: value, page: undefined }) });
  const setSeverity = (value?: NotificationSeverity) =>
    void navigate({ search: (prev) => ({ ...prev, severity: value, page: undefined }) });
  const setIsRead = (value?: boolean) =>
    void navigate({ search: (prev) => ({ ...prev, isRead: value, page: undefined }) });
  const setIsArchived = (value: boolean) =>
    void navigate({ search: (prev) => ({ ...prev, isArchived: value || undefined, page: undefined }) });
  const setPage = (value: number) =>
    void navigate({ search: (prev) => ({ ...prev, page: value === 1 ? undefined : value }) });

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
    try {
      await markAllAsReadMutation.mutateAsync();
      setSelectedIds(new Set());
    } catch (err) {
      toast.error(describeError(err, 'Failed to mark all as read'));
    }
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
        search={localSearch}
        category={category}
        severity={severity}
        isRead={isRead}
        isArchived={isArchived}
        onSearchChange={setLocalSearch}
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

      {isAdmin && (
        <div className="border-t border-brand/10 pt-6">
          <NotificationPreferences />
        </div>
      )}
    </div>
  );
}
