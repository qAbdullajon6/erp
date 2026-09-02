'use client';

import { useEffect, useState } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { Bell } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState, EmptyState, ListSkeleton } from '@/components/shared/list-states';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
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

  /// Preferences used to be appended below the notification list, so the way to
  /// change how you are notified was to scroll past a paginated inbox. They are
  /// a peer of the inbox, not a footnote to it.
  const tab = isAdmin && routeSearch.tab === 'preferences' ? 'preferences' : 'inbox';
  const setTab = (next: string) =>
    void navigate({
      search: (prev) => ({ ...prev, tab: next === 'preferences' ? 'preferences' : undefined }),
    });

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

  /// Only an admin sees a choice; for everyone else the inbox is the screen.
  const tabStrip = isAdmin ? (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList>
        <TabsTrigger value="inbox">Inbox</TabsTrigger>
        <TabsTrigger value="preferences">Preferences</TabsTrigger>
      </TabsList>
    </Tabs>
  ) : null;

  /// Preferences do not depend on the notification query, so they render while
  /// it is still loading — and still render if it failed.
  if (tab === 'preferences') {
    return (
      <div className="space-y-6">
        <PageHeader title="Notifications" subtitle="How this workspace gets notified" />
        {tabStrip}
        <NotificationPreferences />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Notifications" />
        {tabStrip}
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <ListSkeleton rows={6} label="Loading notifications" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Notifications" />
        {tabStrip}
        <ErrorState message={describeError(error, 'Failed to load notifications')} onRetry={() => refetch()} />
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

      {tabStrip}

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
    </div>
  );
}
